import { Member } from "eris";
import { UserOpts } from "../../../../@types/commands";
import { CommandContext } from "../../CommandContext";
import { CommandError } from "../../CommandError";
import { Parameter } from "./Parameter";
import { UserParamenter } from "./UserParameter";

export class MemberParameter
  extends UserParamenter
  implements Parameter<UserOpts, Member, string>
{
  // @ts-ignore
  async parse(
    context: CommandContext,
    options: UserOpts,
    currentArg: string
  ): Promise<Member> {
    if (!context.guild)
      throw new CommandError(
        context.t("errors:onlyOnGuild"),
        false,
        context,
        false
      );
    const user = await super.parse(context, options, currentArg);
    const member =
      context.guild.members.get(user.id) || options.forceFetch
        ? await context.client.getRESTGuildMember(context.guild.id, user.id)
        : undefined;
    return this.validateMember(context, member);
  }

  private validateMember(
    context: CommandContext,
    member: Member | undefined
  ): Member {
    if (member) context.guild?.members.set(member.id, member);
    else
      throw new CommandError(
        context.t("errors:invalidMember"),
        false,
        context,
        false
      );
    return member;
  }
}
