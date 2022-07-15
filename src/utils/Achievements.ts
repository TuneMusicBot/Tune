import { BitField } from "discord.js";
import { AchievementsNames } from "../@types";

export class Achievements extends BitField<AchievementsNames, number> {
  static get Flags() {
    return {};
  }
}
