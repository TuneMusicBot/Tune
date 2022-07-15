/* eslint-disable @typescript-eslint/no-non-null-asserted-optional-chain */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import WebSocket, { RawData } from "ws";
import crypto from "crypto";
import { APIUser, Snowflake } from "discord.js";
import { IncomingMessage, IncomingHttpHeaders } from "http";
import undici from "undici";
import { HttpMethod } from "undici/types/dispatcher";
import { DiscordSnowflake } from "@sapphire/snowflake";
import { ConnectionStates, ConnectTypes } from "./Connection";
import Package from "../../package.json";
import { Tune } from "../Tune";
import {
  AllEvents,
  BaseLoadTrackPayload,
  NodeOptions,
  NodeVersions,
  NodeVersionsWithGit,
  PlayerEvents,
  StatsData,
  TrackInfo,
  WebSocketLoadTracksPayload,
} from "../@types/lavalink";

const buildVersions = (
  headers: IncomingHttpHeaders
): NodeVersions | NodeVersionsWithGit => {
  const versions = {
    api: headers["lavalink-api-version"] as string,
    main: headers["lavalink-version"] as string,
    spring: headers["lavalink-spring-version"] as string,
    build: headers["lavalink-build"] as string,
    lavaplayer: headers["lavalink-lavaplayer-version"] as string,
    lavadsp: headers["lavalink-lavadsp-version"] as string,
    jvm: headers["lavalink-java-version"] as string,
    kotlin: headers["lavalink-kotlin-version"] as string,
    buildTime: new Date(headers["lavalink-build-time"] as string),
    gitLoaded: Boolean(headers["lavalink-gitloaded"]),
  };

  if (versions.gitLoaded)
    Object.assign(versions, {
      commit: headers["lavalink-commit"] as string,
      commitTime: new Date(headers["lavalink-commit-time"] as string),
      branch: headers["lavalink-branch"],
    });

  return versions.gitLoaded
    ? (versions as NodeVersionsWithGit)
    : (versions as NodeVersions);
};

// eslint-disable-next-line no-shadow
export enum NodeStates {
  CONNECTED,
  CONNECTING,
  DISCONNECTED,
  IDLE,
  RESUMING,
}

interface QueueData {
  resolve(value: boolean): void;
  reject(value: string | Error): void;
  packet: any;
}

interface DecodedTrack {
  user: Partial<
    Omit<
      APIUser,
      "email" | "verified" | "flags" | "mfa_enabled" | "premium_type" | "locale"
    >
  > & { id: Snowflake };
  track: string;
  info: TrackInfo;
}

interface LoadTrackPayload {
  user: { id: string };
  identifier: string;
  nonce: string;
  resolve(value: WebSocketLoadTracksPayload<BaseLoadTrackPayload>): void;
}

export class Node {
  public readonly id: number;
  public readonly url: string;
  public readonly password: string;
  public readonly wsSecure: boolean;
  public readonly restSecure: boolean;
  public readonly region: string;

  public state: NodeStates = NodeStates.IDLE;

  public versions?: NodeVersions | NodeVersionsWithGit;
  public stats?: StatsData;

  private readonly resumeKey: string = crypto.randomBytes(30).toString("hex");
  private readonly client: Tune;
  private ws?: WebSocket;
  private resumable = false;

  private pingSentAt?: number;
  private pingReceiveAt?: number;

  private pingInterval?: NodeJS.Timer;

  private readonly queue: Array<QueueData> = [];
  private readonly loadingTracks: Array<LoadTrackPayload> = [];

  constructor(id: number, options: NodeOptions, client: Tune) {
    this.id = id;
    this.url = options.url;
    this.password = options.password;
    this.wsSecure = options.wsSecure;
    this.restSecure = options.restSecure;
    this.region = options.region;

    this.client = client;
  }

  get penalties() {
    const stats = this.stats as StatsData;
    const cpuPenalty = 1.05 ** (100 * stats.cpu.systemLoad) * 10 - 10;

    let deficitFramePenalty = 0;
    let nullFramePenalty = 0;

    if (stats.frameStats) {
      deficitFramePenalty =
        1.03 ** ((500 * stats.frameStats.deficit) / 3000) * 600 - 600;
      nullFramePenalty =
        1.03 ** ((500 * stats.frameStats.nulled) / 3000) * 300 - 300;
      nullFramePenalty *= 2;
    }

    return ~~(
      cpuPenalty +
      deficitFramePenalty +
      nullFramePenalty +
      stats.playingPlayers
    );
  }

  get ping() {
    return this.pingReceiveAt && this.pingSentAt
      ? this.pingReceiveAt - this.pingSentAt
      : -1;
  }

  private makeRequest<T>(
    method: HttpMethod,
    endpoint: string,
    body?: Record<string, unknown> | Array<unknown>
  ): Promise<T> {
    return undici
      .request(`http${this.restSecure ? "s" : ""}://${this.url}${endpoint}`, {
        method,
        headers: {
          authorization: this.password,
          "content-type": "application/json",
        },
        body: body ? JSON.stringify(body) : null,
        maxRedirections: 5,
      })
      .then((r) => r.body.json());
  }

