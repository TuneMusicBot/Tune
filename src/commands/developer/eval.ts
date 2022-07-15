import { inspect } from "util";
import { exec } from "child_process";
import { Command } from "../../structures/command/Command";
import { CommandContext } from "../../structures/command/context/CommandContext";
import { Tune } from "../../Tune";
import { Utils } from "../../utils/Utils";

export class Eval extends Command {
  constructor(client: Tune) {
    super(
      {
        name: "eval",
        aliases: ["evl", "ev"],
        type: 0,
        category: "developer",
        replyPrivate: true,
        voice: false,
        requirements: { devOnly: true },
        parameters: [
          {
            type: "string",
            name: "input",
            required: true,
            showUsage: true,
            missingError: "errors:missingScript",
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

  async run(context: CommandContext, { input }: EvalArgs) {
    try {
      const result = await ((context.flags as EvalFlags).prompt
        ? this.executePrompt(input.replace(/(^`{3}(\w+)?|`{3}$)/g, ""))
        : eval(input.replace(/(^`{3}(\w+)?|`{3}$)/g, "")));
      const cleanResult = Utils.clean(inspect(result, { depth: 0 })).replaceAll(
        this.client.token as string,
        "*".repeat((this.client.token as string).length)
      );
      return await context.reply({
        content: `\`\`\`js\n${cleanResult}\`\`\``,
        ephemeral: true,
      });
    } catch (e: any) {
      if (e instanceof Error)
        this.client.logger.error(e as any, { error: e, tags: ["Eval"] });
      const cleanError = Utils.clean(e?.toString() ?? String(e));
      return context.reply({
        content: `\`\`\`xl\n${cleanError}\`\`\``,
        ephemeral: true,
      });
    }
  }

  executePrompt(input: string) {
    return new Promise((resolve, reject) =>
      // eslint-disable-next-line no-promise-executor-return
      exec(input, (err, stout, sterr) =>
        err ?? sterr ? reject(err ?? sterr) : resolve(stout)
      )
    );
  }
}

interface EvalFlags {
  prompt?: boolean;
}

interface EvalArgs {
  input: string;
}
