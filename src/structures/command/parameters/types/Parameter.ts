import { CommandContext } from "../../CommandContext";

export interface Parameter<T, K, V> {
  parseOptions(input: Record<string, unknown>): T;
  parseArgument(input: unknown): V;
  parse(context: CommandContext, options: T, currentArg: V): Promise<K> | K;
}
