import { Platforms } from "@prisma/client";
import { GuildChannel, OAuthApplicationInfo } from "eris";
import { Connection, ConnectOptionsTypes } from "../structures/Connection";
import { EventListener } from "../structures/EventListener";
import { Node } from "../structures/Node";
import { Tune } from "../Tune";

export class MainListener extends EventListener {
  constructor(client: Tune) {
    super(
      [
        "ready",
        "connect",
        "rawREST",
        "rawWS",
        "warn",
        "shardDisconnect",
        "shardReady",
        "shardResume",
        "error",
        "hello",
        "unknown",
        "channelDelete",
      ],
      client
    );
  }

  onConnect(shardId: number) {
    return this.client.logger.debug(
      "Connection estabilished. Starting identify/resume.",
      { tags: ["Discord", "Gateway", `Shard ${shardId}`] }
    );
  }

  async onReady() {
    this.client.application =
      (await this.client.getOAuthApplication()) as OAuthApplicationInfo & {
        flags: number;
      };
    this.client.logger.info(
      `All shards became ready. Logged as ${this.client.user.username}#${this.client.user.discriminator} on application ${this.client.application.name}`,
      { tags: ["Discord", "Client"] }
    );
  }

  onWarn(message: string | Error, shardId?: number) {
    const string = typeof message === "string" ? message : message.message;
    if (string.toLowerCase().includes("unknown interaction type")) return;
    const tags: string[] = ["Discord", "Client"];
    if (typeof shardId === "number")
      tags.splice(1, 0, "Gateway").push(`Shard ${shardId}`);
    this.client.logger.warn(message as any, { tags });
  }

  onError(err?: Error, shardId?: number) {
    if (!err) return;
    const tags: string[] = ["Discord", "Client"];
    if (typeof shardId === "number")
      tags.splice(1, 0, "Gateway").push(`Shard ${shardId}`);
    this.client.logger.error(err as any, { tags });
  }

  onUnknown(packet: unknown, shardId?: number) {
    const tags: string[] = ["Discord", "Client"];
    if (typeof shardId === "number")
      tags.splice(1, 0, "Gateway").push(`Shard ${shardId}`);
    this.client.logger.debug(`Unknown payload: ${packet}`, { tags });
  }

  onHello(trace: string[], shardId: number) {
    this.client.logger.debug(`Received hello with trace ${trace.join(", ")}`, {
      tags: ["Discord", "Gateway", `Shard ${shardId}`],
    });
  }

  onShardDisconnect(
    err: Error | string = "Shard disconnected",
    shardId: number
  ) {
    if (
      err instanceof Error &&
      err.message.toLowerCase().includes("connection reset by peer")
    )
      return;
    this.client.logger.error(err as any, {
      tags: ["Discord", "Gateway", `Shard ${shardId}`],
    });
  }

  async onShardReady(shardId: number) {
    this.client.logger.debug("Shard session ready.", {
      tags: ["Discord", "Gateway", `Shard ${shardId}`],
    });
    if (
      shardId === this.client.shards.options.firstShardID &&
      this.client.nodes.size <= 0
    ) {
      const infos = JSON.parse(process.env.NODES);
      const nodes = infos.map(
        (info: any, id: number) => new Node(id, info, this.client)
      );
      await Promise.all(
        nodes.map(async (n: Node) => {
          this.client.nodes.set(n.id, n);
          await n.connect();
          return n;
        })
      );
    }
    const guilds = this.client.guilds.filter((g) => g.shard.id === shardId);
    if (guilds.length > 0) {
      const players = await this.client.prisma.player
        .findMany({
          where: {
            guild_id: { in: guilds.map((g) => g.id) },
            platform: Platforms.DISCORD,
            bot_id: process.env.DISCORD_CLIENT_ID,
          },
        })
        .catch(() => []);
      if (players.length <= 0) {
        this.client.logger.info("Any session needed to be resumed.", {
          tags: ["Players"],
        });
        return;
      }
      const deletePlayers: Set<number> = new Set();
      players.forEach(async (player) => {
        if (player.idle_since) {
          const timestamp = player.idle_since.getTime();
          if (timestamp + 300_000 < Date.now())
            return deletePlayers.add(player.id);
        }
        const connection = new Connection(this.client, player.guild_id);
        this.client.connections.set(player.guild_id, connection);
        const node = await connection.connect({
          type: ConnectOptionsTypes.COMPLETE,
          player,
          confirm: false,
        });
        if (node.id !== player.node_id)
          await this.client.prisma.player.update({
            where: { id: player.id },
            data: { node_id: node.id },
          });
        await node.send({
          op: "volume",
          guildId: player.guild_id,
          volume: player.volume,
        });
        const np = await this.client.prisma.playerTrack
          .findFirst({ where: { player_id: player.id, index: player.index } })
          .catch(() => null);
        if (np)
          await node.send({
            op: "play",
            track: np.track,
            guildId: player.guild_id,
            startTime: player.position,
            paused: ["PAUSED", "MUTED"].includes(player.state),
          });
        return null;
      });
      const resumedPlayers = players.length - deletePlayers.size;
      if (deletePlayers.size > 0) {
        const playersIds = [...deletePlayers.values()];
        await this.client.prisma.playerAction.deleteMany({
          where: { player_id: { in: playersIds } },
        });
        await this.client.prisma.playerTrack.deleteMany({
          where: { player_id: { in: playersIds } },
        });
        await this.client.prisma.player.deleteMany({
          where: {
            id: { in: playersIds },
            bot_id: process.env.DISCORD_CLIENT_ID,
            platform: Platforms.DISCORD,
          },
        });
        players
          .filter((p) => p.message_id && p.text_channel_id)
          .forEach((p) =>
            this.client
              .deleteMessage(
                p.text_channel_id as string,
                p.message_id as string
              )
              .catch(() => null)
          );
      }
      this.client.logger.info(
        `${resumedPlayers} players resumed. ${deletePlayers.size} deleted.`,
        { tags: ["Players"] }
      );
    }
  }

  onShardResume(shardId: number) {
    this.client.logger.debug("Shard connection resumed.", {
      tags: ["Discord", "Gateway", `Shard ${shardId}`],
    });
  }

  onChannelDelete(channel: GuildChannel) {
    const typing = this.client.typings.get(channel.id);
    if (!typing) return;
    clearInterval(typing.interval);
    this.client.typings.delete(channel.id);
  }
}
