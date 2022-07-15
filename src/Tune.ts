/** Logs stuff */
import { Logger } from "winston";

/** Discord */
import { Client, Collection, Options, Partials, VoiceRegion } from "discord.js";
import { ActivityType } from "discord-api-types/v10";
import { REST } from "@discordjs/rest";

/** Files */
import { Stats, readdirSync } from "fs";
import { join } from "path";

/** Translations */
import fsBackend from "i18next-fs-backend";
import i18next, { i18n } from "i18next";

/** Database */
// @ts-ignore
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import { TypingData } from "./@types";
import { directory } from "./utils/File";

/** Structures */
import { Command } from "./structures/command/Command";
import { EventListener } from "./structures/EventListener";
import { Node } from "./structures/Node";
import { Lastfm } from "./apis/Lastfm";
import { Autocomplete } from "./apis/Autocomplete";
// import { ListenMoe } from "./apis/Listenmoe";

/** Utils */
import { COLORS } from "./utils/Constants";
import { Connection } from "./structures/Connection";

export class Tune extends Client {
  public static readonly bots: string[] = [
    "723226234317963374",
    /* '725067926457155706', */ "743945027616768011",
    "820977815624613948",
    "957040431126954034",
    "962083883061477516",
    "962084498378485813",
    "962091693346291753",
  ];

  public readonly logger: Logger;

  public readonly voiceRegions: Collection<string, VoiceRegion> =
    new Collection();

  public readonly connections: Map<string, Connection> = new Map();
  public readonly typings: Collection<string, TypingData> = new Collection();
  public readonly i18next: i18n = i18next.use(fsBackend);
  public readonly prisma: PrismaClient = new PrismaClient();
  public readonly commands: Array<Command> = [];
  public readonly nodes: Map<number, Node> = new Map();
  public readonly redis: Redis = new Redis(process.env.REDIS_URL);
  public readonly pendingDeletion: Set<string> = new Set();
  public ready = false;

  public readonly lastfm: Lastfm = new Lastfm(this);
  public readonly oauth2: REST = new REST({
    version: "10",
    retries: 5,
    authPrefix: "Bearer",
    timeout: 15000,
    rejectOnRateLimit: ["/users/@me"],
  });

  public readonly autocomplete: Autocomplete = new Autocomplete();
  // public readonly listenmoe: ListenMoe = new ListenMoe(this);

  constructor(logger: Logger) {
    super({
      intents: [
        "Guilds",
        "GuildMessages",
        "GuildPresences",
        "GuildScheduledEvents",
        "GuildVoiceStates",
        "MessageContent",
      ],
      presence: {
        status: "online",
        afk: false,
        activities: [
          {
            type: ActivityType.Listening as number,
            name: `tunes • ${process.env.DEFAULT_PREFIX}help`,
          },
        ],
      },
      failIfNotExists: false,
      allowedMentions: { repliedUser: false, parse: ["users", "roles"] },
      partials: [
        Partials.Channel,
        Partials.GuildMember,
        Partials.GuildScheduledEvent,
        Partials.Message,
        Partials.Reaction,
        Partials.ThreadMember,
        Partials.User,
      ],
      makeCache: Options.cacheWithLimits({
        ApplicationCommandManager: 0,
        GuildStickerManager: 0,
        GuildBanManager: 0,
        GuildEmojiManager: 0,
        GuildInviteManager: 0,
        BaseGuildEmojiManager: 0,
        ReactionUserManager: 0,
        MessageManager: 0,
        ReactionManager: 0,
      }),
      shardCount: 1,
      shards: [0],
      waitGuildTimeout: 5000,
      closeTimeout: 1500,
      ws: {
        compress: true,
        large_threshold: 250,
        version: 10,
        properties: {
          os: process.platform,
          browser: "Discord Desktop",
          device: "Tune Bot device",
        },
      },
      rest: {
        version: "10",
        timeout: 15000,
        authPrefix: "Bot",
        retries: 5,
        rejectOnRateLimit: ["/stage-instances"],
      },
    });

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

    this.rest.on("rateLimited", (ratelimit) =>
      this.logger.warn(
        `Received${ratelimit.global ? " global" : ""} ratelimit on ${
          ratelimit.method
        } ${ratelimit.route} because we reach the limit ${
          ratelimit.limit
        } (reset in ${ratelimit.timeToReset}ms).`,
        { tags: ["Discord", "Rest"] }
      )
    );

    this.redis
      .on("ready", () => {
        this.logger.info("Connected to redis cache.", { tags: ["Redis"] });
        this.redis.subscribe("music");
      })
      .on("error", (error: any) =>
        this.logger.error(error, { tags: ["Redis"] })
      )
      .on("close", () =>
        this.logger.debug("Redis cache disconnected.", { tags: ["Redis"] })
      )
      .on("reconnecting", () =>
        this.logger.debug("Reconnecting to the Redis cache.", {
          tags: ["Redis"],
        })
      )
      .on("end", () =>
        this.logger.warn("No more reconnections will be made to Redis cache.", {
          tags: ["Redis"],
        })
      );

    directory<RawClass<Command>>({
      recursive: true,
      path: join(__dirname, "commands"),
      error: (error: any) => this.logger.error(error, { tags: ["Commands"] }),
      file: (
        file: Stats,
        path: string,
        name: string,
        command: RawClass<Command>
      ) => {
        // eslint-disable-next-line new-cap
        const cmd = new command(this);
        this.commands.push(cmd);
      },
    }).then((commands) => {
      this.logger.info(`Loaded ${commands} commands files.`, {
        tags: ["Commands"],
      });
      this.commands.sort((a, b) => b.name.length - a.name.length);
    });

    directory<RawClass<EventListener>>({
      recursive: true,
      path: join(__dirname, "events"),
      error: (error: any) => this.logger.error(error, { tags: ["Events"] }),
      file: (
        file: Stats,
        path: string,
        name: string,
        imported: RawClass<EventListener>
        // eslint-disable-next-line new-cap
      ) => new imported(this).listen(),
    }).then((events) =>
      this.logger.info(`Loaded ${events} events files.`, { tags: ["Events"] })
    );
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

  sendVoiceUpdate(guildId: string, channelId?: string) {
    const guild = this.guilds.cache.get(guildId);
    if (!guild) throw new Error("Not cached guild.");
    guild
      .fetchAuditLogs()
      .then(
        (auditLogs) =>
          auditLogs.entries.find((a) => a.target?.id === "")?.executor
      );
    return guild.shard.send(
      {
        op: 4,
        d: {
          guild_id: guildId,
          channel_id: channelId ?? null,
          self_mute: false,
          self_deaf: true,
        },
      },
      false
    );
  }

  getColor(name: string): number {
    if (CUSTOM_COLORS) {
      const has = Object.getOwnPropertyDescriptor(CUSTOM_COLORS, name);
      if (has && has.value && !isNaN(has.value)) return has.value as number;
    }
    // @ts-ignore
    return COLORS[name];
  }
}

interface RawClass<T> {
  new (client: Tune): T;
}
