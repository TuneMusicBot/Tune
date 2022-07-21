import { ClientEvents, Guild } from "discord.js";
import { TFunction } from "i18next";
import { EventEmitter } from "events";
import { Prisma } from "@prisma/client";
import { Player } from "../structures/player/Player";
import { TrackEndReasons } from "./lavalink";
import { RedisMiddleware } from "../redis/RedisMiddleware";

export interface TypingData {
  channelId: string;
  calls: number;
  interval: NodeJS.Timer;
}

export interface RecentSearch {
  id: string;
  name: string;
  uri: string;
}

export interface Song {
  readonly type: SongTypes;
  class?: string;
  title: string;
  author: string;
  length: number | bigint;
  identifier: string;
  isStream: boolean;
  uri?: string;
  artworkUrl?: string;
  isSeekable?: boolean;
  sourceName?: string;
  position?: number;
  isrc?: string;
  user: SongUser;
  playlist?: unknown;

  subscribe(player: Player, emitter: EventEmitter): any;
  stop(player: Player): any;
  onEnd(player: Player, reason: TrackEndReasons): any;
}

export interface SongUser extends unknown {
  buildString(guild: Guild, t: TFunction): Promise<string>;
}

// eslint-disable-next-line no-shadow
export enum SongTypes {
  SONG,
  RADIO,
  MULTI_SONG,
}

export interface GuildData {
  states: GatewayVoiceStateUpdateDispatchData[];
  me: APIGuildMember;
  roles: { id: string; permissions: string }[];
  channels: APIGuildChannel[];
}

export type Events =
  | keyof ClientEvents
  | "buttonClick"
  | "selectMenuClick"
  | "slashCommand"
  | "autocomplete"
  | "modalSubmit"
  | "contextMenu"
  | "raw"
  | "trackStart"
  | "trackEnd"
  | "trackStuck"
  | "trackException";
export type PermissionsNames =
  | "ManageQueue"
  | "AddSongs"
  | "AddPlaylists"
  | "ManagePlayer"
  | "ManageFilters"
  | "CreatePlayer";
export type AchievementsNames =
  | "Groovy"
  | "1HourListening"
  | "10HoursListening"
  | "100HoursListening"
  | "1000HoursListening"
  | "10TracksListened"
  | "100TracksListened";
export type IModel = Record<
  Prisma.PrismaAction,
  (
    params: Prisma.MiddlewareParams,
    middleware: RedisMiddleware,
    next: (p: Prisma.MiddlewareParams) => Promise<any>
  ) => Promise<any>
>;
