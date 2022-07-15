/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  AutocompleteInteraction,
  ButtonInteraction,
  ChannelType,
  ChatInputCommandInteraction,
  ContextMenuCommandInteraction,
  EmbedBuilder,
  Message,
} from "discord.js";
import { AutocompleteCommandContext } from "../structures/command/context/AutocompleteCommandContext";
import { MessageCommandContext } from "../structures/command/context/MessageCommandContext";
import { SlashCommandContext } from "../structures/command/context/SlashCommandContext";
import { EventListener } from "../structures/EventListener";
import { Tune } from "../Tune";

export class CommandListener extends EventListener {
  constructor(client: Tune) {
    super(
      [
        "messageCreate",
        "slashCommand",
        "contextMenu",
        "autocomplete",
        "buttonClick",
      ],
      client
    );
  }

  async onMessageCreate(message: Message) {
    if (
      !message.guildId ||
      !message.guild ||
      message.channel.type === ChannelType.DM ||
      !this.client.ready
    )
      return;
    // if (this.client.players.has(message.guildId)) {
    // const player = this.client.players.get(message.guildId)!;
    // eslint-disable-next-line no-plusplus
    // if (player.textId === message.channelId) player.message.index++;
    // }
    if (message.author.bot) return;
    if (
      !message.channel
        .permissionsFor(message.guild.members.me!)
        .has(["SendMessages", "ViewChannel"], true)
    )
      return;
    const guildDatabase = await this.client.prisma.guild
      .findFirst({ where: { id: message.guildId } })
      .catch(() => null);
    const prefixes: string[] =
      guildDatabase?.prefixes && guildDatabase.prefixes.length > 0
        ? guildDatabase.prefixes
        : [process.env.DEFAULT_PREFIX];
    const botMentions = [
      `<@!${this.client.user?.id}>`,
      `<@${this.client.user?.id}>`,
    ];
    prefixes.push(...botMentions);
    let usedPrefix = "";
    if (
      prefixes.some((prefix) => {
        const result = message.content.startsWith(prefix);
        if (result) usedPrefix = prefix;
        return result;
      })
    ) {
      const t = this.client.i18next.getFixedT(
        guildDatabase?.language ?? message.guild.preferredLocale
      );
      const nonPrefix = message.content.substring(usedPrefix.length);
      let cName = "";
      const command = this.client.commands.find((c) => {
        if (nonPrefix.startsWith(c.name)) {
          cName = c.name;
          return true;
        }
        return c.aliases.some((a) => {
          if (nonPrefix.startsWith(a)) {
            cName = a;
            return true;
          }
          return false;
        });
      });
      if (!command) {
        if (botMentions.includes(usedPrefix))
          message.reply(
            t(
              `commons:${
                prefixes.length - 2 === 1 ? "mentionPrefix" : "mentionPrefixes"
              }`,
              {
                userId: message.author.id,
                prefixes: prefixes
                  .filter((p) => !botMentions.includes(p))
                  .slice(0, 25)
                  .map((p) => `\`${p}\``)
                  .join("**, **"),
              }
            )
          );
        return;
      }
      const args = nonPrefix
        .substring(cName.length)
        .split(/[ \t]+/)
        .filter((a) => a);
      if (command) {
        if (
          !message.channel
            .permissionsFor(message.guild.members.me!)
            .has("EmbedLinks", true)
        ) {
          message.reply(
            t("errors:missingEmbedLinks", { userId: message.author.id })
          );
          return;
        }
        const context = new MessageCommandContext(
          message,
          command,
          guildDatabase?.language ?? message.guild.preferredLocale,
          guildDatabase
        );
        if (botMentions.includes(usedPrefix)) {
          command.handleMessage(context, args);
          return;
        }
        const canExecute = this.client.multibot.canExecuteCommand(context);
        if (canExecute) command.handleMessage(context, args);
      }
    } else if (message.channelId === guildDatabase?.thread_id) {
      const command = this.client.commands.find((c) => c.name === "play")!;
      const args = message.content.split(/[ \t]+/).filter((a) => a);
      const context = new MessageCommandContext(
        message,
        command,
        guildDatabase?.language ?? message.guild.preferredLocale
      );
      const canExecute = this.client.multibot.canExecuteCommand(context);
      if (canExecute) command.handleMessage(context, args);
    }
  }

  async onSlashCommand(interaction: ChatInputCommandInteraction) {
    let guildDB = null;
    if (interaction.guildId)
      guildDB = await this.client.prisma.guild
        .findFirst({ where: { id: interaction.guildId } })
        .catch(() => null);
    const locale =
      guildDB?.language ?? interaction.guildLocale ?? interaction.locale;
    const t = this.client.i18next.getFixedT(locale);
    if (!this.client.ready)
      return interaction.reply({
        content: t("commons:notReady"),
        ephemeral: true,
      });

    const fullName = [
      interaction.commandName,
      interaction.options.getSubcommandGroup(),
      interaction.options.getSubcommand(),
    ]
      .filter((a) => a)
      .join(" ");

    const command = this.client.commands.find(
      (c) => c.type === 0 && c.name === fullName
    );
    if (!command)
      return interaction.reply({
        content: t("commons:commandNotFound", { userId: interaction.user.id }),
        ephemeral: true,
      });

    const context = new SlashCommandContext(interaction, command, guildDB);
    return command.handleSlash(context);
  }

  async onContextMenu(interaction: ContextMenuCommandInteraction) {
    let guildDB = null;
    if (interaction.guildId)
      guildDB = await this.client.prisma.guild
        .findFirst({ where: { id: interaction.guildId } })
        .catch(() => null);
    const locale =
      guildDB?.language ?? interaction.guildLocale ?? interaction.locale;
    const t = this.client.i18next.getFixedT(locale);
    if (!this.client.ready)
      return interaction.reply({
        content: t("commons:notReady"),
        ephemeral: true,
      });

    const command = this.client.commands.find(
      (c) => c.type === 1 && c.name === interaction.commandName
    );
    if (!command)
      return interaction.reply({
        content: t("commons:commandNotFound", { userId: interaction.user.id }),
        ephemeral: true,
      });

    const context = new SlashCommandContext(interaction, command, guildDB);
    return command.handleSlash(context);
  }

  onAutocomplete(interaction: AutocompleteInteraction) {
    if (!this.client.ready) return interaction.respond([]);

    const fullName = [
      interaction.commandName,
      interaction.options.getSubcommandGroup(),
      interaction.options.getSubcommand(),
    ]
      .filter((a) => a)
      .join(" ");

    const command = this.client.commands.find(
      (c) => c.type === 0 && c.name === fullName
    );
    if (!command) return interaction.respond([]);

    const context = new AutocompleteCommandContext(interaction, command);
    return command.autocomplete(context, interaction.options.getFocused(true));
  }

  onButtonClick(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("help-")) return;
    const authorId =
      interaction.message.mentions.repliedUser?.id ??
      interaction.message.interaction?.user.id;
    if (authorId !== interaction.user.id) {
      const embed = new EmbedBuilder();
      embed
        .setTimestamp()
        .setFooter({ text: interaction.user.tag })
        .setColor(this.client.getColor("ERROR"))
        .setDescription(
          `**${this.client.i18next.getFixedT(interaction.locale)(
            "errors:invalidUserButton"
          )}**`
        );
      interaction.reply({ embeds: [embed.data], ephemeral: true });
    }
  }
}
