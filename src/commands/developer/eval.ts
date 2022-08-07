import { inspect } from "util";
import { exec } from "child_process";
import { CommandContext } from "../../structures/command/CommandContext";
import { Command, CommandTypes } from "../../structures/command/Command";
import { Tune } from "../../Tune";
import { Utils } from "../../utils/Utils";

export class Eval extends Command<{ code: string }> {
  constructor(client: Tune) {
    super(
      {
        name: "eval",
        slashOrder: ["eval"],
        aliases: ["evl", "ev"],
        ephemeral: true,
        requirements: { devOnly: true },
        voiceHasPriority: true,
        type: CommandTypes.UNIVERSAL_COMMAND,
        parameters: [
          {
            type: "string",
            name: "code",
            required: true,
            showUsage: true,
            slashName: "code",
            full: true,
          },
        ],
        flags: [
          {
            type: "booleanFlag",
            name: "prompt",
            required: false,
            showUsage: false,
          },
        ],
      },
      client
    );
  }

  public async run(context: CommandContext, { code }: { code: string }) {
    try {
      const result = await ((
        context.flags as {
          prompt?: boolean;
        }
      ).prompt
        ? this.executePrompt(code.replace(/(^`{3}(\w+)?|`{3}$)/g, ""))
        : eval(code.replace(/(^`{3}(\w+)?|`{3}$)/g, "")));
      const cleanResult = Utils.clean(inspect(result, { depth: 0 })).replaceAll(
        process.env.DISCORD_TOKEN,
        "*".repeat(process.env.DISCORD_TOKEN.length)
      );
      await context.reply({
        content: `\`\`\`js\n${cleanResult}\`\`\``,
        flags: 64,
      });
    } catch (e: any) {
      if (e instanceof Error)
        this.client.logger.error(e as any, { error: e, tags: ["Eval"] });
      const cleanError = Utils.clean(e?.toString() ?? String(e));
      context.reply({
        content: `\`\`\`xl\n${cleanError}\`\`\``,
        flags: 64,
      });
    }
  }

  private executePrompt(input: string) {
    return new Promise((resolve, reject) =>
      // eslint-disable-next-line no-promise-executor-return
      exec(input, (err, stout, sterr) =>
        err ?? sterr ? reject(err ?? sterr) : resolve(stout)
      )
    );
  }
}
