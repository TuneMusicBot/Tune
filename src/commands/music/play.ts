/* eslint-disable no-nested-ternary */
import { EmbedBuilder } from "@discordjs/builders";
import { Platforms } from "@prisma/client";
import {
  ChannelType,
  GuildScheduledEventStatus,
  PermissionFlagsBits,
} from "discord-api-types/v10";
import { AnyVoiceChannel, Attachment, GuildTextableChannel } from "eris";
import { AttachmentOpts, StringOpts } from "../../@types/commands";
import { Command, CommandTypes } from "../../structures/command/Command";
import { CommandError } from "../../structures/command/CommandError";
import { CommandContext } from "../../structures/command/CommandContext";
import {
  Connection,
  ConnectionStates,
  ConnectOptionsTypes,
} from "../../structures/Connection";
import { Tune } from "../../Tune";
import { COLORS } from "../../utils/Constants";
import { Utils } from "../../utils/Utils";

export class Play extends Command<{ song?: string; files?: Attachment[] }> {
  constructor(client: Tune) {
    super(
      {
        name: "play",
        aliases: ["p", "pplay"],
        type: CommandTypes.UNIVERSAL_COMMAND,
        voiceHasPriority: true,
        ephemeral: false,
        slashOrder: ["play"],
        parameters: [
          {
            name: "song",
            type: "string",
            full: true,
            required: false,
            showUsage: true,
            clean: true,
            lowerCase: false,
            upperCase: false,
            truncate: true,
            maxLength: Infinity,
          } as StringOpts,
          {
            name: "files",
            type: "attachment",
            required: false,
            max: 9,
            throwContent: false,
            showUsage: false,
          } as AttachmentOpts,
        ],
        requirements: {
          voiceChanneOnly: true,
          sameVoiceChannelOnly: true,
        },
      },
      client
    );
  }

