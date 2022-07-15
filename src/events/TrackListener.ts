import { EmbedBuilder } from "@discordjs/builders";
import { DiscordAPIError } from "@discordjs/rest";
import { APIMessage, Routes } from "discord-api-types/v10";
import { GuildMember, VoiceBasedChannel } from "discord.js";
import {
  TrackEndEvent,
  TrackExceptionEvent,
  TrackInfo,
  TrackStartEvent,
  TrackStuckEvent,
} from "../@types/lavalink";
import { EventListener } from "../structures/EventListener";
import { ExtendedUser } from "../structures/ExtendedUser";
import { Node } from "../structures/Node";
import { Tune } from "../Tune";
import { CUSTOM_TYPES } from "../utils/Constants";
import { Utils } from "../utils/Utils";

export class TrackListener extends EventListener {
  constructor(client: Tune) {
    super(["trackEnd", "trackException", "trackStart", "trackStuck"], client);
  }

  async onTrackEnd(
    { guildId, reason, track, info }: TrackEndEvent,
    node: Node
  ) {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return;
    const player = await this.getPlayer(guildId);
    if (!player) {
      node.send({ op: "destroy", guildId });
      return;
    }
    const voiceChannel = guild.channels.cache.get(
      player.voice_channel_id
    ) as VoiceBasedChannel;
    this.scrobbleLastfmProfiles(info, [...voiceChannel.members.values()]);
    const queue = await this.getPlayerTracks(player.id);
    if (!queue) return;
    const data = {};
    let shouldUpdate = false;

    if (reason !== "FINISHED" && player.track_repeat) {
      shouldUpdate = true;
      Object.assign(data, { track_repeat: false });
    }

    if (reason === "REPLACED") {
      if (shouldUpdate) await this.updatePlayer(player.id, data);
      return;
    }
    if (reason === "FINISHED" && player.track_repeat) {
      this.startTrack({ track, guildId, volume: player.volume, node });
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
      if (first)
        this.startTrack({
          guildId,
          node,
          volume: player.volume,
          track: first.track,
        });
      return;
    }
    if (shouldUpdate) Object.assign(data, { index: player.index });
    if (nextSong) {
      this.startTrack({
        track: nextSong.track,
        guildId,
        node,
        volume: player.volume,
      });
      if (shouldUpdate) await this.updatePlayer(player.id, data);
      return;
    }

    Object.assign(data, { state: "IDLE", idle_since: new Date() });
    await this.updatePlayer(player.id, data);
  }

  async onTrackStart({ guildId, info, track }: TrackStartEvent, node: Node) {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return;
    const player = await this.getPlayer(guildId);
    if (!player) {
      node.send({ op: "destroy", guildId });
      return;
    }
    const voiceChannel = guild.channels.cache.get(
      player.voice_channel_id
    ) as VoiceBasedChannel;
    const data = { actions: player.actions };
    data.actions.push({
      id: track,
      type: "trackStart",
      time: Date.now(),
    });
    const db = await this.getDatabaseConfig(guildId);
    const t = this.client.i18next.getFixedT(
      db?.language ?? guild.preferredLocale
    );
    if (player.state === "IDLE") Object.assign(data, { state: "PLAYING" });
    const current = await this.client.prisma.playerTrack.findFirst({
      where: { player_id: player.id, index: player.index },
    });
    const userId = (info.user as { id: string }).id;
    const user = CUSTOM_TYPES[userId]
      ? CUSTOM_TYPES[userId]
      : await this.client.users.fetch(userId).catch(() => null);
    if (player.text_channel_id) {
      const embed = new EmbedBuilder()
        .setColor(this.client.getColor("MAIN"))
        .setAuthor({ name: t("commons:music.nowPlaying") })
        .setTitle(info.title)
        .setTimestamp(current?.added_at)
        .setFooter({
          text: t("commons:music.addedBy", { tag: user?.tag }),
          iconURL: user?.displayAvatarURL({
            size: 256,
            extension: "png",
            forceStatic: false,
          }),
        });
      if (player.display_artwork) embed.setThumbnail(info.artworkUrl);
      if (Utils.isURL(info.uri)) embed.setURL(info.uri);
      if (!player.message_id) {
        await this.client.rest
          .post(Routes.channelMessages(player.text_channel_id), {
            auth: true,
            body: { embeds: [embed.data] },
          })
          .then((msg) =>
            Object.assign(data, { message_id: (msg as APIMessage).id })
          )
          .catch((err) => {
            if (err instanceof DiscordAPIError && err.code === 10003) {
              Object.assign(data, {
                text_channel_id: null,
                text_channel_name: null,
              });
            }
          });
      } else if (player.text_channel_id) {
        this.client.rest
          .patch(
            Routes.channelMessage(player.text_channel_id, player.message_id),
            {
              auth: true,
              body: { embeds: [embed.data] },
            }
          )
          .catch(async (err) => {
            if (err instanceof DiscordAPIError) {
              if (err.code === 10003) {
                Object.assign(data, {
                  text_channel_id: null,
                  text_channel_name: null,
                  message_id: null,
                });
              } else if (err.code === 10008) {
                await this.client.rest
                  .post(
                    Routes.channelMessages(player?.text_channel_id as string),
                    {
                      auth: true,
                      body: { embeds: [embed.data] },
                    }
                  )
                  .then((msg) =>
                    Object.assign(data, { message_id: (msg as APIMessage).id })
                  );
              }
            }
          });
      }
    }
    await this.updatePlayer(player.id, data);
    await this.updateLastfmProfiles(info, [...voiceChannel.members.values()]);
  }

