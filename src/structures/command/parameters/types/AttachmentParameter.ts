import { Attachment } from "eris";
import { AttachmentOpts } from "../../../../@types/commands";
import { CommandContext } from "../../CommandContext";
import { CommandError } from "../../CommandError";
import { Parameter } from "./Parameter";

export class AttachmentParameter
  implements Parameter<AttachmentOpts, Attachment[], string>
{
  parseOptions(input: Record<string, unknown>): AttachmentOpts {
    return {
      name: input.name as string,
      aliases: (input.aliases ?? []) as string[],
      type: "attachment",
      full: !!input.full,
      required: !!input.required,
      showUsage: !!input.showUsage,
      missingError: input.missingError as string,
      max: (input.max ?? 1) as number,
      throwContent: !!input.throwContent,
      contentTypes: (input.contentTypes ?? []) as string[],
    };
  }

  parseArgument(input: unknown): string {
    if (typeof input === "string") return input;
    return String(input);
  }

  parse(context: CommandContext, options: AttachmentOpts): Attachment[] {
    const attachments = context.message.attachments.filter(
      (a) => a instanceof Attachment
    ) as Attachment[];
    return attachments
      .filter((attach) => {
        if (options.contentTypes && options.contentTypes.length > 0) {
          const match = options.contentTypes.includes(
            attach?.contentType as string
          );
          if (!match && options.throwContent)
            throw new CommandError(
              context.t([
                options.missingError ?? "",
                "errors:invalidContentType",
              ]),
              true,
              context,
              true
            );
          return match;
        }
        return true;
      })
      .splice(0, options.max);
  }
}
