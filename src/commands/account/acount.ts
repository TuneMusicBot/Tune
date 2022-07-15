import { UserConnection } from "@prisma/client";
import { APIUser } from "discord.js";
import { Command } from "../../structures/command/Command";
import { CommandContext } from "../../structures/command/context/CommandContext";
import { Tune } from "../../Tune";
import { EMOJIS } from "../../utils/Constants";

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

  private buildConnectionInfo(connection: UserConnection): string | null {
    const user = connection.data as unknown;
    switch (connection.platform) {
      case "DISCORD":
        return `${EMOJIS.DISCORD} **| Discord:** [\`${
          (user as APIUser).username
        }#${(user as APIUser).discriminator}\`](https://discord.com/users/${
          connection.id
        })`;
      case "LASTFM":
        return `${EMOJIS.LASTFM} **| LastFM:** [\`${connection.id}\`](https://www.last.fm/user/${connection.id})`;
    }
    return null;
  }
}
