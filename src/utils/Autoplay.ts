import { PlayerTrack } from "@prisma/client";
import { TrackInfo } from "../@types/lavalink";
import { Node } from "../structures/Node";

const SALT = "abcdefghijklmnopqrstuvwxyz";
const SOUNDCLOUD_REGEX = /\/soundcloud:tracks:(\d+)\//;

export class Autoplay {
  static async fetchTrack(node: Node, track?: PlayerTrack) {
    if (!track) return this.getRandomSpotifyTrack(node).then((s) => s.tracks);
    const info = track.info as unknown as TrackInfo;
    if (info.sourceName === "soundcloud") {
      const soundcloud = await this.getSoundCloudRelatedTrack(
        node,
        SOUNDCLOUD_REGEX.exec(info.identifier)?.[1] as string
      );
      if (soundcloud.tracks.length > 0) return soundcloud.tracks;
    }
    if (info.sourceName === "spotify") {
      const spotify = await this.getSpotifyRelatedTrack(node, info.identifier);
      if (spotify.tracks.length > 0) return spotify.tracks;
    }
    if (
      info.sourceName &&
      ["youtube", "youtube-music"].includes(info.sourceName)
    ) {
      let youtube = await this.getYouTubeMixTrack(node, info.identifier);
      if (youtube.tracks.length > 0) return youtube.tracks;
      youtube = await this.getYouTubeRelatedTrack(node, info.identifier);
      if (youtube.tracks.length > 0) return youtube.tracks;
    }
    return this.getRandomSpotifyTrack(node).then((s) => s.tracks);
  }

  static getYouTubeMixTrack(node: Node, videoId: string) {
    return node.loadTracks(
      `https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}`,
      { id: "AUTOPLAY" }
    );
  }

  static getYouTubeRelatedTrack(node: Node, videoId: string) {
    return node.loadTracks(`ytsimilar:${videoId}`, { id: "AUTOPLAY" });
  }

  static getSoundCloudRelatedTrack(node: Node, songId: string) {
    return node.loadTracks(`scsimilar:${songId}`, { id: "AUTOPLAY" });
  }

  static getSpotifyRelatedTrack(node: Node, songId: string) {
    return node.loadTracks(`spsimilar:${songId}`, { id: "AUTOPLAY" });
  }

  static getRandomSpotifyTrack(node: Node) {
    const letter = SALT[Math.floor(Math.random() * SALT.length)];
    const type = Math.floor(Math.random() * 3);
    const query =
      // eslint-disable-next-line no-nested-ternary
      type === 0 ? `${letter}%s` : type === 1 ? `%s${letter}%s` : `%s${letter}`;
    return node.loadTracks(`spsearch:${query}`, { id: "AUTOPLAY" });
  }
}
