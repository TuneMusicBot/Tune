import { Prisma } from "@prisma/client";
import { IModel } from "../../@types";
import Blacklist from "./Blacklist";
import Game from "./Game";
import Guild from "./Guild";
import GuildPermission from "./GuildPermission";
import Player from "./Player";
import PlayerAction from "./PlayerAction";
import PlayerTrack from "./PlayerTrack";
import Playlist from "./Playlist";
import PlaylistSong from "./PlaylistSong";
import SyncEvent from "./SyncEvent";
import User from "./User";
import UserConnection from "./UserConnection";
import Vote from "./Vote";

const Models: Record<Prisma.ModelName, IModel> = {
  Blacklist,
  Game,
  Guild,
  GuildPermission,
  Player,
  PlayerAction,
  PlayerTrack,
  Playlist,
  PlaylistSong,
  SyncEvent,
  User,
  UserConnection,
  Vote,
};

export = Models;
