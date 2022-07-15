import { APIConnection, ConnectionVisibility } from "discord.js";

export class UserConnection {
  public id: string;
  public name: string;
  public type: string;
  public revoked?: boolean;
  public verified: boolean;
  public friendSync: boolean;
  public showActivity: boolean;
  public visibility: ConnectionVisibility;

  constructor(data: APIConnection) {
    this.id = data.id;
    this.name = data.name;
    this.type = data.type;
    this.revoked = data.revoked;
    this.verified = data.verified;
    this.friendSync = data.friend_sync;
    this.showActivity = data.show_activity;
    this.visibility = data.visibility;
  }
}
