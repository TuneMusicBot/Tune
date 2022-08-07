import { EmbedBuilder } from "@discordjs/builders";
import { Platforms } from "@prisma/client";
import { DiscordSnowflake } from "@sapphire/snowflake";
import { DiscordHTTPError, MessageContent, MessageContentEdit } from "eris";
import { TrackEndEvent } from "../../@types/lavalink";
import { EventListener } from "../../structures/EventListener";
import { Node } from "../../structures/Node";
import { Tune } from "../../Tune";
import { COLORS } from "../../utils/Constants";

export class TrackEndListener extends EventListener {
  constructor(client: Tune) {
    super(["trackEnd"], client);
  }

  async on({ guildId, reason, track }: TrackEndEvent, node: Node) {
    const guild = this.client.guilds.get(guildId);
    if (!guild) return;
    const player = await this.client.prisma.player
      .findFirst({
        where: {
          guild_id: guildId,
          platform: Platforms.DISCORD,
          bot_id: process.env.DISCORD_CLIENT_ID,
        },
      })
      .catch(() => null);
    if (!player) {
      node.send({ op: "destroy", guildId });
      return;
    }
    await this.client.prisma.playerAction.create({
      data: {
        player_id: player.id,
        type: "TRACK_END",
        identifier: track,
      },
    });
    const queue = await this.client.prisma.playerTrack
      .findMany({ where: { player_id: player.id } })
      .catch(() => null);
    if (!queue) return;
    const data = {};
    let shouldUpdate = false;

    if (reason !== "FINISHED" && player.track_repeat) {
      shouldUpdate = true;
      Object.assign(data, { track_repeat: false });
    }

    if (reason === "REPLACED") {
      if (shouldUpdate)
        await this.client.prisma.player
          .update({ data, where: { id: player.id } })
          .catch(() => null);
      return;
    }
    if (reason === "FINISHED" && player.track_repeat) {
      await node.send({ op: "play", track, guildId, startTime: 0 });
      await node.send({ op: "volume", guildId, volume: player.volume });
      return;
    }

    const currentSong = queue.find((s) => s.index === player.index);
    if (reason === "LOAD_FAILED" && currentSong) {
      await this.client.prisma.playerTrack.delete({
        where: { id: currentSong.id },
      });
      const nextSongs = queue.filter((s) => s.index > player.index);
      if (nextSongs.length > 0)
        await this.client.prisma.playerTrack.updateMany({
          where: {
            id: { in: nextSongs.map((s) => s.id) },
            player_id: player.id,
          },
          data: nextSongs.map((s) => ({ ...s, index: s.index - 1 })),
        });
    }
    shouldUpdate = reason !== "LOAD_FAILED";
    player.index = reason === "LOAD_FAILED" ? player.index : player.index + 1;
    const nextSong = queue.find((s) => s.index === player.index);
    if (player.queue_repeat && !nextSong) {
      Object.assign(data, { index: 0 });
      const first = queue.find((s) => s.index === 0);
      if (first) {
        await node.send({
          op: "play",
          track: first.track,
          guildId,
          startTime: 0,
        });
        await node.send({ op: "volume", guildId, volume: player.volume });
      }
      return;
    }
    if (shouldUpdate) Object.assign(data, { index: player.index });
    if (nextSong) {
      await node.send({
        op: "play",
        track: nextSong.track,
        guildId,
        startTime: 0,
      });
      await node.send({ op: "volume", guildId, volume: player.volume });
      if (shouldUpdate)
        await this.client.prisma.player
          .update({ data, where: { id: player.id } })
          .catch(() => null);
      return;
    }

    const db = await this.client.prisma.guild
      .findFirst({ where: { id: guildId, platform: Platforms.DISCORD } })
      .catch(() => null);
    const t = this.client.i18next.getFixedT(
      db?.language ?? guild.preferredLocale
    );
    if (player.text_channel_id) {
      const embed = new EmbedBuilder()
        .setColor(COLORS.MAIN)
        .setTimestamp()
        .setDescription(t("commons:music.queueEnd"));

      const { messageId, channelId } = await this.updateMessage(
        { embeds: [embed.data] },
        player.text_channel_id,
        player.message_id
      );
      Object.assign(data, {
        text_channel_id: channelId,
        message_id: messageId,
        text_channel_name: channelId
          ? guild.channels.get(channelId)?.name
          : null,
      });
    }

    Object.assign(data, {
      state: "IDLE",
      idle_since: new Date(),
    });
    await this.client.prisma.player
      .update({ data, where: { id: player.id } })
      .catch(() => null);
  }

  private async updateMessage(
    payload: unknown,
    channelId: string,
    messageId?: string | null
  ): Promise<{ messageId?: string; channelId?: string }> {
    if (!messageId)
      return this.client
        .createMessage(channelId, payload as MessageContent)
        .then((msg) => ({
          messageId: msg.id,
          channelId,
        }))
        .catch((err: any) => {
          if (err instanceof DiscordHTTPError && err.code === 10003) return {};
          throw err;
        });
    const timestamp = DiscordSnowflake.timestampFrom(messageId);
    if (timestamp + 600_000 < Date.now()) {
      await this.client.deleteMessage(channelId, messageId).catch(() => null);
      return this.updateMessage(payload, channelId);
    }
    return this.client
      .editMessage(channelId, messageId, payload as MessageContentEdit)
      .then((msg) => ({
        messageId: msg.id,
        channelId,
      }))
      .catch((err: any) => {
        if (err instanceof DiscordHTTPError) {
          if (err.code === 10003) {
            return {};
          }
          if (err.code === 10008) {
            return this.client
              .createMessage(channelId, payload as MessageContent)
              .then((msg) => ({
                channelId,
                messageId: msg.id,
              }));
          }
        }
        throw err;
      });
  }
}
