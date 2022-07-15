import { BitField } from "discord.js";
import { PermissionsNames } from "../@types";

export class CustomPermissions extends BitField<PermissionsNames, number> {
  static get Flags() {
    return {
      ManageQueue: 1 << 1,
      AddSongs: 1 << 2,
      AddPlaylists: 1 << 3,
      ManagePlayer: 1 << 4,
      ManageFilters: 1 << 5,
      CreatePlayer: 1 << 6,
      JumpSongs: 1 << 7,
    };
  }
}
