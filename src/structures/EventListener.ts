import { Events } from "../@types";
import { Tune } from "../Tune";
import { Utils } from "../utils/Utils";

export class EventListener {
  public readonly client: Tune;
  public readonly events: Events[];

  constructor(events: Events[], client: Tune) {
    this.client = client;
    this.events = events;
  }

  listen() {
    this.events.map((event) =>
      // @ts-ignore
      this.client.on(event, (...args) =>
        // @ts-ignore
        this[`on${Utils.capitalize(event)}`](...args)
      )
    );
  }
}
