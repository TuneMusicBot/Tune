import { Logger } from "winston";
import {
  Client,
  Collection,
  Options,
  Partials,
  PermissionsBitField,
  Routes,
  VoiceRegion,
} from "discord.js";
import { ActivityType } from "discord-api-types/v10";
import { REST } from "@discordjs/rest";
import { Stats, readdirSync, readFileSync } from "fs";
import { join } from "path";
import fsBackend from "i18next-fs-backend";
import i18next, { i18n } from "i18next";
import { Player, PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import { TypingData } from "./@types";
import { directory } from "./utils/File";
import { Command } from "./structures/command/Command";
import { EventListener } from "./structures/EventListener";
import { Node } from "./structures/Node";
import { Lastfm } from "./apis/Lastfm";
import { Autocomplete } from "./apis/Autocomplete";
import { COLORS } from "./utils/Constants";
import { Connection } from "./structures/Connection";

export class Tune extends Client {
  public static readonly bots: string[] = JSON.parse(
    process.env.DISCORD_CLIENTS
  );

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

  async loadTheme(path: any) {
    try {
      const theme = await import(join(path, "info.json"));
      if (theme.updateUser && this.shard?.ids.includes(0)) {
        await this.rest
          .setToken(process.env.DISCORD_TOKEN)
          .patch("/users/@me", {
            auth: true,
            authPrefix: "Bot",
            body: {
              username: theme.name,
              avatar: `data:image/png;base64,${readFileSync(
                join(path, "avatar.png"),
                { encoding: "base64" }
              )}`,
            },
          });
      }
      Object.assign(process.env, Object.create(theme.enviroment));
      if (theme.colors)
        Object.assign(Object.create(CUSTOM_COLORS), theme.colors);
      this.logger.info(`Theme "${theme.id}" applied!`, {
        tags: ["Theme"],
      });
    } catch (e: any) {
      this.logger.error(e, { tags: ["Theme"] });
    }
  }

  public async deletePlayer(guildId: string, player?: Player | null) {
    const guild = this.guilds.cache.get(guildId);
    if (!player)
      // eslint-disable-next-line no-param-reassign
      player = await this.prisma.player
        .findFirst({
          where: {
            platform: "DISCORD",
            guild_id: guildId,
            bot_id: this.user?.id,
          },
        })
        .catch(() => null);
    if (!player) throw new Error("Unknown player.");
    if (this.connections.has(guildId)) this.connections.delete(guildId);
    await this.prisma.player
      .delete({ where: { id: player.id } })
      .catch(() => null);
    if (player.text_channel_id && player.message_id)
      await this.rest
        .delete(
          Routes.channelMessage(player.text_channel_id, player.message_id),
          { auth: true }
        )
        .catch(() => null);
    const db = await this.prisma.guild
      .findFirst({ where: { id: guildId, platform: "DISCORD" } })
      .catch(() => null);
    if (
      db?.auto_update_topic &&
      player.stage_instance_id &&
      guild?.stageInstances.cache.has(player.stage_instance_id) &&
      guild.channels.cache
        .get(player.voice_channel_id)
        ?.permissionsFor(this.user?.id as string)
        ?.has(PermissionsBitField.StageModerator, true)
    )
      await guild.stageInstances
        .delete(player.voice_channel_id)
        .catch(() => null);
    if (typeof player.node_id === "number" && this.nodes.has(player.node_id))
      this.nodes.get(player.node_id)?.send({ op: "destroy", guildId });
    await this.prisma.playerTrack
      .deleteMany({ where: { player_id: player.id } })
      .catch(() => null);
  }
}

interface RawClass<T> {
  new (client: Tune): T;
}
