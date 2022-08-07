import { User } from "eris";
import { UserOpts } from "../../../../@types/commands";
import { CommandContext } from "../../CommandContext";
import { CommandError } from "../../CommandError";
import { Parameter } from "./Parameter";

const REGEX = /^(?:<@(?:!|)?)?([0-9]{16,20})(?:>)?$/;

export class UserParamenter implements Parameter<UserOpts, User, string> {
  parseOptions(input: Record<string, unknown>): UserOpts {
    return {
      name: input.name as string,
      aliases: (input.aliases ?? []) as string[],
      type: "user",
      missingError: input.missingError as string | undefined,
      required: !!input.required,
      showUsage: !!input.showUsage,
      acceptBot: !!input.acceptBot,
      acceptUser: !!input.acceptUser,
      acceptSelf: !!input.acceptSelf,
      forceFetch: !!input.forceFetch,
    };
  }

  parseArgument(input: unknown): string {
    if (typeof input === "string") return input;
    return String(input);
  }

  async parse(
    context: CommandContext,
    options: UserOpts,
    currentArg: string
  ): Promise<User> {
    const regexResult = REGEX.exec(currentArg);
    const id =
      (regexResult && regexResult[1]) ||
      (options.acceptSelf && !currentArg.length ? context.user.id : currentArg);
    if (id) {
      const user =
        context.client.users.get(id) || options.forceFetch
          ? await context.client.getRESTUser(id)
          : undefined;
      if (user) context.client.users.set(user.id, user);
      return this.validateUser(context, options, user);
    }
    const user =
      context.guild?.members.find((m) =>
        (m.nick || m.username).toLowerCase().includes(currentArg.toLowerCase())
      )?.user ??
      context.client.users.find((u) =>
        u.username.toLowerCase().includes(currentArg.toLowerCase())
      );
    return this.validateUser(context, options, user);
  }

  private validateUser(
    context: CommandContext,
    options: UserOpts,
    user: User | undefined
  ): User {
    if (!user)
      throw new CommandError(
        context.t([options.missingError ?? "", "errors:invalidUser"]),
        false,
        context,
        false
      );
    if (!options.acceptBot && user.bot)
      throw new CommandError(
        context.t("errors:invalidBotUser"),
        false,
        context,
        false
      );
    if (!options.acceptSelf && user.id === context.user.id)
      throw new CommandError(
        context.t("errors:invalidSelfUser"),
        false,
        context,
        false
      );
    if (!options.acceptUser && !user.bot)
      throw new CommandError(
        context.t("errors:invalidHumanUser"),
        false,
        context,
        false
      );
    return user;
  }
}