  async onTrackException({ guildId, info }: TrackExceptionEvent, node: Node) {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return;
    const player = await this.getPlayer(guildId);
    if (!player) {
      node.send({ op: "destroy", guildId });
      return;
    }
    if (!player.text_channel_id) return;
    const permissions = guild.channels
      .resolve(player.text_channel_id)
      ?.permissionsFor(this.client.user?.id as string);
    if (
      permissions?.has(["SendMessages", "AttachFiles"], true) &&
      (!guild.members.me?.isCommunicationDisabled() ||
        (guild.members.me?.isCommunicationDisabled() &&
          permissions.has("Administrator")))
    ) {
      const db = await this.getDatabaseConfig(guildId);
      const userId = (info.user as { id: string }).id;
      const user = CUSTOM_TYPES[userId]
        ? CUSTOM_TYPES[userId]
        : await this.client.users.fetch(userId).catch(() => null);
      const t = this.client.i18next.getFixedT(
        db?.language ?? guild.preferredLocale
      );
      const embed = new EmbedBuilder()
        .setDescription(
          t("commons:music.trackException", {
            title: info.title,
            uri: info.uri,
            extra: user
              ? t("commons:music.addedByEvent", { tag: t(user.tag) })
              : "",
          })
        )
        .setColor(this.client.getColor("ERROR"))
        .setTimestamp();

      this.client.rest
        .post(Routes.channelMessages(player.text_channel_id), {
          body: { embeds: [embed.data] },
          auth: true,
        })
        .then((value) => {
          const message = value as APIMessage;
          this.client.pendingDeletion.add(message.id);
          setTimeout(() => {
            if (this.client.pendingDeletion.has(message.id))
              this.client.rest
                .delete(Routes.channelMessage(message.channel_id, message.id), {
                  auth: true,
                })
                .catch(() => null);
            this.client.pendingDeletion.delete(message.id);
          }, 120000);
        });
    }
  }