  public async run(
    context: CommandContext,
    args: { song?: string | undefined; files?: Attachment[] | undefined }
  ) {
    const voiceChannel = context.guild?.channels.get(
      context.member?.voiceState?.channelID as string
    ) as AnyVoiceChannel;
    const me =
      context.guild?.members.get(context.client.user.id) ||
      (await context.client.getRESTGuildMember(
        context.guild?.id as string,
        context.client.user.id
      ));
    context.guild?.members.set(context.client.user.id, me);
    if (!me.permissions.has(PermissionFlagsBits.Administrator)) {
      if (
        voiceChannel.userLimit > 0 &&
        // @ts-ignore
        ((voiceChannel.userLimit <=
          // @ts-ignore
          context.guild?.voiceStates.filter(
            (s) => s.channelID === voiceChannel.id
          ).length) as number) &&
        !me.permissions.has(PermissionFlagsBits.ManageChannels)
      )
        throw new CommandError(
          context.t("errors:voiceChannelFull"),
          false,
          context
        );
      const myPerms = voiceChannel.permissionsOf(
        this.client.user?.id as string
      );
      if (
        !myPerms.has(PermissionFlagsBits.ViewChannel) ||
        !myPerms.has(PermissionFlagsBits.Connect)
      )
        throw new CommandError(
          context.t("errors:connectPermMissing"),
          false,
          context
        );
      if (!myPerms.has(PermissionFlagsBits.Speak))
        throw new CommandError(
          context.t("errors:speakPermMissing"),
          false,
          context
        );
    }
    const identifier: string | undefined = args.song
      ? args.song
      : args.files?.[0]?.url;
    if (!identifier)
      throw new CommandError(
        context.t("commands:play.missingIdentifier"),
        true,
        context,
        true
      );
    await context.startTyping();
    let player = await this.client.prisma.player
      .findFirst({
        where: {
          platform: Platforms.DISCORD,
          bot_id: this.client.user.id,
          guild_id: context.guild?.id,
        },
      })
      .catch(() => null);
    if (!player)
      player = await this.client.prisma.player.create({
        data: {
          platform: Platforms.DISCORD,
          shard_id: context.guild?.shard.id as number,
          guild_id: context.guild?.id as string,
          bot_id: this.client.user.id,
          state: "IDLE",
          index: 0,
          created_by: context.user.id,
          text_channel_id: context.channel.id,
          text_channel_name: (context.channel as GuildTextableChannel).name,
          voice_channel_id: voiceChannel.id,
          voice_channel_name: voiceChannel.name,
          voice_channel_type:
            voiceChannel.type === ChannelType.GuildVoice
              ? "VOICE_CHANNEL"
              : context.guild?.stageInstances.find(
                  (s) => s.channel.id === voiceChannel.id
                ) ||
                context.guild?.events.find(
                  (e) =>
                    // @ts-ignore Missing on types
                    e.channel.id === voiceChannel.id &&
                    e.status === GuildScheduledEventStatus.Active
                )
              ? "ACTIVE_STAGE_CHANNEL"
              : "STAGE_CHANNEL",
        },
      });
    const connection =
      this.client.connections.get(context.guild?.id as string) ||
      new Connection(this.client, context.guild?.id as string);
    if (!this.client.connections.has(context.guild?.id as string))
      this.client.connections.set(connection.guildId, connection);
    let node = this.client.nodes.get(player.node_id as number);
    if (connection.state === ConnectionStates.IDLE)
      node = await connection.connect({
        player,
        type: ConnectOptionsTypes.COMPLETE,
        confirm: false,
      });
    if (node && node.id !== player.node_id)
      player = await this.client.prisma.player.update({
        where: { id: player.id },
        data: { node_id: node.id },
      });
    const isURL = Utils.isURL(identifier);
    const result = await node?.loadTracks(
      isURL ? identifier : `ytsearch:${identifier}`,
      { id: context.user.id },
      isURL
    );
    if (result?.loadType === "LOAD_FAILED") {
      await context.stopTyping();
      throw new CommandError(
        context.t("errors:faildToLoadTrack"),
        false,
        context
      );
    }
    if (result?.loadType === "NO_MATCHES" || !result?.tracks.length) {
      await context.stopTyping();
      throw new CommandError(context.t("errors:noMatches"), false, context);
    }
    const embed = new EmbedBuilder()
      .setColor(COLORS.MAIN)
      .setTimestamp()
      .setFooter({
        text: `${context.user.username}#${context.user.discriminator}`,
      });
    let track: string | undefined;
    const index = await this.client.prisma.playerTrack.count({
      where: { player_id: player.id },
    });
    if (
      result.loadType === "SEARCH_RESULT" ||
      result.loadType === "TRACK_LOADED"
    ) {
      const song = result.tracks[0];
      embed.setDescription(
        `[\`${song.info.title}\`](${song.info.uri}) **|** \`${song.info.author}\` **|** ${context.user.mention}`
      );
      track = song.track;
      await this.client.prisma.playerTrack.create({
        data: {
          index,
          info: song.info as unknown as object,
          track: song.track,
          player_id: player.id,
        },
      });
    } else if (result.loadType === "PLAYLIST_LOADED") {
      const playlistName = result.playlistInfo?.uri
        ? `[\`${result.playlistInfo.name}\`](${result.playlistInfo.uri})`
        : `\`${result.playlistInfo?.name}\``;
      track = result.tracks[0].track;
      embed.setDescription(
        `${playlistName} **|** ${context.t(
          `commons:music.song${result.tracks.length > 1 ? "s" : ""}`,
          { size: result.tracks.length }
        )} **|** ${context.user.mention}`
      );
      await this.client.prisma.playerTrack.createMany({
        data: result.tracks.map((t, i) => ({
          index: index + i,
          info: t.info as unknown as object,
          track: t.track,
          player_id: player?.id as number,
          playlistInfo: result.playlistInfo as unknown as object,
        })),
      });
    }
    await context.stopTyping();
    await context.reply({ embeds: [embed.data] });
    if (player.state === "IDLE") {
      await node?.send({
        op: "play",
        track,
        guildId: context.guild?.id,
        startTime: 0,
      });
      await node?.send({
        op: "volume",
        guildId: context.guild?.id,
        volume: player.volume,
      });
    }
  }
}
