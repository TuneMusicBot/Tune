import { BooleanFlagOpts } from "../../../../@types/commands";
import { Parameter } from "./Parameter";

export class BooleanFlagParameter
  implements Parameter<BooleanFlagOpts, boolean, string | boolean>
{
  parseOptions(input: Record<string, unknown>): BooleanFlagOpts {
    return {
      name: input.name as string,
      aliases: (input.aliases ?? []) as string[],
      type: "booleanFlag",
      required: !!input.required,
      showUsage: !!input.showUsage,
    };
  }

  parseArgument(input: unknown): string | boolean {
    if (typeof input === "string") return input;
    if (typeof input === "boolean") return input;
    return Boolean(input);
  }

  parse(): boolean {
    return true;
  }
}
