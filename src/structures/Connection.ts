/* eslint-disable @typescript-eslint/no-non-null-asserted-optional-chain */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable no-shadow */
/* eslint-disable max-classes-per-file */
import {
  ChannelType,
  GatewayVoiceServerUpdateDispatchData,
  GatewayVoiceStateUpdateDispatchData,
  PermissionsBitField,
  Snowflake,
  StageChannel,
  VoiceBasedChannel,
} from "discord.js";
import { RequestMethod } from "@discordjs/rest";
import { EventEmitter, once } from "node:events";
import { Player, PlayerTrack } from "@prisma/client";
import { Tune } from "../Tune";

const REGEX = /^([a-zA-Z]+)(?:\d+|)\.discord\.media(?::\d+|)/;

export class TimeoutError extends Error {}

export enum ConnectionStates {
  CONNECTED,
  CONNECTING,
  DISCONNECTED,
  DISCONNECTING,
  IDLE,
  MOVING,
  RECONNECTING,
}

export enum ConnectTypes {
  COMPLETE,
  LAVALINK_ONLY,
}

type VoiceState = GatewayVoiceStateUpdateDispatchData & { guild_id: Snowflake };

export class Connection extends EventEmitter {
  public readonly guildId: string;
  public state: ConnectionStates = ConnectionStates.IDLE;

  public ping = -1;
  public token?: string;
  public endpoint?: string;
  public sessionId?: string;

  public muted = false;

  private alreadyUnsupress = false;
  private readonly client: Tune;

  constructor(client: Tune, guildId: string) {
    super();

    this.client = client;
    this.guildId = guildId;

    this.on("voiceState", async (data: VoiceState) => {
      const player = await this.getPlayer();
      let updated = false;
      if (!data.channel_id) {
        if (this.state === ConnectionStates.RECONNECTING) return;
        await this.client.deletePlayer(guildId, player);
        return;
      }
      this.muted = data.suppress || data.mute;
      const moved = !!(
        data.channel_id && data.channel_id !== player.voice_channel_id
      );
      if (moved) {
        const vc = this.guild.channels.resolve(
          player.voice_channel_id
        ) as VoiceBasedChannel;
        const time = Date.now();
        vc.members.map((_a, id) =>
          player.actions.push({ id, type: "leftVoiceChannel", time })
        );
        this.state = ConnectionStates.MOVING;
        player.voice_channel_id = data.channel_id!;
        const newVC = this.guild.channels.resolve(
          data.channel_id!
        ) as VoiceBasedChannel;
        player.voice_channel_name = newVC.name;
        this.sessionId = data.session_id;
        newVC.members.map((_a, id) =>
          player.actions.push({ id, type: "joinVoiceChannel", time })
        );
        updated = true;
      }
      if (!this.sessionId ?? this.sessionId === data.session_id) {
        this.posLoad(data, moved, player, updated);
        return;
      }
      if (this.sessionId && this.sessionId !== data.session_id) {
        this.sessionId = data.session_id;
        if (this.complete) this.connect(ConnectTypes.LAVALINK_ONLY);
      }
      this.posLoad(data, moved, player, updated);
    })
      .on("voiceServer", async (data: GatewayVoiceServerUpdateDispatchData) => {
        if (!this.token || !this.endpoint) return;
        if (this.state === ConnectionStates.MOVING) {
          this.endpoint = data.endpoint ?? this.endpoint;
          this.token = data.token;
          this.connect(ConnectTypes.LAVALINK_ONLY);
          return;
        }
        const player = await this.getPlayer();
        if (
          this.token !== data.token ||
          (data.endpoint && this.endpoint !== data.endpoint)
        ) {
          this.token = data.token;
          this.endpoint = data.endpoint || this.endpoint;
          if (this.sessionId) {
            await this.connect(ConnectTypes.LAVALINK_ONLY);
            const tracks = await this.getPlayerQueue();
            const np = tracks.find((t) => t.index === player.index);
            if (player.state !== "IDLE" && np) {
              const node = this.client.nodes.get(player.node_id!);
              node?.send({
                op: "play",
                guildId: this.guildId,
                track: np.track,
                startTime: player.position,
                pause: ["MUTED", "PAUSED"].includes(player.state),
              });
              node?.send({
                op: "volume",
                volume: player.volume,
                guildId: this.guildId,
              });
            }
          }
        }
      })
      .on(
        "voiceConnectionClosed",
        (byRemote: boolean, code: number, reason = "unknown") => {
          this.client.logger.debug(
            `Voice connection closed${
              byRemote ? " by remote" : ""
            } with code ${code} and reason "${
              reason?.toString()?.toLowerCase() ?? "unknown."
            }"`,
            { tags: ["Music", `Players ${this.guildId}`] }
          );
          if (this.state !== ConnectionStates.RECONNECTING)
            this.state = ConnectionStates.DISCONNECTED;
          switch (code) {
            case 1001:
            case 1006:
            case 4015:
              this.connect(ConnectTypes.LAVALINK_ONLY);
              break;
            case 4006:
            case 4009:
              this.state = ConnectionStates.DISCONNECTED;
              this.token = undefined;
              this.sessionId = undefined;
              this.endpoint = undefined;
              this.connect();
              break;
          }
        }
      )
      .on("voiceConnectionReady", () => {
        this.state = ConnectionStates.CONNECTED;
        this.client.logger.debug("Voice connection ready.", {
          tags: ["Music", `Players ${this.guildId}`],
        });
      });
  }

