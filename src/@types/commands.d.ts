import { PermissionsString } from "discord.js";
import { PermissionsNames } from ".";

// eslint-disable-next-line no-shadow
export enum CommandTypes {
  COMMAND,
  CONTEXT_MENU,
  MODAL_SUBMIT,
}

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
  voice: boolean;
  replyPrivate: boolean;
  private?: boolean;
  category?: CommandCategories;
  aliases?: string[];
  parameters?: CommandParameter[];
  flags?: CommandParameter[];
  requirements?: CommandRequirementsOpts;
  parent?: string;
  slashOrder?: string[];
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
  min: number;
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
  | "unknown";
export type CommandCategories =
  | "account"
  | "bot"
  | "favorites"
  | "music"
  | "playlists"
  | "filters"
  | "developer";
