/* eslint-disable no-nested-ternary */
import { Platforms } from "@prisma/client";
import { EmbedBuilder } from "@discordjs/builders";
import { APIUser, PermissionFlagsBits } from "discord-api-types/v10";
import { BaseData, GuildTextableChannel, User } from "eris";
import { TrackExceptionEvent } from "../../@types/lavalink";
import { EventListener } from "../../structures/EventListener";
import { Tune } from "../../Tune";
import { Node } from "../../structures/Node";
import { COLORS, CUSTOM_TYPES } from "../../utils/Constants";

export class TrackExceptionListener extends EventListener {
  constructor(client: Tune) {
    super(["trackException"], client);
  }

  async on(packet: TrackExceptionEvent, node: Node) {
    const guild = this.client.guilds.get(packet.guildId);
    if (!guild) return;
    const player = await this.client.prisma.player
      .findFirst({
        where: {
          guild_id: packet.guildId,
          platform: Platforms.DISCORD,
          bot_id: process.env.DISCORD_CLIENT_ID,
        },
      })
      .catch(() => null);
    if (!player) {
      await node.send({ op: "destroy", guildId: packet.guildId });
      const connection = this.client.connections.get(packet.guildId);
      if (connection)
        await connection.disconnect({
          confirm: !!guild.voiceStates.get(this.client.user.id)?.channelID,
        });
      return;
    }
    const channel = player.text_channel_id
      ? (guild.channels.get(player.text_channel_id) as GuildTextableChannel)
      : undefined;
    if (channel) {
      const permissions = channel.permissionsOf(this.client.user.id);
      const me =
        guild.members.get(this.client.user.id) ||
        (await guild.getRESTMember(this.client.user.id));
      if (
        !me.permissions.has(PermissionFlagsBits.Administrator) ||
        !(
          permissions.has(PermissionFlagsBits.ViewChannel) &&
          permissions.has(PermissionFlagsBits.SendMessages)
        )
      )
        return;
      guild.members.set(this.client.user.id, me);
      const embed = new EmbedBuilder().setTimestamp().setColor(COLORS.ERROR);
      const userData = packet.info.user as APIUser;
      const user = CUSTOM_TYPES[userData.id]
        ? CUSTOM_TYPES[userData.id]
        : userData.username
        ? new User(userData as unknown as BaseData, this.client)
        : this.client.users.get(userData.id) ||
          (await this.client.getRESTUser(userData.id).catch(() => null));
      if (user && user instanceof User && !this.client.users.has(user.id))
        this.client.users.set(user.id, user);
      const settings = await this.client.prisma.guild
        .findFirst({
          where: { id: packet.guildId, platform: Platforms.DISCORD },
        })
        .catch(() => null);
      const t = this.client.i18next.getFixedT(
        settings?.language ?? guild.preferredLocale
      );
      let extra = "";
      if (user) {
        const tag =
          user.discriminator === "-1"
            ? t(user.username)
            : `${user.username}#${user.discriminator}`;
        extra = t("commons:music.addedByEvent", { tag });
      }
      embed.setDescription(
        t("commons:music.trackException", {
          extra,
          title: packet.info.title,
          uri: packet.info.uri,
        })
      );
      channel
        .createMessage({ embeds: [embed.data] })
        .then((msg) => setTimeout(() => msg.delete(), 300_000));
    }
  }
}
