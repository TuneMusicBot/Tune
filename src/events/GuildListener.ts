import {
  AnyThreadChannel,
  ClientUser,
  EmbedBuilder,
  Guild,
  GuildMember,
  TextChannel,
} from "discord.js";
import { EventListener } from "../structures/EventListener";
import { Tune } from "../Tune";

export class GuildListener extends EventListener {
  constructor(client: Tune) {
    super(["guildCreate", "guildDelete", "guildMemberUpdate"], client);
  }

  async onGuildCreate(guild: Guild) {
    // @ts-ignore
    const me: GuildMember = guild.members.me ?? (await guild.members.fetchMe());
    await this.client.multibot.send({
      op: "guildAdd",
      guildId: guild.id,
      member: {
        nick: me.nickname,
        avatar: me.avatar,
        roles: [...me.roles.cache.keys()],
        joined_at: me.joinedAt?.toISOString(),
        premium_since: me.premiumSince?.toISOString() ?? null,
        deaf: !!me.voice.deaf,
        mute: !!me.voice.mute,
        pending: !!me.pending,
        communication_disabled_until:
          me.communicationDisabledUntil?.toISOString() ?? null,
      },
    });

    const guildDb = await this.client.prisma.guild.findUnique({
      where: { id: guild.id },
    });
    if (guildDb && guildDb.channel_id && guildDb.thread_id) {
      if (!guild.channels.cache.has(guildDb.channel_id)) return;
      const t = this.client.i18next.getFixedT(
        guildDb.language ?? guild.preferredLocale
      );
      const channel = guild.channels.cache.get(
        guildDb.channel_id
      ) as TextChannel;
      let thread = (await guild.channels.fetch(
        guildDb.thread_id
      )) as AnyThreadChannel | null;
      if (!thread) {
        const [, , messageId] = (
          guildDb.messages_id.find((m) => m.startsWith("main")) as string
        ).split("-");
        const existsMsg = await channel.messages
          .fetch(messageId)
          .catch(() => null);
        if (!existsMsg) return;
        thread = await existsMsg
          .startThread({
            name: t("commons:threadName"),
            rateLimitPerUser: 3,
            autoArchiveDuration: 10080,
          })
          .catch(() => null);
        if (!thread) return;
        guildDb.thread_id = thread.id;
        await this.client.prisma.guild.update({
          where: { id: guild.id },
          data: { thread_id: thread.id },
        });
        await this.client.multibot.send({
          op: "configChannel",
          guildId: guild.id,
          threadId: thread.id,
          channelId: channel.id,
        });
      } else if (
        !thread.members.cache.has((this.client.user as ClientUser).id) &&
        thread.joinable
      )
        await thread.join();
      const msgIndex = guildDb.messages_id.findIndex((m) =>
        m.startsWith((this.client.user as ClientUser).id)
      );
      const embed = new EmbedBuilder();
      if (msgIndex === -1) {
        await channel.send({ embeds: [embed.data] }).then(async (msg) => {
          if (
            channel.permissionsFor(msg.author.id)?.has("ManageMessages", true)
          )
            await msg.pin();
          guildDb.messages_id.push(`${msg.author.id}-${msg.id}`);
          return this.client.prisma.guild.update({
            where: { id: guild.id },
            data: { messages_id: guildDb.messages_id },
          });
        });
      } else {
        const [, messageId] = guildDb.messages_id[msgIndex].split("-");
        const stillExists = await channel.messages
          .fetch(messageId)
          .catch(() => null);
        if (!stillExists)
          await channel.send({ embeds: [embed.data] }).then(async (msg) => {
            if (
              channel.permissionsFor(msg.author.id)?.has("ManageMessages", true)
            )
              await msg.pin();
            guildDb.messages_id[msgIndex] = `${msg.author.id}-${msg.id}`;
            return this.client.prisma.guild.update({
              where: { id: guild.id },
              data: { messages_id: guildDb.messages_id },
            });
          });
      }
    }
  }

  onGuildDelete(guild: Guild) {
    this.client.multibot.send({ op: "guildRemove", guildId: guild.id });
    this.client.prisma.player
      .deleteMany({
        where: { guild_id: guild.id, bot_id: this.client.user?.id },
      })
      .catch(() => null);
  }

  onGuildMemberUpdate(member: GuildMember) {
    if (member.id !== this.client.user?.id) return;
    this.client.multibot.send({
      op: "memberUpdate",
      guildId: member.guild.id,
      member: {
        nick: member.nickname,
        avatar: member.avatar,
        roles: [...member.roles.cache.keys()],
        joined_at: member.joinedAt?.toISOString(),
        premium_since: member.premiumSince?.toISOString() ?? null,
        deaf: !!member.voice.deaf,
        mute: !!member.voice.mute,
        pending: !!member.pending,
        communication_disabled_until:
          member.communicationDisabledUntil?.toISOString() ?? null,
      },
    });
  }
}
