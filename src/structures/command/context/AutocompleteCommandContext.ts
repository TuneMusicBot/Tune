import {
  AutocompleteInteraction,
  Guild,
  GuildMember,
  Message,
  TextBasedChannel,
} from "discord.js";
import { Tune } from "../../../Tune";
import { ExtendedUser } from "../../ExtendedUser";
import { Command } from "../Command";
import { CommandContext } from "./CommandContext";

export class AutocompleteCommandContext implements CommandContext {
  public readonly guild?: Guild;
  public readonly member?: GuildMember;
  public readonly channel: TextBasedChannel;
  public readonly user: ExtendedUser;
  public readonly command: Command;
  public readonly language: string;
  public readonly client: Tune;
  public readonly message?: Message = undefined;
  public readonly interaction: AutocompleteInteraction;
  public flags: object = {};

  constructor(interaction: AutocompleteInteraction, command: Command) {
    this.client = interaction.client as Tune;

    this.guild = interaction.guildId
      ? this.client.guilds.cache.get(interaction.guildId)
      : undefined;
    this.user = ExtendedUser.toExtendedUser(interaction.user, this.client);
    this.member = this.guild?.members.cache.get(this.user.id);
    this.channel = interaction.channel as TextBasedChannel;
    this.language =
      !command.private && interaction.guildLocale
        ? interaction.guildLocale
        : interaction.locale;

    this.command = command;
    this.interaction = interaction;
  }

  get t() {
    return this.client.i18next.getFixedT(this.language);
  }

  reply() {
    return Promise.resolve(true);
  }

  editReply(): Promise<unknown> {
    return Promise.resolve(true);
  }

  deleteReply(): Promise<unknown> {
    return Promise.resolve(true);
  }

  startTyping(): Promise<boolean> {
    return Promise.resolve(true);
  }

  stopTyping(): Promise<boolean> {
    return Promise.resolve(true);
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setFlags(): void {}
}
