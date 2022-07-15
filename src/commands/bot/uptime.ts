import { Command } from "../../structures/command/Command";
import { CommandContext } from "../../structures/command/context/CommandContext";
import { Tune } from "../../Tune";

export class Uptime extends Command {
  constructor(client: Tune) {
    super(
      {
        name: "uptime",
        aliases: ["timeup", "online"],
        replyPrivate: true,
        type: 0,
        voice: false,
        category: "bot",
      },
      client
    );
  }

  run(context: CommandContext) {
    return context.reply({
      content: context.t("commands:uptime.text", {
        uptime: `<t:${~~((Date.now() - (this.client.uptime ?? 0)) / 1000)}:R>`,
      }),
      ephemeral: true,
    });
  }
}
