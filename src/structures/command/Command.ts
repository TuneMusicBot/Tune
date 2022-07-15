/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  AutocompleteFocusedOption,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { GuildPermission } from "@prisma/client";
import {
  CommandOptions,
  CommandParameter,
  CommandRequirementsOpts,
  CommandTypes,
  CommandCategories,
} from "../../@types/commands";
import { Tune } from "../../Tune";
import { CommandError } from "./CommandError";
import { CommandContext } from "./context/CommandContext";
import { AutocompleteCommandContext } from "./context/AutocompleteCommandContext";
import { MessageCommandContext } from "./context/MessageCommandContext";
import { SlashCommandContext } from "./context/SlashCommandContext";
import { COLORS } from "../../utils/Constants";
import { CommandParameters } from "./parameters/CommandParameters";
import { CommandRequirements } from "./CommandRequirements";
import { PermissionsNames } from "../../@types";
import { CustomPermissions } from "../../utils/CustomPermissions";

export class Command {
  public readonly name: string;
  public readonly type: CommandTypes;
  public readonly voice: boolean;
  public readonly replyPrivate: boolean;

  public readonly private: boolean;
  public readonly aliases: string[];
  public readonly slashOrder: string[];
  public readonly category: CommandCategories;

  public readonly flags: CommandParameter[];
  public readonly parameters: CommandParameter[];
  public readonly requirements: CommandRequirementsOpts;

  public readonly client: Tune;

  constructor(options: CommandOptions, client: Tune) {
    this.name = options.name;
    this.type = options.type;
    this.voice = options.voice;
    this.replyPrivate = options.replyPrivate;

    this.private = options?.private ?? false;
    this.aliases = options.aliases?.map((a) => a.toLowerCase()) ?? [];
    this.slashOrder = options.slashOrder?.map((a) => a.toLowerCase()) ?? [];
    this.category = options?.category ?? "music";

    this.client = client;

    this.flags = options?.flags ?? [];
    this.parameters = options?.parameters ?? [];
    this.requirements = options?.requirements ?? {};
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  public async run(context: CommandContext, args: object): Promise<any> {}
  public autocomplete(
    context: AutocompleteCommandContext,
    option: AutocompleteFocusedOption
    // eslint-disable-next-line @typescript-eslint/no-empty-function
  ) {}

  public async handleMessage(
    context: MessageCommandContext,
    args: string[]
  ): Promise<any> {
    try {
      await CommandRequirements.handleRequirements(context, this.requirements);
    } catch (error: any) {
      return this.handleError(error);
    }

    let output = {};
    try {
      output = await CommandParameters.handleMessage(context, args);
    } catch (error: any) {
      return this.handleError(error);
    }

    try {
      const result = await this.run(context, output);
      return result;
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  public async handleRequirements(
    context: MessageCommandContext
  ): Promise<boolean> {
    await CommandRequirements.handleRequirements(context, this.requirements);

    return true;
  }

  public async handleSlash(context: SlashCommandContext): Promise<any> {
    try {
      await CommandRequirements.handleRequirements(context, this.requirements);
    } catch (error: any) {
      return this.handleError(error);
    }

    let output = {};
    if (context.interaction.isMessageContextMenuCommand()) {
      const name =
        this.parameters.find((c) => c.type === "message")?.name ?? "message";
      Object.defineProperty(output, name, {
        value: context.interaction.targetMessage,
      });
    } else if (context.interaction.isUserContextMenuCommand()) {
      const userName =
        this.parameters.find((c) => c.type === "user")?.name ?? "user";
      Object.defineProperty(output, userName, {
        value: context.interaction.targetUser,
      });
      if (context.interaction.targetMember) {
        const memberName =
          this.parameters.find((c) => c.type === "member")?.name ?? "member";
        Object.defineProperty(output, memberName, {
          value: context.interaction.targetMember,
        });
      }
    } else if (context.interaction.isChatInputCommand()) {
      try {
        output = await CommandParameters.handleSlash(context);
      } catch (error: any) {
        return this.handleError(error);
      }
    }

    try {
      const result = await this.run(context, output);
      return result;
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  public handleError(error: Error) {
    if (error instanceof CommandError) {
      if (!error.handled) {
        const embed = new EmbedBuilder()
          .setFooter({ text: error.context.user.tag })
          .setTimestamp()
          .setColor(this.client.getColor("ERROR"));
        if (error.message && error.message.length) {
          let description = error.message;
          if (error.showUsage) description += `\n${this.usage()}`;
          embed.setDescription(`**${description}**`);
        }
        const payload = { embeds: [embed.data], ephemeral: true };
        if (error.message !== error.context.t("errors:generic")) {
          const helpButton = new ButtonBuilder()
            .setDisabled(false)
            .setLabel(error.context.t("commons:helpButton"))
            .setCustomId(`help-${this.name.replaceAll(" ", "-")}`)
            .setStyle(ButtonStyle.Primary);
          Object.assign(payload, {
            components: [{ type: 1, components: [helpButton.data] }],
          });
        }
        error.context.reply(payload);
        error.handled = true;
      }
      return;
    }

    this.client.logger.error(error as any, { error, tags: ["Command"] });
  }

  public usage(): string {
    return "";
  }

  public reactionOrMessage(
    context: CommandContext,
    emoji: string,
    message: string
  ) {
    if (context instanceof MessageCommandContext)
      return context.message.react(emoji);
    return context.reply({
      embeds: [
        new EmbedBuilder()
          .setTimestamp()
          .setFooter({ text: context.user.tag })
          .setColor(COLORS.MAIN)
          .setDescription(`**${context.t(message)}**`).data,
      ],
    });
  }

  public async hasPermission(
    context: CommandContext,
    permissions: PermissionsNames[]
  ): Promise<boolean> {
    const perms = ((await context.client.prisma.guildPermission.findMany({
      where: { guild_id: context.guild?.id },
    })) || [
      {
        id: "everyone",
        guild_id: context.guild?.id,
        allow: 76,
        deny: 50,
      },
    ]) as GuildPermission[];
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const everyonePerm = perms.find((p) => p.id === "everyone")!;
    const deny = new CustomPermissions(everyonePerm.deny);
    const p = perms.filter(
      (pe) =>
        pe.id === context.user.id || context.member?.roles.cache.has(pe.id)
    );
    if (p.length > 0) {
      perms.map((perm) => deny.add(perm.deny));
    }
    if (!context.member?.permissions.has("Administrator")) {
      const missingPermissions: string[] = [];
      permissions.map((perm) =>
        deny.has(perm) ? missingPermissions.push(perm) : null
      );
      if (missingPermissions.length > 0) return false;
    }
    return true;
  }
}
