import { ButtonBuilder, EmbedBuilder } from "@discordjs/builders";
import { ButtonStyle, ComponentType } from "discord-api-types/v10";
import {
  CommandOptions,
  CommandParameter,
  CommandRequirementsOpts,
} from "../../@types/commands";
import { Tune } from "../../Tune";
import { COLORS } from "../../utils/Constants";
import { CommandError } from "./CommandError";
import { CommandRequirements } from "./CommandRequirements";
import { CommandContext } from "./CommandContext";
import { CommandParameters } from "./parameters/CommandParameters";

export enum CommandTypes {
  UNIVERSAL_COMMAND,
  CHAT_INPUT_ONLY,
  MESSAGE_BASED_ONLY,
  USER_CONTEXT_MENU,
  MESSAGE_CONTEXT_MENU,
  MODAL_SUBMIT,
}

export class Command<T extends object> {
  public readonly id?: string;
  public readonly name: string;
  public readonly aliases: string[];
  public readonly type: CommandTypes;
  public readonly private: boolean;
  public readonly voiceHasPriority: boolean;
  public readonly ephemeral: boolean;
  public readonly slashOrder: string[];
  public readonly parameters: CommandParameter[];
  public readonly flags: CommandParameter[];
  public readonly requirements: CommandRequirementsOpts;

  public readonly client: Tune;

  constructor(options: CommandOptions, client: Tune) {
    this.name = options.name;
    this.aliases = options.aliases ?? [];
    this.type = options.type;
    this.id = options.id;
    this.private = !!options.private;
    this.voiceHasPriority = options.voiceHasPriority;
    this.ephemeral = options.ephemeral;
    this.slashOrder = options.slashOrder ?? [];
    this.parameters = options.parameters ?? [];
    this.flags = options.flags ?? [];
    this.requirements = options.requirements ?? {};
    this.client = client;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
  public run(context: CommandContext, args: T): any | Promise<any> {}

  public async handleMessageCmmand(context: CommandContext, args: string[]) {
    try {
      await CommandRequirements.handle(context, this.requirements);
      const output = await CommandParameters.handle<T>(context, args);
      await this.run(context, output);
    } catch (e) {
      this.handleError(e);
    }
  }

  public handleError(error: unknown) {
    if (error instanceof CommandError) {
      const embed = new EmbedBuilder()
        .setColor(COLORS.ERROR)
        .setTimestamp()
        .setFooter({
          text: `${error.context.user.username}#${error.context.user.discriminator}`,
        })
        .setDescription(`**${error.message}**`);
      const payload = { embeds: [embed.data], flags: 64 };
      if (error.displayHelpButton) {
        const button = new ButtonBuilder()
          .setStyle(ButtonStyle.Primary)
          .setCustomId(`help-${error.context.user.id}-${error.helpButtonId}`)
          .setLabel(error.context.t("commons:helpButton"));
        Object.assign(payload, {
          components: [
            { type: ComponentType.ActionRow, components: [button.data] },
          ],
        });
      }
      if (!error.handled) {
        error.handled = true;
        error.context.reply(payload);
      }
      return;
    }
    this.client.logger.error(error as any, { tags: ["Commands"] });
  }
}
