import { CommandParameter } from "../../../@types/commands";
import { CommandContext } from "../CommandContext";
import Handlers from "./types";

export class CommandParameters {
  static async handle<T extends object>(
    context: CommandContext,
    args: string[]
  ): Promise<T> {
    if (context.command.flags.length > 0) {
      const firstFlagIndex = args.findIndex((a) => a.startsWith("--"));
      if (firstFlagIndex > -1) {
        const [, ...allFlags] = args
          .splice(firstFlagIndex)
          .join(" ")
          .split("--")
          .map((s) => s.trim().split(/[ \t]+/));
        const flags = {};

        await Promise.all(
          allFlags.map(async ([name, ...flagArgs]) => {
            const flagOption = context.command.flags.find(
              (f) => f.name === name || (f.aliases && f.aliases.includes(name))
            );
            if (!flagOption) return;

            const value = await this.parseParameter(
              context,
              flagOption,
              flagArgs.join(" ")
            );
            // @ts-ignore
            flags[flagOption.name] = value;
          })
        );

        context.flags = flags;
      }
    }

    const output = {};
    let argIndex = 0;
    for (let index = 0; index < context.command.parameters.length; index++) {
      const parameter = context.command.parameters[index];

      if (
        context.command.parameters.length > args.length &&
        !parameter.required &&
        argIndex === args.length - 1 &&
        context.command.parameters.some((p, pi) => pi > index && p.required)
      )
        continue;
      let arg: string = args[argIndex];

      if (parameter.full)
        arg = args.slice(argIndex).join(parameter.joinString ?? " ");

      // eslint-disable-next-line no-await-in-loop
      const value = await this.parseParameter(context, parameter, arg);
      Object.defineProperty(output, parameter.name, { value });
      argIndex += 1;
    }

    return output as T;
  }

  private static parseParameter(
    context: CommandContext,
    parameter: CommandParameter,
    value: unknown
  ) {
    const handler = Handlers[parameter.type];
    if (!handler) return value;
    return handler.parse(
      context,
      handler.parseOptions(parameter as unknown as Record<string, unknown>),
      handler.parseArgument(value)
    );
  }
}
