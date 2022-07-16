/* eslint-disable camelcase */
/* eslint-disable @typescript-eslint/no-non-null-asserted-optional-chain */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  Attachment,
  AutocompleteFocusedOption,
  ChannelType,
  EmbedBuilder,
  GuildTextBasedChannel,
  StageChannel,
  VoiceBasedChannel,
} from "discord.js";
import { AttachmentOpts, StringOpts } from "../../@types/commands";
import { Command } from "../../structures/command/Command";
import { CommandError } from "../../structures/command/CommandError";
import { AutocompleteCommandContext } from "../../structures/command/context/AutocompleteCommandContext";
import { CommandContext } from "../../structures/command/context/CommandContext";
import { MessageCommandContext } from "../../structures/command/context/MessageCommandContext";
import {
  Connection,
  ConnectionStates,
  TimeoutError,
} from "../../structures/Connection";
import { Node } from "../../structures/Node";
import { Tune } from "../../Tune";
import { Utils } from "../../utils/Utils";

const sources = [
  ["yt", "youtube"],
  ["ytm", "youtubemusic", "youtube-music"],
  ["sc", "soundcloud", "scloud", "soundc"],
  ["mx", "mixcloud", "mcloud", "mixc"],
  ["jm", "jamendo", "jamendo-music"],
];

export class Play extends Command {
  constructor(client: Tune) {
    super(
      {
        name: "play",
        type: 0,
        aliases: ["p", "pl"],
        category: "music",
        voice: true,
        private: false,
        replyPrivate: false,
        requirements: { voiceChanneOnly: true, sameVoiceChannelOnly: true },
        parameters: [
          {
            name: "query",
            type: "string",
            slashName: "song",
            required: false,
            showUsage: true,
            missingError: "errors:missingIdentifier",
            clean: false,
            lowerCase: false,
            upperCase: false,
            full: true,
          } as StringOpts,
          {
            name: "file",
            type: "attachment",
            required: false,
            max: 10,
          } as AttachmentOpts,
        ],
        flags: sources.map(([name, ...aliases]) => ({
          name,
          aliases,
          showUsage: false,
          required: false,
          type: "booleanFlag",
          slashName: "source",
        })),
      },
      client
    );
  }

  public async autocomplete(
    context: AutocompleteCommandContext,
    option: AutocompleteFocusedOption
  ): Promise<void> {
    if (option.name === "song") {
      const parsedString = option.value.trim();
      if (parsedString.length === 0) {
        const searches = await context.user
          .fetchAccount()
          .then((r) => r.recent_search ?? [])
          .catch(() => []);
        const results: { name: string; id: string }[] = [];
        searches.map((s) =>
          s
            ? results.push({
                id: (s as any).id as string,
                name: (s as any).name as string,
              })
            : null
        );
        await context.interaction.respond(
          results.map((o) => ({ value: o.id, name: Utils.limit(o.name, 97) }))
        );
        return;
      }
      const source =
        context.interaction.options.getString("source", false) || "yt";
      const result = await this.client.autocomplete
        .handle(parsedString, source)
        .catch(() => []);
      await context.interaction.respond(result).catch(() => null);
      return;
    }

    await context.interaction.respond([]);
  }