  public loadTracks(
    identifier: string,
    user: { id: string },
    socket = false
  ): Promise<BaseLoadTrackPayload> {
    if (!socket)
      return this.makeRequest<BaseLoadTrackPayload>("POST", "/loadtracks", {
        identifier,
        user,
      }).catch((error) => ({
        loadType: "LOAD_FAILED",
        tracks: [],
        playlistInfo: undefined,
        user,
        identifier,
        exception: {
          message: error?.message ?? String(error),
          cause: error?.stack ?? String(error),
          severity: "SUSPICIOUS",
        },
      }));
    return this.loadTrackss(identifier, user);
  }

  public decodeTrack(track: string) {
    return this.makeRequest<TrackInfo & { user: unknown }>(
      "GET",
      `/decodetrack?track=${encodeURIComponent(track)}`
    );
  }

  public decodeTracks(tracks: string[]): Promise<DecodedTrack[]> {
    return this.makeRequest<DecodedTrack[]>("POST", "/decodetracks", tracks);
  }

  private loadTrackss(
    identifier: string,
    user: { id: string }
  ): Promise<BaseLoadTrackPayload> {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve) => {
      const nonce = DiscordSnowflake.generate().toString();
      this.loadingTracks.push({ nonce, user, identifier, resolve });
      const awaitable = await this.send({
        op: "loadTracks",
        identifier,
        user,
        nonce,
      }).catch((error) => {
        resolve({
          loadType: "LOAD_FAILED",
          tracks: [],
          playlistInfo: undefined,
          user,
          identifier,
          exception: {
            message: error?.message ?? String(error),
            cause: error?.stack ?? String(error),
            severity: "SUSPICIOUS",
          },
        });
        return false;
      });
      if (!awaitable)
        this.loadingTracks.splice(
          this.loadingTracks.findIndex(({ nonce: n }) => n === nonce),
          1
        );
    });
  }

  public connect() {
    if (this.state === NodeStates.CONNECTED)
      throw new Error("Node already connected.");
    if (this.state === NodeStates.CONNECTING)
      throw new Error("Node already connecting.");

    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      this.ws.removeAllListeners();
      this.ws.close(4000, "Overwrite socket.");
      this.ws = undefined;
    }
    return new Promise((resolve, reject) => {
      const headers = {
        Authorization: this.password,
        "User-Id": process.env.DISCORD_CLIENT_ID,
        "Client-Name": `Tune ${Package.version}`,
        "User-Agent": `Websocket ${Package.dependencies.ws}`,
      };
      if (this.state === NodeStates.RESUMING)
        Object.assign(headers, { "Resume-Key": this.resumeKey });

      this.ws = new WebSocket(`ws${this.wsSecure ? "s" : ""}://${this.url}/`, {
        headers,
        followRedirects: true,
      });

      let responded = false;

      this.ws
        .once("upgrade", this.onUpgrade.bind(this))
        .once("open", (...args) => {
          if (!responded) {
            responded = true;
            resolve(true);
          }
          return this.onOpen(...args);
        })
        .once("close", (...args) => {
          if (!responded) {
            responded = true;
            reject(args[0]);
          }
          return this.onClose(...args);
        })
        .on("message", this.onMessage.bind(this))
        .on("error", (error) => {
          if (!responded) {
            responded = true;
            reject(error);
          }
          return this.onError(error);
        });
    });
  }

  public send(packet: any): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (this.state !== NodeStates.CONNECTED)
        // eslint-disable-next-line no-promise-executor-return
        return this.queue.push({ resolve, reject, packet });
      // eslint-disable-next-line no-promise-executor-return
      return this.ws?.send(JSON.stringify(packet), (error) => {
        if (error) {
          this.client.logger.error(error as any, {
            error,
            tags: ["Music", `Node ${this.id}`],
          });
          return reject(error);
        }
        return resolve(true);
      });
    });
  }

  public processQueue(data: QueueData) {
    return this.ws?.send(JSON.parse(data.packet), (error) => {
      if (error) {
        this.client.logger.error(error as any, {
          error,
          tags: ["Music", `Node ${this.id}`],
        });
        return data.reject(error);
      }
      return data.resolve(true);
    });
  }

  private makePing() {
    this.pingSentAt = Date.now();
    return this.send({ op: "ping" });
  }

  private async onOpen() {
    this.state = NodeStates.CONNECTED;
    this.client.logger.info("Node connected.", {
      tags: ["Music", `Node ${this.id}`],
    });
    if (this.queue.length > 0) {
      const packets = this.queue.splice(0);
      packets.map(this.processQueue.bind(this));
    }
    if (!this.resumable)
      this.resumable = await this.send({
        op: "configureResuming",
        key: this.resumeKey,
        timeout: 300,
      }).catch(() => false);
    this.pingInterval = setInterval(this.makePing.bind(this), 5000);
  }

  private onClose(code: number, reason?: Buffer) {
    clearInterval(this.pingInterval);
    this.state = this.resumable ? NodeStates.RESUMING : NodeStates.DISCONNECTED;
    this.ws?.removeAllListeners();
    this.ws = undefined;
    let time = 30000;
    const codeReason = reason?.toString() ?? null;
    if (code !== 1006) {
      let text = "Node disconnected.";
      if (this.resumable) text += " But is resumable.";
      text += ` Close code: ${code}`;
      if (codeReason)
        text += `, and reason ${codeReason.endsWith(".") ? "" : "."}`;
      this.client.logger.info(!text.endsWith(".") ? `${text}.` : text, {
        tags: ["Music", `Node ${this.id}`],
      });
      time = 0;
    }
    return setTimeout(this.connect.bind(this), time);
  }

  private onMessage(packet: RawData) {
    const json = JSON.parse(packet.toString());
    if (!json.op)
      return this.client.logger.debug("Received an invalid packet.", {
        tags: ["Music", `Node ${this.id}`],
      });
    const data = json as AllEvents;

    switch (data.op) {
      case "event":
        return this.handleEvent(data);
      case "stats": {
        const clone = Object.create(data);
        delete clone.op;
        this.stats = clone as StatsData;
        break;
      }
      case "pong": {
        this.pingReceiveAt = Date.now();
        break;
      }
      case "loadTracks": {
        const index = this.loadingTracks.findIndex(
          ({ nonce }) => nonce === data.nonce
        );
        if (index === -1)
          return this.client.logger.info(
            `Unknown loadTracks sent ${data.identifier}`,
            { tags: ["Music", `Node ${this.id}`] }
          );
        this.loadingTracks.splice(index, 1)[0].resolve(data);
        break;
      }
    }
    return Promise.resolve();
  }

  private onError(error: Error) {
    this.client.logger.error(error as any, {
      error,
      tags: ["Music", `Node ${this.id}`],
    });
  }

  private async onUpgrade(message: IncomingMessage) {
    this.versions = buildVersions(message.headers);
    if (
      this.state === NodeStates.RESUMING &&
      message.headers["session-resumed"] === "true"
    ) {
      this.client.logger.debug("Session resumed.", {
        tags: ["Music", `Node ${this.id}`],
      });
      this.state = NodeStates.CONNECTED;
    } else if (this.state === NodeStates.RESUMING) {
      this.client.logger.warn(
        "A resuming was expected, but didn't receive one. Reconnecting players...",
        { tags: ["Music", `Node ${this.id}`] }
      );
      const players = await this.client.prisma.player.findMany({
        where: {
          guild_id: { in: [...this.client.guilds.cache.keys()] },
          node_id: this.id,
          // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
          shard_id: { in: this.client.shard?.ids! },
          bot_id: process.env.DISCORD_CLIENT_ID,
        },
      });
      if (this.loadingTracks.length > 0)
        this.loadingTracks.map(({ user, nonce, identifier }) =>
          this.send({ op: "loadTracks", user, nonce, identifier })
        );
      if (players && players.length > 0) {
        const tracks = await this.client.prisma.playerTrack
          .findMany({
            where: {
              player_id: { in: players.map((p) => p.id) },
              index: { in: players.map((p) => p.index) },
            },
          })
          .catch(() => null);
        return players.map(async (player) => {
          const connection = this.client.connections.get(player.guild_id)!;
          connection.state = ConnectionStates.DISCONNECTED;
          await connection.connect(ConnectTypes.LAVALINK_ONLY);
          const track = tracks?.find(
            (a) => a.player_id === player.id && a.index === player.index
          );
          if (player.state !== "IDLE" && track) {
            await this.send({
              op: "play",
              guildId: player.guild_id,
              pause: ["PAUSED", "MUTED"].includes(player.state),
              startTime: player.position,
              volume: player.volume,
              track: track.track,
            });
            await this.send({
              op: "volume",
              guildId: player.guild_id,
              volume: player.volume,
            });
          }
        });
      }
    }

    return Promise.resolve();
  }

  private async handleEvent(event: PlayerEvents) {
    const connection = this.client.connections.get(event.guildId);
    if (!connection) return;
    if (event.op === "pong") {
      connection.ping = event.ping;
      return;
    }
    switch (event.type) {
      case "TrackEndEvent": {
        this.client.emit("trackEnd", event, this);
        break;
      }
      case "TrackStartEvent": {
        this.client.emit("trackStart", event, this);
        break;
      }
      case "TrackExceptionEvent": {
        this.client.emit("trackException", event, this);
        break;
      }
      case "TrackStuckEvent": {
        this.client.emit("trackStuck", event, this);
        break;
      }
      case "WebSocketClosedEvent": {
        connection.emit(
          "voiceConnectionClosed",
          event.byRemote,
          event.code,
          event.reason
        );
        break;
      }
      case "WebSocketReadyEvent": {
        connection.emit("voiceConnectionReady");
        break;
      }
      case "PlayerUpdateEvent": {
        connection.ping = event.state.ping;
        await this.client.prisma.player.updateMany({
          where: {
            guild_id: event.guildId,
            bot_id: process.env.DISCORD_CLIENT_ID,
            platform: "DISCORD",
          },
          data: {
            position: event.state.position,
            volume: event.state.volume,
          },
        });
        break;
      }
    }
  }
}
