import { Role } from "eris";
import { RoleOpts } from "../../../../@types/commands";
import { CommandContext } from "../../CommandContext";
import { CommandError } from "../../CommandError";
import { Parameter } from "./Parameter";

const REGEX = /^(?:<@&?)?([0-9]{16,20})(?:>)?$/;

export class RoleParameter implements Parameter<RoleOpts, Role, string> {
  parseOptions(input: Record<string, unknown>): RoleOpts {
    return {
      type: "role",
      name: input.name as string,
      aliases: (input.aliases ?? []) as string[],
      required: !!input.required,
      showUsage: !!input.showUsage,
    };
  }

  parseArgument(input: unknown): string {
    if (typeof input === "string") return input;
    return String(input);
  }

  parse(context: CommandContext, _options: RoleOpts, currentArg: string): Role {
    if (!context.guild)
      throw new CommandError(
        context.t("errors:onlyOnGuild"),
        false,
        context,
        false
      );
    const regexResult = REGEX.exec(currentArg);
    const id = (regexResult && regexResult[1]) || currentArg;
    const role =
      context.guild.roles.get(id) ??
      context.guild.roles.find((r) =>
        r.name.toLowerCase().includes(currentArg.toLowerCase())
      );
    return this.validateRole(context, role);
  }

  private validateRole(context: CommandContext, role: Role | undefined): Role {
    if (!role)
      throw new CommandError(
        context.t("errors:invalidRole"),
        false,
        context,
        false
      );
    return role;
  }
}
