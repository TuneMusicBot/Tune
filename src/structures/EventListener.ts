import { GatewayDispatchEvents } from "discord-api-types/v10";
import { Events } from "../@types";
import { Tune } from "../Tune";
import { Utils } from "../utils/Utils";

export class EventListener {
  public readonly client: Tune;
  public readonly events: Events[];
  public rawDiscord = false;

  constructor(events: Events[], client: Tune) {
    this.client = client;
    this.events = events;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
  on(...args: any[]): any | Promise<any> {}

  listen() {
    this.events.forEach((event) =>
      // @ts-ignore
      (this.rawDiscord ? this.client.discordEvents : this.client).on(
        event,
        async (...args) => {
          const func =
            this.events.length === 1
              ? // @ts-ignore
                this.on
              : // @ts-ignore
                this[
                  `on${
                    this.rawDiscord
                      ? // @ts-ignore
                        Utils.reverseObject(GatewayDispatchEvents)[event]
                      : Utils.capitalize(event)
                  }`
                ];
          if (typeof func === "function") await func.bind(this)(...args);
        }
      )
    );
  }
}