  async onTrackStuck(
    { guildId, thresholdMs: time, info }: TrackStuckEvent,
    node: Node
  ) {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return;
    const player = await this.getPlayer(guildId);
    if (!player) {
      node.send({ op: "destroy", guildId });
      return;
    }
    if (!player.text_channel_id) return;
    const permissions = guild.channels
      .resolve(player.text_channel_id)
      ?.permissionsFor(this.client.user?.id as string);
    if (
      permissions?.has(["SendMessages", "AttachFiles"], true) &&
      (!guild.members.me?.isCommunicationDisabled() ||
        (guild.members.me?.isCommunicationDisabled() &&
          permissions.has("Administrator")))
    ) {
      const db = await this.getDatabaseConfig(guildId);
      const userId = (info.user as { id: string }).id;
      const user = CUSTOM_TYPES[userId]
        ? CUSTOM_TYPES[userId]
        : await this.client.users.fetch(userId).catch(() => null);
      const t = this.client.i18next.getFixedT(
        db?.language ?? guild.preferredLocale
      );
      const embed = new EmbedBuilder()
        .setDescription(
          t("commons:music.trackStuck", {
            title: info.title,
            uri: info.uri,
            time,
            extra: user
              ? t("commons:music.addedByEvent", { tag: t(user.tag) })
              : "",
          })
        )
        .setColor(this.client.getColor("ERROR"))
        .setTimestamp();

      this.client.rest
        .post(Routes.channelMessages(player.text_channel_id), {
          body: { embeds: [embed.data] },
          auth: true,
        })
        .then((value) => {
          const message = value as APIMessage;
          this.client.pendingDeletion.add(message.id);
          setTimeout(() => {
            if (this.client.pendingDeletion.has(message.id))
              this.client.rest
                .delete(Routes.channelMessage(message.channel_id, message.id), {
                  auth: true,
                })
                .catch(() => null);
            this.client.pendingDeletion.delete(message.id);
          }, 120000);
        });
    }
  }

  private getDatabaseConfig(guildId: string) {
    return this.client.prisma.guild
      .findUnique({
        where: {
          id: guildId,
        },
      })
      .catch(() => null);
  }

  private getPlayerTracks(playerId: number) {
    return this.client.prisma.playerTrack
      .findMany({ where: { player_id: playerId } })
      .catch(() => null);
  }

  private getPlayer(guildId: string) {
    return this.client.prisma.player
      .findMany({
        where: {
          guild_id: guildId,
          platform: "DISCORD",
          bot_id: this.client.user?.id,
        },
      })
      .then((players) => players?.[0] ?? null)
      .catch(() => null);
  }

  private startTrack({
    track,
    guildId,
    volume,
    node,
    startTime = 0,
  }: {
    track?: string;
    guildId: string;
    volume: number;
    node: Node;
    startTime?: number;
  }) {
    return Promise.all([
      node.send({ op: "play", track, guildId, startTime }),
      node.send({ op: "volume", guildId, volume }),
    ]);
  }

  private updatePlayer(playerId: number, data: object) {
    return this.client.prisma.player.update({ where: { id: playerId }, data });
  }

  private async updateLastfmProfiles(info: TrackInfo, members: GuildMember[]) {
    const users = members
      .filter((m) => !m.user.bot)
      .map(({ user }) => ExtendedUser.toExtendedUser(user, this.client));
    if (users.length > 0) {
      const accounts = await Promise.all(users.map((u) => u.fetchAccount()));
      const connections = await this.client.prisma.userConnection.findMany({
        where: {
          user_id: { in: accounts.map((a) => a.id) },
          platform: "LASTFM",
          config: {
            equals: { scrobbling: true },
          },
        },
      });
      await Promise.all(
        connections.map((c) =>
          this.client.lastfm.updateNowplaying(
            { ...info, authors: [{ name: info.author }] },
            c.access_token
          )
        )
      );
    }
  }

  private async scrobbleLastfmProfiles(
    info: TrackInfo,
    members: GuildMember[]
  ) {
    const users = members
      .filter((m) => !m.user.bot)
      .map(({ user }) => ExtendedUser.toExtendedUser(user, this.client));
    if (users.length > 0) {
      const accounts = await Promise.all(users.map((u) => u.fetchAccount()));
      const connections = await this.client.prisma.userConnection.findMany({
        where: {
          user_id: { in: accounts.map((a) => a.id) },
          platform: "LASTFM",
          config: {
            equals: { scrobbling: true },
          },
        },
      });
      await Promise.all(
        connections.map((c) =>
          this.client.lastfm.updateNowplaying(
            { ...info, authors: [{ name: info.author }] },
            c.access_token
          )
        )
      );
    }
  }
}
