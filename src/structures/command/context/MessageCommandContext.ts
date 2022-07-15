/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  CacheType,
  CommandInteraction,
  ContextMenuCommandInteraction,
  Guild,
  GuildMember,
  Message,
  MessageEditOptions,
  ReplyMessageOptions,
  TextBasedChannel,
} from "discord.js";
import { Guild as GuildDB } from "@prisma/client";
import { TypingData } from "../../../@types";
import { Tune } from "../../../Tune";
import { ExtendedUser } from "../../ExtendedUser";
import { Command } from "../Command";
import { CommandContext, ReplyPayload } from "./CommandContext";

export class MessageCommandContext implements CommandContext {
  public readonly guild?: Guild;
  public readonly member?: GuildMember;
  public readonly channel: TextBasedChannel;
  public readonly user: ExtendedUser;
  public readonly command: Command;
  public readonly language: string;
  public client: Tune;
  public readonly message: Message;
  public readonly interaction?:
    | CommandInteraction<CacheType>
    | ContextMenuCommandInteraction<CacheType> = undefined;

  public flags: object = {};
  private readonly replies: Array<Message> = [];
  public readonly guildDB?: GuildDB | null;

  constructor(
    message: Message,
    command: Command,
    language: string,
    guildDB?: GuildDB | null
  ) {
    this.client = message.client as Tune;

    this.guild = message.guild ?? undefined;
    this.member = message.member ?? undefined;
    this.user = ExtendedUser.toExtendedUser(message.author, this.client);
    this.channel = message.channel;
    this.language = language;

    this.command = command;
    this.message = message;
    this.guildDB = guildDB;
  }

  get t() {
    return this.client.i18next.getFixedT(this.language);
  }

  reply(options: ReplyMessageOptions) {
    return this.message.reply(options).then((msg) => {
      this.replies.push(msg);
      return msg;
    });
  }

  editReply(options: ReplyPayload): Promise<unknown> {
    if (options.messageId) {
      const reply = this.replies.find(({ id }) => id === options.messageId);
      delete options.messageId;
      if (!reply) return this.reply(options);
      return reply.edit(options as MessageEditOptions);
    }
    return this.reply(options);
  }

  deleteReply(replyId?: string): Promise<unknown> {
    if (!replyId) {
      const msg = this.replies.shift();
      return msg?.delete() ?? Promise.resolve(replyId);
    }
    const index = this.replies.findIndex(({ id }) => id === replyId);
    const [msg] = this.replies.splice(index, 1);
    return msg?.delete() ?? Promise.resolve(replyId);
  }

  startTyping(): Promise<boolean> {
    if (this.client.typings.has(this.channel.id)) {
      // eslint-disable-next-line no-plusplus
      this.client.typings.get(this.channel.id)!.calls++;
      return Promise.resolve(true);
    }
    const data = {
      calls: 1,
      interval: setInterval(this.channel.sendTyping.bind(this.channel), 9000),
      channelId: this.channel.id,
    } as TypingData;
    this.client.typings.set(this.channel.id, data);
    return this.channel.sendTyping().then(() => true);
  }

  stopTyping(): Promise<boolean> {
    if (this.client.typings.has(this.channel.id)) {
      const data = this.client.typings.get(this.channel.id) as TypingData;
      if (data.calls - 1 > 0) {
        // eslint-disable-next-line no-plusplus
        data.calls--;
        this.client.typings.delete(data.channelId);
        this.client.typings.set(data.channelId, data);
        return Promise.resolve(true);
      }
      clearInterval(data.interval);
      this.client.typings.delete(data.channelId);
      return Promise.resolve(true);
    }

    return Promise.resolve(true);
  }

  setFlags(flags: object): void {
    this.flags = flags;
  }
}
