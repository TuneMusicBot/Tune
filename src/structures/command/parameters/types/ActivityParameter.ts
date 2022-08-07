import { GatewayActivity } from "discord-api-types/v10";
import { Member } from "eris";
import { ActivityOpts, UserOpts } from "../../../../@types/commands";
import { CommandContext } from "../../CommandContext";
import { CommandError } from "../../CommandError";
import { MemberParameter } from "./MemberParameter";
import { Parameter } from "./Parameter";

export class ActivityParameter
  extends MemberParameter
  implements Parameter<ActivityOpts, Member, string>
{
  // @ts-ignore
  parseOptions(input: Record<string, unknown>): ActivityOpts {
    return {
      name: input.name as string,
      slashName: input.slashName as string,
      aliases: (input.aliases ?? []) as string[],
      type: "activity",
      full: !!input.full,
      joinString: (input.joinString ?? " ") as string,
      required: !!input.required,
      showUsage: !!input.showUsage,
      acceptBot: !!input.acceptBot,
      acceptUser: !!input.acceptUser,
      acceptSelf: !!input.acceptSelf,
      forceFetch: !!input.forceFetch,
      missingError: input.missingError as string | undefined,
      validateActivity: input.validateActivity as
        | ((
            activity: GatewayActivity,
            member: Member
          ) => Promise<boolean> | boolean)
        | undefined,
    };
  }

  // @ts-ignore
  async parse(
    context: CommandContext,
    options: ActivityOpts,
    currentArg: string
  ): Promise<Member> {
    const member = await super.parse(
      context,
      options as unknown as UserOpts,
      currentArg
    );
    const activities = member.activities ?? [];
    const final = [];
    if (options.validateActivity) {
      await Promise.all(
        activities.map(async (a) =>
          // @ts-ignore
          (await options.validateActivity(
            a as unknown as GatewayActivity,
            member
          ))
            ? final.push(a)
            : undefined
        )
      );
    } else {
      final.push(...activities);
    }
    if (final.length <= 0)
      throw new CommandError(
        context.t("errors:invalidActivity"),
        false,
        context,
        false
      );
    return member;
  }
}
