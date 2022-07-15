import { CommandContext } from "./context/CommandContext";

export class CommandError extends Error {
  public readonly context: CommandContext;
  public readonly showUsage: boolean;
  public readonly displayHelpButton: boolean;
  public handled = false;

  constructor(
    message: string,
    showUsage: boolean,
    context: CommandContext,
    displayHelpButton = false
  ) {
    super(message);

    this.context = context;
    this.showUsage = showUsage;
    this.displayHelpButton = displayHelpButton;
  }
}
