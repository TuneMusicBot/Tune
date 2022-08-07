import { EmbedBuilder } from "@discordjs/builders";
import { Platforms } from "@prisma/client";
import { DiscordSnowflake } from "@sapphire/snowflake";
import {
  AnyVoiceChannel,
  DiscordHTTPError,
  MessageContent,
  MessageContentEdit,
} from "eris";
import ms from "pretty-ms";
import { TrackStartEvent } from "../../@types/lavalink";
import { EventListener } from "../../structures/EventListener";
import { Node } from "../../structures/Node";
import { Tune } from "../../Tune";
import { COLORS, CUSTOM_TYPES, EMOJIS } from "../../utils/Constants";
import { StringBuilder } from "../../utils/StringBuilder";
import { Utils } from "../../utils/Utils";

export class TrackStartListener extends EventListener {
  constructor(client: Tune) {
    super(["trackStart"], client);
  }

  async on({ guildId, info, track }: TrackStartEvent, node: Node) {
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
    const voiceChannel = guild.channels.get(
      player.voice_channel_id
    ) as AnyVoiceChannel;
    const data = { state: player.state, idle_since: null };
    const db = await this.client.prisma.guild
      .findFirst({ where: { id: guildId, platform: Platforms.DISCORD } })
      .catch(() => null);
    const t = this.client.i18next.getFixedT(
      db?.language ?? guild.preferredLocale
    );
    if (player.state === "IDLE") data.state = "PLAYING";
    const current = await this.client.prisma.playerTrack.findFirst({
      where: { player_id: player.id, index: player.index },
    });
    const userId = (info.user as { id: string }).id;
    const user = CUSTOM_TYPES[userId]
      ? CUSTOM_TYPES[userId]
      : this.client.users.get(userId) ||
        (await this.client.getRESTUser(userId).catch(() => null));
    if (player.text_channel_id) {
      const embed = new EmbedBuilder()
        .setColor(COLORS.MAIN)
        .setAuthor({ name: t("commons:music.nowPlaying") })
        .setTitle(info.title)
        .setTimestamp(current?.added_at)
        .setFooter({
          text: t("commons:music.addedBy", {
            tag:
              user?.discriminator === "-1"
                ? t(user.username)
                : `${user?.username}#${user?.discriminator}`,
          }),
          iconURL: user?.dynamicAvatarURL(),
        });
      if (player.display_artwork) embed.setThumbnail(info.artworkUrl);
      if (Utils.isURL(info.uri)) embed.setURL(info.uri);
      const builder = new StringBuilder();
      if (info.isStream) builder.append(t("commons:music.live"));
      builder.appendLine(
        `💽 **| ${t("commons:music.author", { author: info.author })}`
      );
      if (!info.isStream && BigInt(info.length) !== 9223372036854775807n)
        builder.appendLine(
          `⏰ **| ${t("commons:music.duration", {
            parsed: ms(info.length, {
              colonNotation: true,
              formatSubMilliseconds: false,
            }).split(".")[0],
          })}`
        );
      if (info.sourceName)
        builder.appendLine(
          `${
            EMOJIS[info.sourceName.toUpperCase().replaceAll("-", "_")] ??
            EMOJIS.HTTP
          } **| ${t("commons:music.sourceName", {
            name: t(`commons:music.sources.${info.sourceName}`),
          })}`
        );
      const channelUrl = `https://discord.com/channels/${player.guild_id}/${player.voice_channel_id}`;
      switch (player.voice_channel_type) {
        case "VOICE_CHANNEL":
          builder.appendLine(
            `${EMOJIS.VOICE} **| ${t("commons:music.voiceChannel", {
              name: player.voice_channel_name,
              url: channelUrl,
            })}`
          );
          break;
        case "STAGE_CHANNEL":
          builder.appendLine(
            `${EMOJIS.STAGE} **| ${t("commons:music.stageChannel", {
              name: player.voice_channel_name,
              url: channelUrl,
            })}`
          );
          break;
        case "ACTIVE_STAGE_CHANNEL":
          builder.appendLine(
            `${EMOJIS.STAGE_ACTIVE} **| ${t("commons:music.stageChannel", {
              name: player.voice_channel_name,
              url: channelUrl,
            })}`
          );
      }
      const { listeners } = current?.info as unknown as { listeners?: number };
      if (typeof listeners === "number")
        builder.appendLine(
          `🎧 **| ${t("commons:music.listeners", { listeners })}`
        );
      else if (player.voice_channel_type === "ACTIVE_STAGE_CHANNEL")
        builder.appendLine(
          `🎧 **| ${t("commons:music.listeners", {
            listeners: guild.voiceStates.filter(
              (v) =>
                !!(
                  v.channelID === voiceChannel.id &&
                  !this.client.users.get(v.id)?.bot
                )
            ).length,
          })}`
        );
      if (
        !info.isStream &&
        BigInt(info.length) !== 9223372036854775807n &&
        data.state === "PLAYING"
      )
        builder.appendLine(
          `⌛ **| ${t("commons:music.endAt")} <t:${~~(
            (Date.now() + (info.length - info.position)) /
            1000
          )}:R>**`
        );
      else if (data.state === "PLAYING")
        builder.appendLine(
          `⌛ **| ${t("commons:music.endAt")} <t:${~~(Date.now() / 1000)}:R>**`
        );
      embed.setDescription(builder.toString());
      const { channelId, messageId } = await this.updateMessage(
        { embeds: [embed.data] },
        player.text_channel_id,
        player.message_id
      ).catch(() => ({ channelId: undefined, messageId: undefined }));
      Object.assign(data, {
        text_channel_id: channelId,
        message_id: messageId,
        text_channel_name: channelId ? player.text_channel_name : null,
      });
    }
    await this.client.prisma.player
      .update({ data, where: { id: player.id } })
      .catch(() => null);
    await this.client.prisma.playerAction.create({
      data: { player_id: player.id, identifier: track, type: "TRACK_START" },
    });
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
