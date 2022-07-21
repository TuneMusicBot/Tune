/* eslint-disable camelcase */
/* eslint-disable @typescript-eslint/no-non-null-asserted-optional-chain */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { GuildScheduledEvent } from "discord.js";
import { Connection, ConnectionStates } from "../structures/Connection";
import { EventListener } from "../structures/EventListener";
import { Tune } from "../Tune";

export class ScheduledEventsListener extends EventListener {
  constructor(client: Tune) {
    super(["guildScheduledEventDelete", "guildScheduledEventUpdate"], client);
  }

  onGuildScheduledEventDelete(event: GuildScheduledEvent) {
    return this.client.prisma.syncEvent
      .delete({ where: { id: event.id } })
      .catch(() => null);
  }

  async onGuildScheduledEventUpdate(
    old: GuildScheduledEvent,
    current: GuildScheduledEvent
  ) {
    if (old.isScheduled() && current.isActive()) {
      const event = await this.client.prisma.syncEvent
        .findFirst({ where: { id: old.id, guild_id: old.guildId } })
        .catch(() => null);
      if (!event) {
        await this.client.prisma.player
          .updateMany({
            where: {
              platform: "DISCORD",
              voice_channel_id: current.channelId ?? undefined,
              guild_id: current.guildId,
              bot_id: this.client.user?.id,
            },
            data: { voice_channel_type: "ACTIVE_STAGE_CHANNEL" },
          })
          .catch(() => null);
        return;
      }
      if (!current.channelId) {
        this.client.prisma.syncEvent
          .delete({ where: { id: old.id } })
          .catch(() => null);
        return;
      }
      const cPlayer = await this.client.prisma.player
        .findFirst({
          where: {
            guild_id: old.guildId,
            platform: "DISCORD",
            bot_id: this.client.user?.id,
          },
        })
        .catch(() => null);
      if (cPlayer) return;
      let player = await this.client.prisma.player.create({
        data: {
          platform: "DISCORD",
          index: 0,
          created_by: event.synchronizer_id,
          shard_id: old.guild?.shardId!,
          guild_id: old.guildId!,
          state: "IDLE",
          position: 0,
          voice_channel_id: event.channel_id,
          voice_channel_name: current.channel?.name!,
          voice_channel_type: "ACTIVE_STAGE_CHANNEL",
          volume: event.volume,
          bot_id: this.client.user?.id!,
        },
      });
      if (!this.client.connections.has(old.guildId!))
        this.client.connections.set(
          old.guildId!,
          new Connection(this.client, old.guildId!)
        );
      const connection = this.client.connections.get(old.guildId!)!;
      if (connection.state !== ConnectionStates.CONNECTED)
        player = await connection.connect(0, player);
      const node = this.client.nodes.get(player.node_id!)!;
      node.send({
        op: "volume",
        volume: player.volume,
        guildId: event.guild_id,
      });
      if (event.paused)
        node.send({
          op: "pause",
          pause: true,
          guildId: event.guild_id,
        });
      if (event.initial_tracks.length > 0) {
        const tracks =
          (await node.decodeTracks(event.initial_tracks).catch(() => [])) ?? [];
        const added_at = new Date();
        if (tracks.length > 0)
          await this.client.prisma.playerTrack.createMany({
            // @ts-ignore
            data: tracks.map((t, index) => ({
              track: t.track,
              info: t.info,
              index,
              added_at,
              player_id: player.id,
            })),
          });
        if (player.state === "IDLE" && tracks.length > 0) {
          node.send({
            op: "play",
            track: tracks[0].track,
            guildId: event.guild_id,
            startTime: 0,
          });
        }
      }
    } else if (old.isScheduled() && current.isCanceled()) {
      // Event is canceled :(
      this.client.prisma.syncEvent
        .delete({ where: { id: old.id } })
        .catch(() => null);
    } else if (old.isActive() && current.isCompleted()) {
      // Event is ended
      this.client.prisma.syncEvent
        .delete({ where: { id: old.id } })
        .catch(() => null);
    }
  }
}
