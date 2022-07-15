/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  CloseEvent,
  DMChannel,
  Guild,
  Interaction,
  InteractionType,
  VoiceBasedChannel,
} from "discord.js";
import { join } from "path";
import { readFileSync } from "fs";
import { NodeOptions } from "../@types/lavalink";
import { EventListener } from "../structures/EventListener";
import { ExtendedUser } from "../structures/ExtendedUser";
import { Node } from "../structures/Node";
import { Tune } from "../Tune";
import { Utils } from "../utils/Utils";
import { Connection } from "../structures/Connection";

export class MainListener extends EventListener {
  private readonly pendingEvents: Map<number, object[]> = new Map();

  constructor(client: Tune) {
    super(
      [
        "shardDisconnect",
        "shardError",
        "shardReady",
        "shardReconnecting",
        "shardResume",
        "ready",
        "interactionCreate",
        "raw",
      ],
      client
    );
  }

  onShardDisconnect(close: CloseEvent, shardId: number) {
    this.client.logger.warn(
      `Shard ${close.wasClean ? "cleared " : ""}disconnected with code ${
        close.code
      }`,
      { tags: ["Discord", "Gateway", `Shard ${shardId}`] }
    );
  }

  onShardError(error: Error, shardId: number) {
    this.client.logger.error(error as any, {
      error,
      tags: ["Discord", "Gateway", `Shard ${shardId}`],
    });
  }

  async onShardReady(shardId: number, guilds?: Set<string>) {
    this.client.logger.info(
      `Shard ready with ${guilds?.size ?? 0} unavaible guilds.`,
      { tags: ["Discord", "Gateway", `Shard ${shardId}`] }
    );
    if (
      this.client.nodes.size <= 0 &&
      (this.client.options.shards as number[])[0] === shardId
    ) {
      const nodes: Node[] = JSON.parse(process.env.NODES).map(
        (opts: NodeOptions) => {
          const id = this.client.nodes.size;
          const node = new Node(id, opts, this.client);
          this.client.nodes.set(id, node);
          return node;
        }
      );
      await Promise.all(nodes.map((node) => node.connect()));
    }
    const unavaible = guilds ? [...guilds.values()] : [];
    const players = await this.client.prisma.player
      .findMany({
        where: {
          guild_id: {
            notIn: unavaible,
            in: [...this.client.guilds.cache.keys()],
          },
          shard_id: shardId,
          bot_id: this.client.user?.id,
          platform: "DISCORD",
        },
      })
      .catch(() => null);
    if (!players || players.length <= 0) {
      this.client.logger.debug("Any player need to be replayed.", {
        tags: ["Players"],
      });
      return;
    }
    let tracks = await this.client.prisma.playerTrack
      .findMany({
        where: {
          player_id: { in: players.map((p) => p.id) },
          index: { in: players.map((p) => p.index) },
        },
      })
      .catch(() => null);
    if (!tracks) tracks = [];
    const data = (
      await Promise.all(
        players.map(async (player) => {
          const guild = this.client.guilds.cache.get(player.guild_id) as Guild;
          const voiceChannel = guild.channels.cache.get(
            player.voice_channel_id
          ) as VoiceBasedChannel;
          if (
            !voiceChannel ||
            !voiceChannel
              .permissionsFor(this.client.user?.id as string)
              ?.has(["Speak", "Connect", "ViewChannel"], true) ||
            (!guild.members.me?.permissions.has("ManageChannels", true) &&
              voiceChannel.userLimit > 0 &&
              voiceChannel.userLimit <= voiceChannel.members.size) ||
            (guild.members.me?.isCommunicationDisabled() &&
              !guild.members.me.permissions.has("Administrator"))
          ) {
            await this.client.prisma.player.delete({
              where: { id: player.id },
            });
            await this.client.prisma.playerTrack.deleteMany({
              where: { player_id: player.id },
            });
            return false;
          }
          const conn = new Connection(this.client, player.guild_id);
          this.client.connections.set(player.guild_id, conn);
          // eslint-disable-next-line no-param-reassign
          player = await conn.connect(0, player);
          const np = tracks?.find(
            (t) => t.index === player.index && t.player_id === player.id
          );
          if (player.state !== "IDLE" && np) {
            const node = this.client.nodes.get(
              player.node_id as number
            ) as Node;
            await Promise.all([
              node.send({
                op: "play",
                track: np.track,
                startTime: player.position,
                guildId: player.guild_id,
              }),
              node.send({
                op: "volume",
                guildId: player.guild_id,
                volume: player.volume,
              }),
            ]);
          }
          return true;
        })
      )
    ).reduce(
      (pre, curr) => {
        // eslint-disable-next-line no-unused-expressions, no-plusplus
        curr ? pre.replayed++ : pre.failed++;
        return pre;
      },
      { replayed: 0, failed: 0 }
    );
    this.client.logger.debug(
      `${data.replayed} players has been replayed and ${data.failed} failed.`,
      { tags: ["Players"] }
    );
  }

  onShardReconnecting(shardId: number) {
    this.client.logger.debug("Shard reconnecting.", {
      tags: ["Discord", "Gateway", `Shard ${shardId}`],
    });
  }

