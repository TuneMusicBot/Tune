import { REST } from "@discordjs/rest";
import { PrismaClient } from "@prisma/client";
import { Client, OAuthApplicationInfo } from "eris";
import { Logger } from "winston";
import { join } from "node:path";
import i18next from "i18next";
import i18nextFsBackend from "i18next-fs-backend";
import { readdirSync } from "node:fs";
import { EventEmitter } from "node:events";
import { RawClass, TypingData } from "./@types";
import { EventListener } from "./structures/EventListener";
import { directory } from "./utils/File";
import { Connection } from "./structures/Connection";
import { Node } from "./structures/Node";
import { Command } from "./structures/command/Command";
import { Redis } from "./Redis";

export class Tune extends Client {
  public readonly oauth2: REST = new REST({
    version: "10",
    rejectOnRateLimit: ["/users"],
    timeout: 15000,
    retries: 5,
  });

  public readonly logger: Logger;
  public readonly prisma: PrismaClient = new PrismaClient();
  public readonly connections: Map<string, Connection> = new Map();
  public readonly nodes: Map<number, Node> = new Map();
  public readonly i18next = i18next.use(i18nextFsBackend);
  public readonly typings: Map<string, TypingData> = new Map();
  public readonly commands: Command<any>[] = [];
  public readonly prefixes: Record<string, string[]> = {};
  public readonly redis: Redis = new Redis(this);
  public readonly discordEvents: EventEmitter = new EventEmitter();
  public declare application?: OAuthApplicationInfo & { flags: number };

  constructor(logger: Logger) {
    super(process.env.DISCORD_TOKEN, {
      autoreconnect: true,
      compress: true,
      guildCreateTimeout: 5000,
      restMode: true,
      seedVoiceConnections: false,
      messageLimit: 0,
      maxShards: 1,
      gateway: {
        firstShardID: 0,
        lastShardID: 0,
        maxConcurrency: "auto",
        maxShards: "auto",
        largeThreshold: 250,
        intents: 99201,
      },
      allowedMentions: {
        repliedUser: false,
        everyone: false,
        roles: true,
        users: true,
      },
      rest: {
        requestTimeout: 15000,
        baseURL: "/api/v10",
        latencyThreshold: 60000,
      },
      disableEvents: {
        USER_UPDATE: true,
        CHANNEL_PINS_UPDATE: true,
        GUILD_SCHEDULED_EVENT_USER_ADD: true,
        GUILD_SCHEDULED_EVENT_USER_REMOVE: true,
        VOICE_SERVER_UPDATE: true, // Since this bot uses lavalink to play audio, eris doesn't need to process voice server update.
        INTERACTION_CREATE: true, // Interaction are received over HTTP.
      },
      ws: {
        followRedirects: true,
        handshakeTimeout: 15000,
      },
    });
    this.presence = {
      afk: false,
      since: null,
      status: "online",
      activities: [
        {
          type: 2,
          name: `tunes • ${process.env.DEFAULT_PREFIX}help`,
          created_at: Date.now(),
        },
      ],
    };
    this.logger = logger;

    const langPath = join(__dirname, "..", "..", "languages");
    this.i18next.init(
      {
        ns: ["commands", "commons", "errors", "discord"],
        preload: readdirSync(langPath),
        fallbackLng: "en-US",
        backend: {
          loadPath: `${langPath}\\{{lng}}\\{{ns}}.json`,
        },
        interpolation: {
          escapeValue: false,
        },
        returnEmptyString: false,
        returnObjects: true,
      },
      () => {
        this.logger.info("Languages loaded.", { tags: ["i18Next"] });
      }
    );

    directory<RawClass<EventListener>>({
      path: join(__dirname, "events"),
      recursive: true,
      file: (file, path, name, imported) => {
        // eslint-disable-next-line new-cap
        const generated = new imported(this);
        generated.listen();
      },
      error: (err: any) => this.logger.error(err, { tags: ["Events"] }),
    });

    directory<RawClass<Command<any>>>({
      path: join(__dirname, "commands"),
      recursive: true,
      file: (file, path, name, imported) => {
        // eslint-disable-next-line new-cap
        const generated = new imported(this);
        this.commands.push(generated);
      },
      error: (err: any) => this.logger.error(err, { tags: ["Commands"] }),
    }).then(() => this.commands.sort((a, b) => a.name.length - b.name.length));
  }

  async init() {
    await this.redis.connect();
    await this.connect();
  }

  getIdealNode(region?: string): Node {
    const nodesArray = [...this.nodes.values()];
    let nodes = nodesArray.sort((a, b) => a.penalties - b.penalties);
    if (region) {
      const hasAny = nodes.findIndex((n) => n.region === region) !== -1;
      if (hasAny) nodes = nodes.filter((n) => n.region === region);
    }
    return nodes[0];
  }
}
