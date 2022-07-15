-- CreateEnum
CREATE TYPE "GuildPermissionType" AS ENUM ('MEMBER', 'ROLE', 'CHANNEL');

-- CreateEnum
CREATE TYPE "UserConnectionPlatforms" AS ENUM ('DISCORD', 'GUILDED', 'LASTFM', 'YOUTUBE', 'SPOTIFY', 'DEEZER', 'LISTENMOE');

-- CreateEnum
CREATE TYPE "Platforms" AS ENUM ('DISCORD', 'GUILDED');

-- CreateEnum
CREATE TYPE "PlayerStates" AS ENUM ('PLAYING', 'PAUSED', 'IDLE', 'MUTED');

-- CreateEnum
CREATE TYPE "GameTypes" AS ENUM ('GUESS_THE_SONG', 'KARAOKE');

-- CreateTable
CREATE TABLE "guild" (
    "id" TEXT NOT NULL,
    "platform" "Platforms" NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en-US',
    "prefixes" TEXT[],
    "messages_id" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "channel_id" TEXT,
    "thread_id" TEXT,
    "allow_dupes" BOOLEAN NOT NULL DEFAULT true,
    "allow_playlists" BOOLEAN NOT NULL DEFAULT true,
    "auto_unsupress" BOOLEAN NOT NULL DEFAULT true,
    "auto_update_topic" BOOLEAN NOT NULL DEFAULT false,
    "auto_sync_commands" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlist" (
    "id" SERIAL NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "flags" INTEGER NOT NULL DEFAULT 0,
    "collaborators" INTEGER[],

    CONSTRAINT "playlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaylistSong" (
    "id" SERIAL NOT NULL,
    "track" TEXT NOT NULL,
    "added_at" TEXT NOT NULL,
    "playlist_id" INTEGER NOT NULL,

    CONSTRAINT "PlaylistSong_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guildEvents" (
    "id" TEXT NOT NULL,
    "auto_unsupress" BOOLEAN NOT NULL,
    "initial_tracks" TEXT[],
    "synchronizer_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "paused" BOOLEAN,
    "volume" INTEGER NOT NULL DEFAULT 100,
    "permissions" JSONB[],

    CONSTRAINT "guildEvents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildPermission" (
    "id" TEXT NOT NULL DEFAULT 'everyone',
    "type" "GuildPermissionType" NOT NULL,
    "allow" INTEGER NOT NULL DEFAULT 76,
    "deny" INTEGER NOT NULL DEFAULT 50,
    "guild_id" TEXT NOT NULL,
    "disabled_commands" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "GuildPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blacklist" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reason" TEXT,
    "banned_by" TEXT NOT NULL,
    "feedback" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "blacklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" SERIAL NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en-US',
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recent_search" JSONB[],
    "achievements" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connection" (
    "id" TEXT NOT NULL,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "platform" "UserConnectionPlatforms" NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMP(3),
    "scopes" TEXT[],
    "data" JSONB NOT NULL,
    "config" JSONB NOT NULL,
    "dm_channel_id" TEXT,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" SERIAL NOT NULL,
    "state" "PlayerStates" NOT NULL,
    "platform" "Platforms" NOT NULL,
    "actions" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "guild_id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "shard_id" INTEGER NOT NULL,
    "voice_channel_id" TEXT NOT NULL,
    "voice_channel_name" TEXT NOT NULL,
    "text_channel_id" TEXT,
    "text_channel_name" TEXT,
    "message_id" TEXT,
    "stage_instance_id" TEXT,
    "volume" INTEGER NOT NULL DEFAULT 100,
    "autoplay" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "forever" BOOLEAN NOT NULL DEFAULT false,
    "trackRepeat" BOOLEAN NOT NULL DEFAULT false,
    "queueRepeat" BOOLEAN NOT NULL DEFAULT false,
    "filters" JSONB,
    "node_id" INTEGER,
    "index" INTEGER NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerTrack" (
    "id" SERIAL NOT NULL,
    "track" TEXT NOT NULL,
    "info" JSONB NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL,
    "playlistInfo" JSONB,
    "index" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,

    CONSTRAINT "PlayerTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" SERIAL NOT NULL,
    "type" "GameTypes" NOT NULL,
    "started_by" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "volume" INTEGER NOT NULL DEFAULT 100,
    "filters" JSONB,
    "player_id" INTEGER NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Player_id_key" ON "Player"("id");

-- CreateIndex
CREATE UNIQUE INDEX "Game_player_id_key" ON "Game"("player_id");

-- AddForeignKey
ALTER TABLE "PlaylistSong" ADD CONSTRAINT "PlaylistSong_playlist_id_fkey" FOREIGN KEY ("playlist_id") REFERENCES "playlist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildPermission" ADD CONSTRAINT "GuildPermission_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerTrack" ADD CONSTRAINT "PlayerTrack_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