  onShardResume(shardId: number, replayedEvents: number) {
    this.client.logger.debug(
      `Shard connection resumed and ${replayedEvents} events has been replayed.`,
      { tags: ["Discord", "Gateway", `Shard ${shardId}`] }
    );
  }

  async onReady() {
    if (this.client.user?.id === Tune.bots[0]) {
      try {
        const path = join(__dirname, "..", "..", "..", "theme", "active");
        const theme = await import(join(path, "info.json"));
        this.client.logger.debug("Oh main bot! Applying theme config...", {
          tags: ["Theme"],
        });
        this.client.user.setPresence(theme.presence);
        if (theme.updateUser && this.client.shard?.ids.includes(0)) {
          await this.client.user.edit({
            avatar: readFileSync(join(path, "avatar.png")),
            username: theme.name,
          });
        }
        Object.assign(process.env, Object.create(theme.enviroment));
        if (theme.colors)
          Object.assign(Object.create(CUSTOM_COLORS), theme.colors);
        this.client.logger.info(`Theme "${theme.id}" applied!`, {
          tags: ["Theme"],
        });
      } catch (error: any) {
        this.client.logger.error(error, { error, tags: ["Theme"] });
      }
    }
    if (this.client.voiceRegions.size === 0) {
      const regions = await this.client.fetchVoiceRegions();
      this.client.logger.info(`Fetched ${regions.size} voice regions.`, {
        tags: ["Discord", "Voice"],
      });
      regions.forEach((value, key) => {
        if (this.client.voiceRegions.has(key))
          this.client.voiceRegions.delete(key);
        this.client.voiceRegions.set(key, value);
      });
    }
    if (this.client.application?.partial) await this.client.application.fetch();

    await this.client.prisma.userConnection
      .findMany({
        where: {
          platform: "DISCORD",
          id: { in: [...this.client.users.cache.keys()] },
        },
      })
      .then(async (users) => {
        const discordUsers: { id: number; discord: ExtendedUser }[] = users.map(
          (user) => {
            if (
              user.dm_channel_id &&
              !this.client.channels.cache.has(user.dm_channel_id)
            ) {
              const data = {
                id: user.dm_channel_id,
                recipients: [{ id: user.id }],
                last_message_id: null,
                last_pin_timestamp: null,
              };
              this.client.channels.cache.set(
                user.dm_channel_id,
                // @ts-ignore
                new DMChannel(this, data)
              );
            }
            const discord = ExtendedUser.toExtendedUser(
              Utils.userToAPI((user.data ?? { id: user.id }) as any) as any,
              this.client
            );
            if (user.access_token)
              discord.patchAuth({
                access_token: user.access_token,
                refresh_token: user.refresh_token!,
                expires_at: user.expires_at!,
                scope: user.scopes.join(" "),
                expires_in: 0,
                token_type: "Bearer",
              });
            return { discord, id: user.user_id };
          }
        );
        const accounts = await this.client.prisma.user.findMany({
          where: { id: { in: users.map((u) => u.user_id) } },
        });
        accounts.forEach((account) => {
          const user = discordUsers.find(({ id }) => id === account.id)
            ?.discord as ExtendedUser;
          user.setAccount(account);
        });
        this.client.logger.info(
          `Loaded ${accounts.length} accounts from database.`,
          { tags: ["PostgreSQL"] }
        );
      });

    await Promise.all(
      this.client.guilds.cache
        .filter((g) => !g.members.me)
        // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
        .map((g) => g.members.fetch(this.client.user?.id!))
    );

    await this.client.multibot.connect();
    setInterval(
      async () =>
        this.client.multibot.send({
          op: "stats",
          players: await this.client.prisma.player.count({
            where: { platform: "DISCORD", bot_id: this.client.user?.id },
          }),
          ping: this.client.ws.ping,
        }),
      45000
    );

    this.client.ready = true;
    this.client.logger.info(
      `Client ready as ${this.client.user?.tag}, on application ${this.client.application?.name}`,
      { tags: ["Discord"] }
    );
  }

  onInteractionCreate(interaction: Interaction) {
    ExtendedUser.toExtendedUser(interaction.user, this.client).setLocale(
      interaction.locale
    );
    if (interaction.isChatInputCommand())
      this.client.emit("slashCommand", interaction);
    if (interaction.isButton()) this.client.emit("buttonClick", interaction);
    if (interaction.isSelectMenu())
      this.client.emit("selectMenuClick", interaction);
    if (interaction.isContextMenuCommand())
      this.client.emit("contextMenu", interaction);
    if (interaction.type === InteractionType.ModalSubmit)
      this.client.emit("modalSubmit", interaction);
    if (interaction.type === InteractionType.ApplicationCommandAutocomplete)
      this.client.emit("autocomplete", interaction);
  }

  onRaw(packet: any) {
    if (
      packet.t === "VOICE_SERVER_UPDATE" &&
      this.client.connections.has(packet.d.guild_id)
    ) {
      this.client.connections
        .get(packet.d.guild_id)!
        .emit("voiceServer", packet.d);
    }
    if (
      packet.t === "VOICE_STATE_UPDATE" &&
      packet.d.user_id === this.client.user?.id &&
      this.client.connections.has(packet.d.guild_id)
    ) {
      this.client.connections
        .get(packet.d.guild_id)!
        .emit("voiceState", packet.d);
    }
  }
}
