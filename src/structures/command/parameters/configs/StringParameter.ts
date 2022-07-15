import { cleanContent } from "discord.js";
import { Option, StringOpts } from "../../../../@types/commands";
import { CommandError } from "../../CommandError";
import { CommandContext } from "../../context/CommandContext";
import { Parameter } from "../Parameter";

export class StringParameter implements Parameter<string, StringOpts> {
  generateOptions(parameter: any): StringOpts {
    return {
      name: parameter.name,
      required: !!parameter.required,
      showUsage: !!parameter.showUsage,
      type: "string",
      clean: !!parameter.clean,
      maxLength: parameter.maxLength ?? 0,
      truncate: !!parameter.truncate,
      lowerCase: !!parameter.lowerCase,
      upperCase: !!parameter.upperCase,
      missingError: parameter.missingError ?? "errors:missingString",
    };
  }

  parseOption(
    context: CommandContext,
    option: Option,
    opts: StringOpts
  ): string {
    // eslint-disable-next-line no-nested-ternary
    let arg: string = option.value
      ? typeof option.value === "string"
        ? option.value
        : String(option.value)
      : "";

    if (opts.required && arg.length === 0)
      throw new CommandError(
        context.t(opts.missingError as string),
        true,
        context
      );
    if (opts.clean) arg = cleanContent(arg, context.channel);

    if (opts.maxLength > 0 && arg.length > opts.maxLength) {
      if (!opts.truncate)
        throw new CommandError(
          context.t("errors:needSmallerString", { number: opts.maxLength }),
          false,
          context
        );
      arg = arg.substring(0, opts.maxLength);
    }

    if (opts.upperCase) arg = arg.toUpperCase();
    if (opts.lowerCase) arg = arg.toLowerCase();

    return arg;
  }
}
