import {
  AutocompleteInteraction,
  CommandInteraction,
  ContextMenuCommandInteraction,
  Guild,
  GuildMember,
  Message,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  ReplyMessageOptions,
  TextBasedChannel,
} from "discord.js";
import { TFunction } from "i18next";
import { Guild as GuildDB } from "@prisma/client";
import { Tune } from "../../../Tune";
import { ExtendedUser } from "../../ExtendedUser";
import { Command } from "../Command";

export interface CommandContext {
  readonly guild?: Guild;
  readonly member?: GuildMember;
  readonly channel: TextBasedChannel;
  readonly user: ExtendedUser;
  readonly command: Command;
  readonly language: string;
  readonly guildDB?: GuildDB | null;
  client: Tune;
  readonly message?: Message;
  readonly interaction?:
    | CommandInteraction
    | ContextMenuCommandInteraction
    | AutocompleteInteraction
    | MessageComponentInteraction
    | ModalSubmitInteraction;
  flags: object;

  get t(): TFunction;

  reply(options: ReplyPayload): Promise<unknown>;
  editReply(options: ReplyPayload): Promise<unknown>;
  deleteReply(replyId?: string): Promise<unknown>;
  startTyping(ephemeral: boolean): Promise<boolean>;
  stopTyping(): Promise<boolean>;

  setFlags(flags: object): void;
}

export interface ReplyPayload extends ReplyMessageOptions {
  messageId?: string;
  ephemeral?: boolean;
}
