import { OAuthTeamMember } from "eris";
import { CommandRequirementsOpts } from "../../@types/commands";
import { CommandContext } from "./CommandContext";
import { CommandError } from "./CommandError";

export class CommandRequirements {
  static async handle(
    context: CommandContext,
    options: CommandRequirementsOpts
  ) {
    const owners = context.client.application?.team
      ? context.client.application.team.members.map(
          (m: OAuthTeamMember) => m.user.id as string
        )
      : [context.client.application?.owner?.id as string];
    if (options.devOnly && !owners.includes(context.user.id))
      throw new CommandError(
        context.t("errors:devOnly"),
        false,
        context,
        false
      );
    if (options.voiceChanneOnly && !context.member?.voiceState.channelID)
      throw new CommandError(
        context.t("errors:voiceChannelOnly"),
        false,
        context,
        false
      );
    if (options.sameVoiceChannelOnly) {
      const me =
        context.guild?.members.get(context.client.user.id) ||
        (await context.client.getRESTGuildMember(
          context.guild?.id as string,
          context.client.user.id
        ));
      context.guild?.members.set(context.client.user.id, me);
      if (
        me.voiceState.channelID &&
        me.voiceState.sessionID === context.guild?.shard.sessionID &&
        me.voiceState.channelID !== context.member?.voiceState.channelID
      )
        throw new CommandError(
          context.t("errors:sameVoiceChannelOnly"),
          false,
          context,
          false
        );
    }
  }
}
