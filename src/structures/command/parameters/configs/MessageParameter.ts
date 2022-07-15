import { DiscordSnowflake } from "@sapphire/snowflake";
import { GuildTextBasedChannel, Message } from "discord.js";
import { MessageOpts, Option } from "../../../../@types/commands";
import { CommandError } from "../../CommandError";
import { CommandContext } from "../../context/CommandContext";
import { SlashCommandContext } from "../../context/SlashCommandContext";
import { Parameter } from "../Parameter";

const MSG_REGEX =
  /(?:http:\/\/|https:\/\/|)(?:canary\.|ptb\.|development\.|)discord(?:app|)\.com\/channels\/(?<guildId>[0-9]{16,20})\/(?<channelId>[0-9]{16,20})\/(?<messageId>[0-9]{16,20})/;

export class MessageParameter implements Parameter<Message, MessageOpts> {
  generateOptions(parameter: any): MessageOpts {
    return {
      name: parameter.name,
      type: "message",
      showUsage: !!parameter.showUsage,
      required: !!parameter.required,
      maxTime: parameter.maxTime ?? 0,
      maxTimeError: parameter.maxTimeError ?? "errors:messageMaxTime",
      sameGuildOnly: !!parameter.sameGuildOnly,
      sameChannelOnly: !!parameter.sameChannelOnly,
    };
  }

  async parseOption(
    context: CommandContext,
    option: Option,
    opts: MessageOpts
  ): Promise<Message<boolean>> {
    if (
      (context as SlashCommandContext) &&
      context.interaction?.isMessageContextMenuCommand()
    ) {
      const message = option.value as Message;
      this.parseMessageData(
        {
          guildId: message.guildId,
          channelId: message.channelId,
          messageId: message.id,
        },
        context,
        opts
      );
      return message;
    }
    const message = await this.fetchMessage(
      option.value as string,
      context,
      opts
    );
    if (!message)
      throw new CommandError(
        context.t("errors:unknownMessage"),
        opts.showUsage,
        context
      );
    return message;
  }

  private async fetchMessage(
    url: string,
    context: CommandContext,
    opts: MessageOpts
  ): Promise<Message | null> {
    const result = MSG_REGEX.exec(url);
    if (result) {
      const { guildId, channelId, messageId } = result.groups as {
        guildId: string;
        channelId: string;
        messageId: string;
      };
      this.parseMessageData({ guildId, messageId, channelId }, context, opts);
      const message: Message | null = await (
        context.client.channels.resolve(channelId) as GuildTextBasedChannel
      ).messages
        .fetch(messageId)
        .catch(() => null);
      if (message) return message;
    }
    return null;
  }

  private parseMessageData(
    result: BasicData,
    context: CommandContext,
    opts: MessageOpts
  ) {
    if (opts.sameGuildOnly && result.guildId !== context.guild?.id)
      throw new CommandError(
        context.t("errors:messageSameGuildOnly"),
        false,
        context
      );
    if (opts.sameChannelOnly && result.channelId !== context.channel.id)
      throw new CommandError(
        context.t("errors:messageSameChannelOnly"),
        false,
        context
      );
    const { timestamp } = DiscordSnowflake.deconstruct(result.messageId);
    if (opts.maxTime > 0 && Date.now() - Number(timestamp) > opts.maxTime)
      throw new CommandError(context.t(opts.maxTimeError), false, context);
  }
}

interface BasicData {
  guildId: string | null;
  messageId: string;
  channelId: string;
}
