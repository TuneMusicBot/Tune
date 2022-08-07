import { PermissionsString } from "discord.js";
import { Member } from "eris";
import { GatewayActivity } from "discord-api-types/v10";
import { PermissionsNames } from ".";

export interface Option {
  name: string;
  type: CommandParameterTypes;
  value: unknown;
  parameter: CommandParameter;
  flag: boolean;
}

export interface CommandOptions {
  name: string;
  type: CommandTypes;
  voiceHasPriority: boolean;
  ephemeral: boolean;
  private?: boolean;
  category?: CommandCategories;
  aliases?: string[];
  parameters?: CommandParameter[];
  flags?: CommandParameter[];
  slashOrder?: string[];
  requirements?: CommandRequirementsOpts;
  id?: string;
}

export interface CommandParameter {
  name: string;
  slashName?: string;
  aliases?: string[];
  type: CommandParameterTypes;
  full?: boolean;
  joinString?: string;
  required: boolean;
  showUsage: boolean;
  missingError?: string;
}

export interface CommandRequirementsOpts {
  devOnly?: boolean;
  musicPlayerOnly?: boolean;
  musicPlayerPlayingOnly?: boolean;
  voiceChanneOnly?: boolean;
  sameVoiceChannelOnly?: boolean;
  djOnly?: boolean;

  connectionsRequired?: string[];

  checkVoiceMembers?: boolean;
  customPermissions?: PermissionsNames[];
  permissions?: PermissionsString[];
  botPermissions?: PermissionsString[];
}

export interface AttachmentOpts extends CommandParameter {
  type: "attachment";
  contentTypes?: string[];
  throwContent?: boolean;
  max: number;
}

export interface BooleanFlagOpts extends CommandParameter {
  type: "booleanFlag";
}

export interface MessageOpts extends CommandParameter {
  type: "message";
  maxTime: number;
  maxTimeError: string;
  sameGuildOnly: boolean;
  sameChannelOnly: boolean;
}

export interface StringOpts extends CommandParameter {
  type: "string";
  clean: boolean;
  maxLength: number;
  truncate: boolean;
  lowerCase: boolean;
  upperCase: boolean;
}

export interface UserOpts extends CommandParameter {
  type: "user";
  acceptBot: boolean;
  acceptUser: boolean;
  acceptSelf: boolean;
  forceFetch: boolean;
}

export interface ActivityOpts extends UserOpts {
  type: "activity";
  validateActivity?: (
    activity: GatewayActivity,
    member: Member
  ) => Promise<boolean> | boolean;
}

export interface RoleOpts extends CommandParameter {
  type: "role";
}

export type CommandParameterTypes =
  | "message"
  | "user"
  | "member"
  | "string"
  | "booleanFlag"
  | "attachment"
  | "boolean"
  | "channel"
  | "number"
  | "role"
  | "activity"
  | "unknown";
export type CommandCategories =
  | "account"
  | "bot"
  | "favorites"
  | "music"
  | "playlists"
  | "filters"
  | "developer";
