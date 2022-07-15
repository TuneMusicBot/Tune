import { CommandParameter, Option } from "../../../@types/commands";
import { CommandContext } from "../context/CommandContext";

export interface Parameter<T, K extends CommandParameter> {
  generateOptions(parameter: any): K;
  parseOption(context: CommandContext, option: Option, opts: K): Promise<T> | T;
}
