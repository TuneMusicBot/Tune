import { request } from "undici";
import crypto from "crypto";
import { UserConnection } from "@prisma/client";
import { PlaylistInfo } from "../@types/lavalink";
import { Tune } from "../Tune";

export class Lastfm {
  public static readonly API_URL: string = "http://ws.audioscrobbler.com/2.0/";

  private readonly client: Tune;

  constructor(client: Tune) {
    this.client = client;
  }

  public async makeConnection(
    token: string,
    userId: string | number
  ): Promise<UserConnection> {
    const accountId =
      typeof userId === "number"
        ? userId
        : await this.client.prisma.userConnection
            .findFirst({ where: { id: userId, platform: "DISCORD" } })
            .then((r) => r?.user_id as number);
    if (typeof accountId !== "number") throw new Error("Account not found.");
    const alreadyExists = await this.client.prisma.userConnection
      .findMany({ where: { user_id: accountId, platform: "LASTFM" } })
      .catch(() => []);
    const { key } = await this.getSession(token);
    const currentUser = await this.getCurrentUser(key);
    if (alreadyExists.findIndex((c) => c.id === currentUser.name) !== -1) {
      const connection = await this.client.prisma.userConnection.update({
        where: { id: currentUser.name },
        data: { access_token: key, data: currentUser },
      });
      return connection;
    }
    const connection = await this.client.prisma.userConnection.create({
      data: {
        id: currentUser.name,
        data: currentUser,
        access_token: key,
        platform: "LASTFM",
        logged_at: new Date(),
        user_id: accountId,
        config: {},
      },
    });
    return connection;
  }

  public getCurrentUser(sk: string) {
    return this.makeRequest(
      "user.getInfo",
      { sk },
      { signature: false, write: false }
    ).then((r) => r.user);
  }

  public getSession(token: string) {
    return this.makeRequest(
      "auth.getSession",
      { token },
      { signature: true, write: false }
    ).then((r) => r.session);
  }

  public updateNowplaying(
    {
      title,
      authors,
      sourceName,
      length,
      playlist,
    }: {
      title: string;
      authors: { name: string }[];
      sourceName?: string;
      length: number | bigint;
      playlist?: PlaylistInfo;
    },
    sk: string
  ) {
    const filtered = this.getFilteredTrack(
      authors.map(({ name }) => name).join(", "),
      title,
      sourceName
    );
    const obj = { track: filtered.title, artist: filtered.artist, sk };
    if (BigInt(length) !== 9223372036854775807n)
      Object.assign(obj, { duration: ~~(Number(length) / 1000) });
    if (playlist && ["single", "album"].includes(playlist.type))
      Object.assign(obj, { album: playlist.name });
    if (
      playlist?.creator &&
      authors.findIndex(({ name }) => name === playlist.creator) === -1
    )
      Object.assign(obj, { albumArtist: playlist.creator });
    return this.makeRequest("track.updateNowPlaying", obj, {
      write: true,
      signature: true,
      format: "xml",
    });
  }

  public scrobbleSong(
    {
      title,
      authors,
      sourceName,
      length,
      playlist,
      user,
    }: {
      title: string;
      authors: { name: string }[];
      sourceName?: string;
      length: number | bigint;
      playlist?: PlaylistInfo;
      user: unknown;
    },
    sk: string,
    userId: string,
    timestamp: Date = new Date()
  ) {
    const filtered = this.getFilteredTrack(
      authors.map(({ name }) => name).join(", "),
      title,
      sourceName
    );
    const obj = {
      track: filtered.title,
      artist: filtered.artist,
      sk,
      chosenByUser: (user as { id: string }).id === userId ? 1 : 0,
      timestamp: timestamp.getTime(),
    };
    if (BigInt(length) !== 9223372036854775807n)
      Object.assign(obj, { duration: ~~(Number(length) / 1000) });
    if (playlist && ["single", "album"].includes(playlist.type))
      Object.assign(obj, { album: playlist.name });
    if (
      playlist?.creator &&
      authors.findIndex(({ name }) => name === playlist.creator) === -1
    )
      Object.assign(obj, { albumArtist: playlist.creator });
    return this.makeRequest("track.scrobble", obj, {
      signature: true,
      write: true,
    });
  }

  public async loveSong(
    {
      title,
      author,
      sourceName,
    }: { title: string; author: string; sourceName?: string },
    sk: string
  ) {
    const filtered = this.getFilteredTrack(author, title, sourceName);
    const matched = await this.getMatchedTrack(filtered.title, filtered.artist);
    return this.makeRequest(
      "track.love",
      { sk, track: matched.title, artist: matched.artist },
      { signature: true, write: true, format: "xml" }
    );
  }

  public async unloveSong(
    {
      title,
      author,
      sourceName,
    }: { title: string; author: string; sourceName?: string },
    sk: string
  ) {
    const filtered = this.getFilteredTrack(author, title, sourceName);
    const matched = await this.getMatchedTrack(filtered.title, filtered.artist);
    return this.makeRequest(
      "track.unlove",
      { sk, track: matched.title, artist: matched.artist },
      { signature: true, write: true, format: "xml" }
    );
  }

  private makeRequest(
    method: string,
    params: object,
    {
      signature,
      write,
      format = "json",
    }: { signature: boolean; write: boolean; format?: string }
  ) {
    const query = {
      ...params,
      method,
      api_key: process.env.LASTFM_APIKEY,
      format,
    };
    if (signature)
      Object.assign(query, { api_sig: this.generateSignature(query) });
    return request(
      `${Lastfm.API_URL}?${new URLSearchParams(query).toString()}`,
      {
        method: write ? "POST" : "GET",
        headers: write
          ? { "content-type": "application/x-www-form-urlencoded" }
          : undefined,
      }
    ).then((r) => {
      if (format === "json") return r.body.json();
      return r.body.text();
    });
  }

  private generateSignature(params: object): string {
    const keys = Object.keys(params);
    keys.splice(Object.keys(params).indexOf("format"), 1);
    const signature = keys
      .sort()
      .map(
        (p) =>
          `${p}${Object.getOwnPropertyDescriptor(params, p)?.value as typeof p}`
      )
      .join("");
    return crypto
      .createHash("md5")
      .update(`${signature}${process.env.LASTFM_SECRET}`, "utf8")
      .digest("hex");
  }

  private getFilteredTrack(
    artist: string,
    title: string,
    source = "http"
  ): { title: string; artist: string } {
    const titleSplitted = title.split("-")[0];
    const test =
      source === "youtube"
        ? titleSplitted
            .toLowerCase()
            .replace(" ", "")
            .includes(artist.toLowerCase().replace("vevo", "").replace(" ", ""))
        : false;
    const outArtist = test ? title.split(" - ")[0] : artist;
    const outTitle = test ? title.split(" - ")[1] : title;
    return { title: outTitle, artist: outArtist };
  }

  private async getMatchedTrack(
    title: string,
    artist: string
  ): Promise<{ title: string; artist: string }> {
    const { track, error } = await this.makeRequest(
      "track.getInfo",
      { title, artist, lang: "en", autocorrect: 1 },
      { signature: false, write: false }
    );
    if (error && error === 6) return { title, artist };
    return { title: track.title, artist: track.artist.name };
  }
}
