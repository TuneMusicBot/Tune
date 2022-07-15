export type OpCodes =
  | "voiceUpdate"
  | "play"
  | "stop"
  | "pause"
  | "seek"
  | "volume"
  | "destroy"
  | "configureResuming"
  | "filters"
  | "ping"
  | "loadTracks"
  | "event"
  | "stats"
  | "pong";
export type Events =
  | "TrackStartEvent"
  | "TrackEndEvent"
  | "TrackExceptionEvent"
  | "TrackStuckEvent"
  | "PlayerUpdateEvent"
  | "WebSocketClosedEvent"
  | "WebSocketReadyEvent"
  | "RecordStart"
  | "RecordStop";
export type TrackEndReasons =
  | "FINISHED"
  | "LOAD_FAILED"
  | "STOPPED"
  | "REPLACED"
  | "CLEANUP";
export type ExceptionSeverities = "COMMON" | "SUSPICIOUS" | "FAULT";
export type LoadTypes =
  | "TRACK_LOADED"
  | "PLAYLIST_LOADED"
  | "SEARCH_RESULT"
  | "NO_MATCHES"
  | "LOAD_FAILED";

export interface NodeVersions {
  api: string;
  main: string;
  spring: string;
  build: string;
  lavaplayer: string;
  lavadsp: string;
  jvm: string;
  kotlin: string;
  buildTime: Date;
  gitLoaded: boolean;
}

export interface NodeVersionsWithGit extends NodeVersions {
  gitLoaded: true;
  commit: string;
  commitTime: Date;
  branch: string;
}

export interface NodeOptions {
  url: string;
  password: string;
  wsSecure: boolean;
  restSecure: boolean;
  region: string;
}

export interface TrackInfo {
  class: string;
  title: string;
  author: string;
  length: number;
  identifier: string;
  uri: string;
  isStream: boolean;
  isSeekable: boolean;
  sourceName?: string;
  position: number;
  artworkUrl: string;
  isrc?: string;
}

export interface ExtendedTrackInfo {
  class: string;
  title: string;
  authors: { name: string; url: string | null }[];
  length: number | bigint;
  identifier: string;
  uri: string;
  isStream: boolean;
  isSeekable: boolean;
  sourceName?: string;
  position: number;
  artworkUrl: string;
  isrc?: string;
  listeners?: number;
}

export interface QueueSong {
  info: ExtendedTrackInfo;
  track: string;
  user: unknown;
  playlist?: PlaylistInfo;
  addedAt: Date;
}

export interface PlaylistInfo {
  name: string;
  creator?: string;
  image?: string;
  uri?: string;
  type: string;
  size: number;
  selectedTrack: number;
}

interface Exception {
  message: string;
  severity: ExceptionSeverities;
  cause: string;
}

interface LoadedTrack {
  info: TrackInfo;
  track: string;
}

export interface BaseLoadTrackPayload {
  loadType: LoadTypes;
  tracks: LoadedTrack[];
  identifier: string;
  playlistInfo?: PlaylistInfo;
  exception?: Exception;
  user: unknown;
  op?: string;
  nonce?: string;
}

export interface NoMatchesPayload extends BaseLoadTrackPayload {
  loadType: "NO_MATCHES";
}

export interface TrackLoadedPayload extends BaseLoadTrackPayload {
  loadType: "TRACK_LOADED";
}

export interface PlaylistLoadedPayload extends BaseLoadTrackPayload {
  loadType: "PLAYLIST_LOADED";
  playlistInfo: PlaylistInfo;
}

export interface LoadFailPayload extends BaseLoadTrackPayload {
  loadType: "LOAD_FAILED";
  exception: Exception;
}

export interface WebSocketLoadTracksPayload<T extends BaseLoadTrackPayload>
  extends T,
    BasePayload {
  nonce: string;
  op: "loadTracks";
}

interface PlayerUpdateSong extends TrackInfo {
  user: unknown;
  track: string;
}

interface FrameStats {
  sent: number;
  nulled: number;
  deficit: number;
}

export interface PlayerState {
  connected: boolean;
  ping: number;
  time: number;
  playing: boolean;
  paused: boolean;
  volume: number;
  frameStats: FrameStats;
  position?: number;
  startedAt?: number;
  song?: PlayerUpdateSong;
}

interface MemoryInfo {
  free: number;
  used: number;
  allocated: number;
  reservable: number;
}

interface CpuInfo {
  cores: number;
  systemLoad: number;
  lavalinkLoad: number;
}

export interface StatsData {
  players: number;
  playingPlayers: number;
  uptime: number;
  frameStats?: FrameStats;
  memory: MemoryInfo;
  cpu: CpuInfo;
}

export interface BasePayload {
  op: OpCodes;
}

export interface PongEvent extends BasePayload {
  op: "pong";
  guildId?: string;
}

export interface WebSocketPongEvent extends PongEvent {
  guildId: string;
  ping: number;
}

export interface StatsEvent extends BasePayload, StatsData {
  op: "stats";
}

export interface BaseEvent extends BasePayload {
  op: "event";
  type: Events;
  guildId: string;
}

export interface TrackEvent extends BaseEvent {
  track: string;
  info: TrackInfo & { user: unknown };
}

export interface TrackStartEvent extends TrackEvent {
  type: "TrackStartEvent";
}

export interface TrackEndEvent extends TrackEvent {
  type: "TrackEndEvent";
  reason: TrackEndReasons;
}

export interface TrackExceptionEvent extends TrackEvent {
  type: "TrackExceptionEvent";
  error: string;
  exception: Exception;
}

export interface TrackStuckEvent extends TrackEvent {
  type: "TrackStuckEvent";
  thresholdMs: number;
}

export interface PlayerUpdateEvent extends BaseEvent {
  type: "PlayerUpdateEvent";
  state: PlayerState;
}

export interface WebSocketClosedEvent extends BaseEvent {
  type: "WebSocketClosedEvent";
  reason?: string;
  code: number;
  byRemote: boolean;
}

export interface WebSocketReadyEvent extends BaseEvent {
  type: "WebSocketReadyEvent";
}

export interface RecordStartEvent extends BaseEvent {
  type: "RecordStart";
  users: string[];
  channels: number;
  bitrate: number;
  id: string;
}

export interface RecordStopEvent extends BaseEvent {
  type: "RecordStop";
  id: string;
}

export type TrackEvents =
  | TrackStartEvent
  | TrackEndEvent
  | TrackExceptionEvent
  | TrackStuckEvent;
export type RecordEvents = RecordStartEvent | RecordStopEvent;
export type VoiceEvents =
  | WebSocketClosedEvent
  | WebSocketReadyEvent
  | WebSocketPongEvent;
export type PlayerEvents =
  | TrackEvents
  | VoiceEvents
  | PlayerUpdateEvent
  | WebSocketPongEvent
  | RecordEvents;
export type AllEvents =
  | PlayerEvents
  | StatsEvent
  | PongEvent
  | WebSocketLoadTracksPayload<BaseLoadTrackPayload>;
