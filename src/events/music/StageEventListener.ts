import { EventListener } from "../../structures/EventListener";
import { Tune } from "../../Tune";

export class StageInstanceListener extends EventListener {
  constructor(client: Tune) {
    super(
      [
        "stageInstanceDelete",
        "guildScheduledEventDelete",
        "guildScheduledEventUpdate",
      ],
      client
    );
  }
}
