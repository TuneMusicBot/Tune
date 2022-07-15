import { duration } from "moment";
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
        // @ts-ignore
        uptime: duration(this.client.uptime).format(
          "YY[y] MM[mh] dd[d] hh[h] mm[m] ss[s]",
          { stopTrim: "s" }
        ),
      }),
      ephemeral: true,
    });
  }
}
