/* eslint-disable no-param-reassign */
import { StringOpts } from "../../../../@types/commands";
import { Utils } from "../../../../utils/Utils";
import { CommandContext } from "../../CommandContext";
import { CommandError } from "../../CommandError";
import { Parameter } from "./Parameter";

export class StringParameter implements Parameter<StringOpts, string, string> {
  parseOptions(input: Record<string, unknown>): StringOpts {
    return {
      name: input.name as string,
      required: !!input.required,
      showUsage: !!input.showUsage,
      type: "string",
      clean: !!input.clean,
      maxLength: (input.maxLength ?? 0) as number,
      truncate: !!input.truncate,
      lowerCase: !!input.lowerCase,
      upperCase: !!input.upperCase,
      missingError: input.missingError as string,
    };
  }

  parseArgument(input: unknown): string {
    if (typeof input === "string") return input;
    if (typeof input === "undefined") return "";
    return String(input);
  }

  parse(
    context: CommandContext,
    options: StringOpts,
    currentArg: string
  ): string {
    if (currentArg.length <= 0 && options.required)
      throw new CommandError(
        context.t([options.missingError ?? "", "errors:missingString"]),
        true,
        context,
        true
      );
    if (options.clean)
      currentArg = Utils.cleanContent(
        currentArg,
        context.channel,
        context.client
      );
    if (options.maxLength > 0 && currentArg.length > options.maxLength) {
      if (!options.truncate)
        throw new CommandError(
          context.t("errors:needSmallerString", { number: options.maxLength }),
          false,
          context
        );
      currentArg = currentArg.substring(0, options.maxLength);
    }

    if (options.upperCase) currentArg = currentArg.toUpperCase();
    if (options.lowerCase) currentArg = currentArg.toLowerCase();
    return currentArg;
  }
}
