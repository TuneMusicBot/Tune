import { Command } from "../../structures/command/Command";
import { CommandContext } from "../../structures/command/context/CommandContext";
import { Tune } from "../../Tune";

export class Account extends Command {
  constructor(client: Tune) {
    super(
      {
        name: "account",
        aliases: ["acc", "act"],
        category: "account",
        private: false,
        replyPrivate: true,
        voice: false,
        type: 0,
      },
      client
    );
  }

  async run(context: CommandContext) {
    await context.startTyping(true);
    // const account = await context.user.fetchAccount();
    // const connections = await context.user.fetchConnections();
    // const embed = new EmbedBuilder().setFooter({ text: context.user.tag });
  }
}
