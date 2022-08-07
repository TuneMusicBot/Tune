import { CommandContext } from "./CommandContext";

export class CommandError extends Error {
  public readonly showUsage: boolean;
  public readonly context: CommandContext;
  public readonly displayHelpButton: boolean;
  public readonly helpButtonId: string;
  public handled = false;

  constructor(
    message: string,
    showUsage: boolean,
    context: CommandContext,
    displayHelpButton = false,
    helpButtonId = ""
  ) {
    super(message);

    this.context = context;
    this.showUsage = showUsage;
    this.displayHelpButton = displayHelpButton;
    this.helpButtonId = helpButtonId;
  }
}
