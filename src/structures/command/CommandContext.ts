import {
  Message,
  Guild,
  Member,
  TextableChannel,
  User,
  MessageContent,
  MessageContentEdit,
  AdvancedMessageContent,
} from "eris";
import {
  Guild as GuildSettings,
  User as Account,
  UserConnection,
} from "@prisma/client";
import { Tune } from "../../Tune";
import { Command } from "./Command";
import { EditReplyOptions, ReplyOptions } from "../../@types";

export class CommandContext {
  public readonly guild?: Guild;
  public readonly guildSettings?: GuildSettings;
  public readonly guildLanguage?: string;
  public readonly member?: Member;
  public readonly channel: TextableChannel;
  public readonly account: Account;
  public readonly user: User;
  public readonly language: string;
  public readonly command: Command<object>;
  public readonly message: Message;
  public readonly connection: UserConnection;
  public readonly client: Tune;
  public flags = {};
  private readonly replies: Message[] = [];

  constructor(
    message: Message,
    client: Tune,
    account: Account,
    command: Command<object>,
    connection: UserConnection,
    settings?: GuildSettings
  ) {
    this.message = message;
    this.channel = message.channel;
    this.account = account;
    this.user = message.author;
    this.client = client;
    this.guildSettings = settings;
    this.command = command;
    this.guild = message.guildID
      ? client.guilds.get(message.guildID)
      : undefined;
    this.guildLanguage =
      this.guildSettings?.language ?? this.guild?.preferredLocale;
    this.language = this.account.language;
    this.member = message.member ?? undefined;
    this.connection = connection;
  }

  get t() {
    return this.client.i18next.getFixedT(this.language);
  }

  reply(options: ReplyOptions): Promise<Message> {
    const payload = options as AdvancedMessageContent;
    if (this.replies.length === 0 && !payload.messageReference)
      payload.messageReference = {
        messageID: this.message.id,
        channelID: this.channel.id,
        guildID: this.guild?.id,
        failIfNotExists: false,
      };
    return this.channel
      .createMessage(options as MessageContent, options.files)
      .then((msg) => {
        this.replies.push(msg);
        return msg;
      });
  }

  editReply(options: EditReplyOptions): Promise<Message> {
    const replyIndex = this.replies.findIndex(
      (r) => r.id === options.messageID
    );
    if (replyIndex === -1)
      return this.channel
        .createMessage(options as MessageContent, options.files)
        .then((msg) => {
          this.replies.push(msg);
          return msg;
        });
    return this.client
      .editMessage(
        this.channel.id,
        this.replies[replyIndex].id,
        options as MessageContentEdit
      )
      .then((edit) => {
        this.replies.splice(replyIndex, 0, edit);
        return edit;
      });
  }

  deleteReply(messageID?: string): Promise<unknown> {
    if (!messageID && this.replies.length === 1)
      return this.replies[0].delete();
    const reply = this.replies.find((r) => r.id === messageID);
    if (reply) return reply.delete();
    return Promise.resolve();
  }

  async startTyping(): Promise<unknown> {
    const typing = this.client.typings.get(this.channel.id);
    if (!typing) {
      await this.channel.sendTyping();
      this.client.typings.set(this.channel.id, {
        channelID: this.channel.id,
        calls: 1,
        interval: setInterval(() => this.channel.sendTyping(), 9000),
      });
      return Promise.resolve();
    }
    this.client.typings.delete(this.channel.id);
    this.client.typings.set(this.channel.id, {
      channelID: this.channel.id,
      calls: typing.calls + 1,
      interval: typing.interval,
    });
    return Promise.resolve();
  }

  stopTyping(): Promise<unknown> {
    const typing = this.client.typings.get(this.channel.id);
    if (!typing) return Promise.resolve();
    if (typing.calls - 1 <= 0) {
      this.client.typings.delete(this.channel.id);
      clearInterval(typing.interval);
      return Promise.resolve();
    }
    this.client.typings.delete(this.channel.id);
    this.client.typings.set(this.channel.id, {
      channelID: this.channel.id,
      calls: typing.calls - 1,
      interval: typing.interval,
    });
    return Promise.resolve();
  }
}
