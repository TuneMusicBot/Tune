import { BooleanFlagOpts, Option } from "../../../../@types/commands";
import { CommandContext } from "../../context/CommandContext";
import { MessageCommandContext } from "../../context/MessageCommandContext";
import { Parameter } from "../Parameter";

export class BooleanFlagParameter
  implements Parameter<boolean, BooleanFlagOpts>
{
  generateOptions(parameter: any): BooleanFlagOpts {
    return {
      name: parameter.name as string,
      type: "booleanFlag",
      required: !!parameter.required,
      showUsage: !!parameter.showUsage,
    };
  }

  parseOption(context: CommandContext, option: Option): boolean {
    if (context instanceof MessageCommandContext) return true;
    if (typeof option.value === "boolean") return option.value;
    if (typeof option.value === "string")
      return !!(
        option.parameter.name === option.value ||
        (option.parameter.aliases &&
          option.parameter.aliases.includes(option.value))
      );
    return !!option.value;
  }
}