  get guild() {
    return this.client.guilds.cache.get(this.guildId)!;
  }

  get region() {
    return this.endpoint && REGEX.test(this.endpoint)
      ? REGEX.exec(this.endpoint)![1]
      : null;
  }

  get complete() {
    return this.token && this.endpoint && this.sessionId;
  }

  connect(
    type: ConnectTypes = ConnectTypes.COMPLETE,
    p?: Player
  ): Promise<Player> {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      let player: Player | null = p ?? (await this.getPlayer());
      if (
        this.state !== ConnectionStates.MOVING &&
        this.state !== ConnectionStates.RECONNECTING
      )
        this.state = ConnectionStates.CONNECTING;
      const complete =
        type === ConnectTypes.COMPLETE ??
        (type === ConnectTypes.LAVALINK_ONLY &&
          !this.complete &&
          this.state !== ConnectionStates.CONNECTING);

      if (complete) {
        let timeout;
        try {
          const controller = new AbortController();
          timeout = setTimeout(() => controller.abort(), 120000);
          const promise = Promise.all([
            once(this, "voiceState", { signal: controller.signal }),
            once(this, "voiceServer", { signal: controller.signal }),
          ]);
          this.client.sendVoiceUpdate(this.guildId, player.voice_channel_id);
          // eslint-disable-next-line prefer-const
          let [[state], [server]] = await promise;
          if (!server.endpoint)
            [server] = await once(this, "voiceServer", {
              signal: controller.signal,
            });
          if (!server.endpoint) {
            clearTimeout(timeout);
            controller.abort();
          }
          this.token = server.token;
          this.endpoint = server.endpoint;
          this.sessionId = state.session_id;
        } catch (e) {
          if (
            e instanceof Error &&
            e.name.toLowerCase().trim() === "aborterror"
          ) {
            reject(
              new TimeoutError(
                "Connection took more than 2 minutes to be estabilished."
              )
            );
            return;
          }
          reject(e);
          return;
        } finally {
          clearTimeout(timeout);
        }
      }

      player = await this.connectt(true, player).catch((error: any) => {
        reject(error);
        return null;
      });
      if (player !== null) {
        await once(this, "voiceConnectionReady");
        resolve(player);
      }
    });
  }

  async reconnect() {
    if (this.state === ConnectionStates.CONNECTING)
      throw new Error("Connection is not ready.");
    if (this.state === ConnectionStates.DISCONNECTED)
      throw new Error("You can reconnected an empty connection.");
    const player = await this.getPlayer();
    if (
      !this.guild.channels
        .resolve(player.voice_channel_id)
        ?.permissionsFor(this.client.user?.id!)
        ?.has(["Connect", "ViewChannel"])
    )
      throw new Error("I won't be able to return to this voice channel.");
    this.state = ConnectionStates.RECONNECTING;
    this.endpoint = undefined;
    this.token = undefined;
    this.sessionId = undefined;
    this.client.sendVoiceUpdate(this.guildId);
    return new Promise((resolve, reject) =>
      // eslint-disable-next-line no-promise-executor-return
      setTimeout(() => this.connect(0).then(resolve).catch(reject), 500)
    );
  }

  private async connectt(force = false, player: Player): Promise<Player> {
    if (!this.complete) throw new Error("Missing voice data.");
    if (this.state === ConnectionStates.CONNECTED && !force)
      throw new Error("Already connected.");
    if (typeof player.node_id !== "number")
      player.node_id = this.client.getIdealNode(this.region!).id;
    await this.client.nodes.get(player.node_id)?.send({
      op: "voiceUpdate",
      guildId: this.guildId,
      sessionId: this.sessionId,
      event: { token: this.token, endpoint: this.endpoint },
    })!;
    return player;
  }

  private async posLoad(
    data: VoiceState,
    moved: boolean,
    player: Player,
    update: boolean
  ) {
    const vc = this.guild.channels.cache.get(
      player.voice_channel_id
    ) as VoiceBasedChannel;
    const stage = player.stage_instance_id
      ? this.guild.stageInstances.cache.get(player.stage_instance_id)
      : null;
    const db = await this.client.prisma.guild
      .findFirst({ where: { id: this.guildId, platform: "DISCORD" } })
      .catch(() => null);
    if (
      data.suppress &&
      db?.auto_unsupress &&
      !this.alreadyUnsupress &&
      vc.type === ChannelType.GuildStageVoice &&
      vc
        .permissionsFor(this.client.user?.id!)
        ?.has(PermissionsBitField.StageModerator, true)
    ) {
      this.alreadyUnsupress = await this.client.rest
        .raw({
          // @ts-ignore
          method: RequestMethod.Patch,
          fullRoute: `/guilds/${this.guildId}/voice-states/@me`,
          auth: true,
          authPrefix: "Bot",
          body: { channel_id: vc.id, suppress: false },
        })
        .then((r) => r.statusCode === 204)
        .catch(() => false);
    } else if (
      data.suppress &&
      !data.request_to_speak_timestamp &&
      vc.type === ChannelType.GuildStageVoice &&
      vc.permissionsFor(this.client.user?.id!)?.has("RequestToSpeak", true)
    ) {
      await this.client.rest
        .raw({
          // @ts-ignore
          method: RequestMethod.Patch,
          fullRoute: `/guilds/${this.guildId}/voice-states/@me`,
          auth: true,
          authPrefix: "Bot",
          body: {
            channel_id: vc.id,
            request_to_speak_timestamp: new Date(),
          },
        })
        .catch(() => null);
    }
    if (
      moved &&
      stage &&
      stage.channelId !== player.voice_channel_id &&
      db?.auto_update_topic &&
      stage.channel
        ?.permissionsFor(this.client.user?.id!)
        ?.has(PermissionsBitField.StageModerator, true)
    ) {
      await stage.delete().catch(() => undefined);
      player.stage_instance_id = null;
      // eslint-disable-next-line no-param-reassign
      update = true;
    }
    if (update)
      await this.client.prisma.player.update({
        where: { id: player.id },
        data: {
          actions: player.actions,
          stage_instance_id: player.stage_instance_id,
          state: player.state,
          message_id: player.message_id,
          voice_channel_id: player.voice_channel_id,
          voice_channel_name: vc.name,
          voice_channel_type:
            // eslint-disable-next-line no-nested-ternary
            vc.type === ChannelType.GuildVoice
              ? "VOICE_CHANNEL"
              : (vc as StageChannel).stageInstance ||
                this.guild.scheduledEvents.cache.find(
                  (e) => e.isActive() && e.channelId === vc.id
                )
              ? "ACTIVE_STAGE_CHANNEL"
              : "STAGE_CHANNEL",
        },
      });
  }

  private async getPlayerQueue(): Promise<PlayerTrack[]> {
    const player = await this.getPlayer();
    const tracks = await this.client.prisma.playerTrack
      .findMany({ where: { player_id: player.id } })
      .catch(() => null);
    if (!tracks) throw new Error("Player doesn't exists.");
    return tracks;
  }

  private async getPlayer(): Promise<Player> {
    const player = await this.client.prisma.player
      .findFirst({
        where: { platform: "DISCORD", guild_id: this.guildId },
      })
      .catch(() => null);
    if (!player) throw new Error("Player doesn't exists.");
    return player;
  }
}
