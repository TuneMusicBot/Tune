import { Attachment } from "discord.js";
import { AttachmentOpts, Option } from "../../../../@types/commands";
import { CommandError } from "../../CommandError";
import { CommandContext } from "../../context/CommandContext";
import { MessageCommandContext } from "../../context/MessageCommandContext";
import { SlashCommandContext } from "../../context/SlashCommandContext";
import { Parameter } from "../Parameter";

export class AttachmentParameter
  implements Parameter<Attachment[], AttachmentOpts>
{
  generateOptions(parameter: any): AttachmentOpts {
    return {
      name: parameter.name as string,
      type: "attachment",
      contentTypes: parameter.contentTypes ?? [],
      showUsage: !!parameter.showUsage,
      required: !!parameter.required,
      max: parameter.max ?? 1,
      min: parameter.min ?? 0,
      throwContent: !!parameter.throwContent,
    };
  }

  parseOption(
    context: CommandContext,
    option: Option,
    opts: AttachmentOpts
  ): Attachment[] {
    const attachments: Attachment[] = [];

    if (context instanceof SlashCommandContext)
      attachments.push(option.value as Attachment);
    if (context instanceof MessageCommandContext)
      context.message.attachments.map((attach) => attachments.push(attach));

    if (attachments.length < opts.min)
      throw new CommandError(
        context.t(`errors:missingAttachment${opts.min > 1 ? "s" : ""}`, {
          min: opts.min,
        }),
        opts.showUsage,
        context
      );

    return attachments
      .filter((attach) => {
        if (
          opts.contentTypes &&
          opts.contentTypes.length > 0 &&
          !opts.contentTypes.includes(attach.contentType as string)
        ) {
          if (opts.throwContent)
            throw new CommandError(
              context.t("errors:invalidContentType", {
                contentType: attach.contentType,
              }),
              opts.showUsage,
              context
            );
          return false;
        }

        return true;
      })
      .splice(0, opts.max);
  }
}
