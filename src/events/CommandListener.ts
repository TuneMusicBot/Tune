import { UserConnectionPlatforms, User as Account } from "@prisma/client";
import { PermissionFlagsBits } from "discord-api-types/v10";
import { GuildTextableChannel, Message, User } from "eris";
import { CommandContext } from "../structures/command/CommandContext";
import { EventListener } from "../structures/EventListener";
import { Tune } from "../Tune";

export class CommandListener extends EventListener {
  constructor(client: Tune) {
    super(["messageCreate"], client);
  }

  async on(message: Message) {
    if (!message.guildID) return;
    if (message.author.bot) return;
    const guild = this.client.guilds.get(message.guildID);
    if (!guild) return;
    const channel = message.channel as GuildTextableChannel;
    const permissions = channel.permissionsOf(this.client.user.id);
    const me =
      guild.members.get(this.client.user.id) ||
      (await guild.getRESTMember(this.client.user.id));
    guild.members.set(this.client.user.id, me);
    if (
      !me.permissions.has(PermissionFlagsBits.Administrator) ||
      !(
        permissions.has(PermissionFlagsBits.ViewChannel) &&
        permissions.has(PermissionFlagsBits.SendMessages)
      )
    )
      return;
    const prefixes = this.client.prefixes[message.guildID] ?? [
      process.env.DEFAULT_PREFIX,
    ];
    const botMentions = [
      `<@!${this.client.user.id}>`,
      `<@${this.client.user.id}>`,
    ];
    const targetPrefix =
      botMentions.find((m) => message.content.startsWith(m)) ||
      prefixes.find((p) => message.content.startsWith(p));
    if (!targetPrefix) return;
    const nonPrefix = message.content.substring(targetPrefix.length);
    const args = nonPrefix.split(/[ \t]+/).filter((a) => a);
    if (botMentions.includes(targetPrefix) && args.length <= 0) {
      const { account } = await this.getConnectionAndAccount(
        message.author,
        guild.preferredLocale
      );
      const t = this.client.i18next.getFixedT(account?.language as string);
      message.channel.createMessage({
        messageReference: {
          messageID: message.id,
          channelID: message.channel.id,
          guildID: message.guildID,
          failIfNotExists: false,
        },
        content: t(`commons:mentionPrefix${prefixes.length > 1 ? "s" : ""}`, {
          userId: message.author.id,
          prefixes: prefixes.map((p) => `\`${p}\``).join(", "),
        }),
      });
      return;
    }
    let targetCommandName = "";
    const lowerCase = nonPrefix.toLowerCase();
    const command = this.client.commands.find((c) => {
      if (lowerCase.startsWith(c.name.toLowerCase())) {
        targetCommandName = c.name;
        return true;
      }
      return c.aliases.some((a) => {
        if (lowerCase.startsWith(a.toLowerCase())) {
          targetCommandName = a;
          return true;
        }
        return false;
      });
    });
    if (!command) return;
    const splitted = targetCommandName.split(" ");
    const splittedArgs = args.splice(0, splitted.length);
    if (!splittedArgs.some((a, i) => a === splitted[i])) return;
    const { account, connection } = await this.getConnectionAndAccount(
      message.author,
      guild.preferredLocale
    );
    const settings = await this.client.prisma.guild
      .findFirst({ where: { id: message.guildID, platform: "DISCORD" } })
      .catch(() => null);
    const context = new CommandContext(
      message,
      this.client,
      account as Account,
      command,
      connection,
      settings ?? undefined
    );
    command.handleMessageCmmand(context, args);
  }

  private async getConnectionAndAccount(user: User, language?: string) {
    let connection = await this.client.prisma.userConnection
      .findUnique({
        where: { id: user.id },
      })
      .catch(() => null);
    let account;
    if (!connection) {
      account = await this.client.prisma.user.create({
        data: {
          language,
        },
      });
      connection = await this.client.prisma.userConnection.create({
        data: {
          id: user.id,
          dm_channel_id: this.client.privateChannelMap[user.id],
          platform: UserConnectionPlatforms.DISCORD,
          user_id: account.id,
          config: {},
        },
      });
    } else {
      account = await this.client.prisma.user.findUnique({
        where: { id: connection.user_id },
      });
    }

    return { connection, account };
  }
}
