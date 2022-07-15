import { Command } from "../../structures/command/Command";
import { CommandContext } from "../../structures/command/context/CommandContext";
import { Tune } from "../../Tune";

export class Ping extends Command {
  constructor(client: Tune) {
    super(
      {
        name: "ping",
        aliases: ["latency", "ms"],
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
      content: context.t("commands:ping.text", { ping: this.client.ws.ping }),
      ephemeral: true,
    });
  }
}
