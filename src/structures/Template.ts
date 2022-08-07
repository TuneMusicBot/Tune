import { Tune } from "../Tune";

export class Template {
  public readonly name: string;
  public readonly client: Tune;

  constructor(name: string, client: Tune) {
    this.name = name;
    this.client = client;
  }
}