  async run(
    context: CommandContext,
    { query, file }: { query?: string; file?: Attachment[] }
  ) {
    const voiceChannel = context.member?.voice.channel as VoiceBasedChannel;
    if (!context.guild?.members.me?.permissions.has("Administrator")) {
      if (
        voiceChannel.userLimit <= voiceChannel.members.size &&
        !context.guild?.members.me?.permissions.has("ManageChannels")
      )
        throw new CommandError(
          context.t("errors:voiceChannelFull"),
          false,
          context
        );
      const myPerms = voiceChannel.permissionsFor(
        this.client.user?.id as string
      );
      if (!myPerms?.has(["ViewChannel", "Connect"]))
        throw new CommandError(
          context.t("errors:connectPermMissing"),
          false,
          context
        );
      if (!myPerms?.has("Speak"))
        throw new CommandError(
          context.t("errors:speakPermMissing"),
          false,
          context
        );
    }
    const identifier = file && file.length > 0 ? file[0].url : query;
    if (!identifier)
      throw new CommandError(
        context.t("errors:missingIdentifier"),
        true,
        context
      );
    await context.startTyping(false);
    let player = await this.client.prisma.player
      .findMany({
        where: {
          guild_id: context.guild?.id,
          platform: "DISCORD",
          bot_id: this.client.user?.id,
        },
      })
      .then((players) => players?.[0] ?? null)
      .catch(() => null);
    if (!player)
      player = await this.client.prisma.player.create({
        data: {
          platform: "DISCORD",
          bot_id: this.client.user?.id as string,
          guild_id: context.guild?.id as string,
          text_channel_id: context.channel.id,
          text_channel_name: (context.channel as GuildTextBasedChannel).name,
          voice_channel_id: voiceChannel.id,
          voice_channel_name: voiceChannel.name,
          voice_channel_type:
            // eslint-disable-next-line no-nested-ternary
            voiceChannel.type === ChannelType.GuildVoice
              ? "VOICE_CHANNEL"
              : (voiceChannel as StageChannel).stageInstance ||
                context.guild?.scheduledEvents.cache.find(
                  (e) => e.channelId === voiceChannel.id && e.isActive()
                )
              ? "ACTIVE_STAGE_CHANNEL"
              : "STAGE_CHANNEL",
          shard_id: context.guild?.shardId as number,
          state: "IDLE",
          actions: [{ type: "playerCreate", time: Date.now() }],
          index: 0,
          created_by: context.user.id,
          node_id: voiceChannel.rtcRegion
            ? this.client.getIdealNode(voiceChannel.rtcRegion).id
            : undefined,
        },
      });
    if (!this.client.connections.has(player.guild_id))
      this.client.connections.set(
        player.guild_id,
        new Connection(this.client, player.guild_id)
      );
    const conn = this.client.connections.get(player.guild_id) as Connection;
    try {
      if (conn.state === ConnectionStates.IDLE) {
        const needUpdate = typeof player.node_id !== "number";
        player = await conn.connect(0, player);
        if (needUpdate)
          player = await this.client.prisma.player.update({
            where: { id: player.id },
            data: { node_id: player.node_id },
          });
      }
    } catch (e) {
      if (e instanceof TimeoutError) {
        await context.stopTyping();
        await this.client.prisma.player.delete({ where: { id: player.id } });
        throw new CommandError(
          context.t("errors:connectionTimeout"),
          false,
          context
        );
      }
    }

    const node = this.client.nodes.get(player.node_id as number) as Node;
    const result = await node.loadTracks(
      identifier,
      context.user.toApiJson(),
      Utils.isURL(identifier)
    );

    if (result.loadType === "LOAD_FAILED") {
      await context.stopTyping();
      throw new CommandError(
        context.t("errors:faildToLoadTrack"),
        false,
        context
      );
    }
    if (result.loadType === "NO_MATCHES" || result.tracks.length <= 0) {
      await context.stopTyping();
      throw new CommandError(context.t("errors:noMatches"), false, context);
    }
    const embed = new EmbedBuilder()
      .setColor(this.client.getColor("MAIN"))
      .setTimestamp()
      .setFooter({ text: context.user.tag });
    if (
      result.loadType === "TRACK_LOADED" ||
      result.loadType === "SEARCH_RESULT"
    ) {
      const song = result.tracks[0];
      const exists = await this.client.prisma.playerTrack
        .findFirst({
          where: {
            player_id: player.id,
            info: { equals: { uri: song.info.uri } },
          },
        })
        .catch(() => null);
      if (
        !!exists &&
        typeof context.guildDB?.allow_dupes === "boolean" &&
        !context.guildDB.allow_dupes
      ) {
        await context.stopTyping();
        throw new CommandError(
          context.t("errors:dupesNotAllowed"),
          false,
          context
        );
      }
      await this.client.prisma.playerTrack.create({
        data: {
          player_id: player.id,
          info: song.info as object,
          track: song.track,
          added_at: new Date(),
          index: await this.client.prisma.playerTrack
            .count({ where: { player_id: player.id } })
            .catch(() => 0),
        },
      });
      embed.setDescription(
        `[\`${song.info.title}\`](${song.info.uri}) **|** \`${song.info.author}\` **|** ${context.user}`
      );
    }

    await context.stopTyping();
    await context.reply({ embeds: [embed.data] });

    if (player.state === "IDLE") {
      await Promise.all([
        node.send({
          op: "play",
          track: result.tracks[0].track,
          guildId: player.guild_id,
          startTime: 0,
        }),
        node.send({
          op: "volume",
          guildId: player.guild_id,
          volume: player.volume,
        }),
      ]);
    }
  }

  public async handleRequirements(
    context: MessageCommandContext
  ): Promise<boolean> {
    const result = await super.handleRequirements(context);
    if (!result) return false;
    const voiceChannel = context.member?.voice.channel as VoiceBasedChannel;
    if (!context.guild?.members.me?.permissions.has("Administrator")) {
      if (
        voiceChannel.userLimit <= voiceChannel.members.size &&
        !context.guild?.members.me?.permissions.has("ManageChannels")
      )
        throw new CommandError(
          context.t("errors:voiceChannelFull"),
          false,
          context
        );
      const myPerms = voiceChannel.permissionsFor(
        this.client.user?.id as string
      );
      if (!myPerms?.has(["ViewChannel", "Connect"]))
        throw new CommandError(
          context.t("errors:connectPermMissing"),
          false,
          context
        );
      if (!myPerms?.has("Speak"))
        throw new CommandError(
          context.t("errors:speakPermMissing"),
          false,
          context
        );
    }
    return true;
  }
}
