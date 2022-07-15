import {
  CommandInteraction,
  ContextMenuCommandInteraction,
  Guild,
  GuildMember,
  InteractionReplyOptions,
  Message,
  ReplyMessageOptions,
  TextBasedChannel,
} from "discord.js";
import { Guild as GuildDB } from "@prisma/client";
import { Tune } from "../../../Tune";
import { ExtendedUser } from "../../ExtendedUser";
import { Command } from "../Command";
import { CommandContext, ReplyPayload } from "./CommandContext";

export class SlashCommandContext implements CommandContext {
  public readonly guild?: Guild;
  public readonly member?: GuildMember;
  public readonly channel: TextBasedChannel;
  public readonly user: ExtendedUser;
  public readonly command: Command;
  public readonly language: string;
  public readonly client: Tune;
  public readonly message?: Message = undefined;
  public readonly interaction: CommandInteraction;
  public readonly guildDB?: GuildDB | null;
  public flags: object = {};

  constructor(
    interaction: CommandInteraction | ContextMenuCommandInteraction,
    command: Command,
    guildDB?: GuildDB | null
  ) {
    this.client = interaction.client as Tune;

    this.guild = interaction.guildId
      ? this.client.guilds.cache.get(interaction.guildId)
      : undefined;
    this.user = ExtendedUser.toExtendedUser(interaction.user, this.client);
    this.member = this.guild?.members.cache.get(this.user.id);
    this.channel = interaction.channel as TextBasedChannel;
    this.language =
      !command.replyPrivate && interaction.guildLocale
        ? interaction.guildLocale
        : interaction.locale;

    this.command = command;
    this.interaction = interaction;
    this.guildDB = guildDB;
  }

  get t() {
    return this.client.i18next.getFixedT(this.language);
  }

  reply(options: ReplyMessageOptions) {
    if (this.interaction.replied)
      return this.interaction.followUp(options as InteractionReplyOptions);
    if (this.interaction.deferred) return this.interaction.editReply(options);
    return this.interaction.reply(
      Object.assign(options, { fetchReply: true }) as InteractionReplyOptions
    );
  }

  editReply(options: ReplyPayload): Promise<unknown> {
    if (options.messageId) {
      const { messageId } = options;
      delete options.messageId;
      return this.interaction.webhook.editMessage(messageId, options);
    }
    return this.interaction.editReply(options);
  }

  deleteReply(replyId?: string): Promise<unknown> {
    if (replyId) return this.interaction.webhook.deleteMessage(replyId);
    return this.interaction.deleteReply();
  }

  startTyping(ephemeral: boolean): Promise<boolean> {
    if (!this.interaction.replied && !this.interaction.deferred)
      return this.interaction.deferReply({ ephemeral }).then(() => true);
    return Promise.resolve(true);
  }

  stopTyping(): Promise<boolean> {
    return Promise.resolve(true);
  }

  setFlags(flags: object): void {
    this.flags = flags;
  }
}
