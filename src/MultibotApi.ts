import WebSocket from "ws";
import {
  AnyThreadChannel,
  ClientUser,
  Guild,
  GuildMember,
  TextChannel,
  VoiceBasedChannel,
} from "discord.js";
import { Guild as GuildDb } from "@prisma/client";
import { Tune } from "./Tune";
import { CommandContext } from "./structures/command/context/CommandContext";
import { SlashCommandContext } from "./structures/command/context/SlashCommandContext";

let loggedConnect = false;

export class MultibotApi {
  public readonly bots: Map<string, BotData> = new Map();

  private readonly queue: Array<any> = [];
  private readonly client: Tune;
  private sessionId?: string;
  private ws?: WebSocket;

  constructor(client: Tune) {
    this.client = client;
  }

  connect(): Promise<boolean> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN)
      return Promise.resolve(true);
    if (this.ws) this.ws.terminate();

    return new Promise((resolve, reject) => {
      const headers = { authorization: "tunethebestbotever" };
      // @ts-ignore
      if (this.sessionId) headers["session-id"] = this.sessionId;
      this.ws = new WebSocket(MULTIBOT_API, { headers, followRedirects: true });
      const responded = false;
      this.ws
        .once("open", () => {
          if (!loggedConnect) {
            loggedConnect = true;
            this.client.logger.info("Connected to multibot API.", {
              tags: ["MultiBot"],
            });
          }
        })
        .once("close", (code) => {
          this.ws = undefined;
          if (code !== 1006)
            this.client.logger.info("Disconnected from multibot API.", {
              tags: ["MultiBot"],
            });
          if (!responded) reject(code);
          return setTimeout(() => this.connect(), 100);
        })
        .on("message", async (packet) => {
          const json = JSON.parse(packet.toString());
          switch (json.op) {
            case "identify": {
              this.sessionId = json.sessionId;
              const guilds = await Promise.all(
                [...this.client.guilds.cache.values()].map(async (guild) => {
                  const me: GuildMember =
                    // @ts-ignore
                    guild.members.me ?? (await guild.members.fetchMe());
                  return {
                    guildId: guild.id,
                    member: {
                      nick: me.nickname,
                      avatar: me.avatar,
                      roles: [...me.roles.cache.keys()],
                      joined_at: me.joinedAt?.toISOString(),
                      premium_since: me.premiumSince?.toISOString() ?? null,
                      deaf: !!me.voice.deaf,
                      mute: !!me.voice.mute,
                      pending: !!me.pending,
                      communication_disabled_until:
                        me.communicationDisabledUntil?.toISOString() ?? null,
                    },
                  };
                })
              );
              this.send({
                op: "identify",
                clientId: this.client.user?.id,
                shards: this.client.shard?.ids ?? [],
                guilds,
                players: await this.client.prisma.player.count({
                  where: { platform: "DISCORD", bot_id: this.client.user?.id },
                }),
                ping: this.client.ws.ping,
              });
              break;
            }
            case "resume": {
              if (!responded) resolve(true);
              if (this.queue.length > 0)
                this.queue.splice(0).map(this.processQueue.bind(this));
              break;
            }
            case "bots": {
              if (!responded) resolve(true);
              if (this.queue.length > 0)
                this.queue.splice(0).map(this.processQueue.bind(this));
              json.bots.forEach((data: any) => {
                const { guilds, shards } = this.bots.get(data.clientId) ?? {
                  guilds: new Set<string>(),
                  shards: new Set<number>(),
                };
                data.guilds.forEach((g: any) => {
                  if (this.client.guilds.cache.has(g.id)) {
                    const guild = this.client.guilds.cache.get(g.id) as Guild;
                    json.member.user = { id: data.clientId };
                    // @ts-ignore
                    // eslint-disable-next-line no-underscore-dangle
                    guild.members._add(json.member, true, {
                      id: data.clientId,
                    });
                  }
                  guilds.add(g.id);
                });
                data.shards.map((s: number) => shards.add(s));
                if (this.bots.has(data.clientId))
                  this.bots.delete(data.clientId);
                this.bots.set(data.clientId, {
                  guilds,
                  shards,
                  ping: data.ping,
                  players: data.players,
                });
              });
              break;
            }
            case "botPingUpdate": {
              if (this.bots.has(json.clientId)) {
                const { shards, guilds } = this.bots.get(
                  json.clientId
                ) as BotData;
                this.bots.delete(json.clientId);
                this.bots.set(json.clientId, {
                  shards,
                  guilds,
                  ping: json.ping,
                  players: json.players,
                });
              } else {
                this.bots.set(json.clientId, {
                  shards: new Set(),
                  guilds: new Set(),
                  ping: json.ping,
                  players: json.players,
                });
              }
              break;
            }
            case "botGuildAdd": {
              if (this.client.guilds.cache.has(json.guildId)) {
                const guild = this.client.guilds.cache.get(
                  json.guildId
                ) as Guild;
                json.member.user = { id: json.clientId };
                // @ts-ignore
                // eslint-disable-next-line no-underscore-dangle
                guild.members._add(json.member, true, {
                  id: json.clientId,
                  extras: [guild],
                });
              }
              if (this.bots.has(json.clientId))
                (this.bots.get(json.clientId) as BotData).guilds.add(
                  json.guildId
                );
              break;
            }
            case "botGuildRemove": {
              if (this.client.guilds.cache.has(json.guildId)) {
                const guild = this.client.guilds.cache.get(
                  json.guildId
                ) as Guild;
                if (guild.members.cache.has(json.clientId))
                  guild.members.cache.delete(json.clientId);
              }
              if (this.bots.has(json.clientId))
                (this.bots.get(json.clientId) as BotData).guilds.delete(
                  json.guildId
                );
              break;
            }
            case "botGuildUpdate": {
              if (this.client.guilds.cache.has(json.guildId)) {
                const guild = this.client.guilds.cache.get(
                  json.guildId
                ) as Guild;
                json.member.user = { id: json.clientId };
                // @ts-ignore
                // eslint-disable-next-line no-underscore-dangle
                guild.members._add(json.member, true, {
                  id: json.clientId,
                  extras: [guild],
                });
              }
              break;
            }
            case "guildBots": {
              if (this.client.guilds.cache.has(json.guildId)) {
                const guild = this.client.guilds.cache.get(
                  json.guildId
                ) as Guild;
                json.bots.forEach((bot: any) => {
                  const { member, clientId } = bot;
                  member.user = { id: clientId };
                  // @ts-ignore
                  // eslint-disable-next-line no-underscore-dangle
                  guild.members._add(member, true, {
                    id: clientId,
                    extras: [guild],
                  });
                });
              }
            }
            // eslint-disable-next-line no-fallthrough
            case "configChannel": {
              const { guildId, threadId, channelId } = json;
              if (this.client.guilds.cache.has(guildId)) {
                const guild = this.client.guilds.cache.get(guildId) as Guild;
                if (guild.channels.cache.has(channelId)) {
                  const channel = guild.channels.cache.get(
                    channelId
                  ) as TextChannel;
                  const guildDb = (await this.client.prisma.guild.findUnique({
                    where: { id: guildId },
                  })) as GuildDb;
                  const msgIndex = guildDb.messages_id.findIndex((m) =>
                    m.startsWith((this.client.user as ClientUser).id)
                  );
                  if (msgIndex === -1)
                    await channel.send({ content: "a" }).then((msg) => {
                      guildDb.messages_id[
                        msgIndex
                      ] = `${msg.author.id}-${msg.id}`;
                      return this.client.prisma.guild.update({
                        where: { id: guildId },
                        data: { messages_id: guildDb.messages_id },
                      });
                    });
                  // @ts-ignore VSFD DJS
                  const thread = (await guild.channels.fetch(
                    threadId
                  )) as AnyThreadChannel;
                  if (
                    !thread.members.cache.has(
                      (this.client.user as ClientUser).id
                    ) &&
                    thread.joinable
                  )
                    await thread.join();
                }
              }
              break;
            }
          }
        })
        .on("error", (error) => {
          if (!responded) reject(error);
          this.client.logger.error(error as any, { error, tags: ["MultiBot"] });
        });
    });
  }

  send(packet: any) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
        // eslint-disable-next-line no-promise-executor-return
        return this.queue.push({ packet, resolve, reject });
      // eslint-disable-next-line no-promise-executor-return
      return this.ws.send(JSON.stringify(packet), (err) =>
        err ? reject(err) : resolve(true)
      );
    });
  }

  processQueue(data: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
      throw new Error("Websocket connection not open.");
    return this.ws.send(JSON.stringify(data.packet), (err) =>
      err ? data.reject(err) : data.resolve(true)
    );
  }

  canExecuteCommand(context: CommandContext): boolean {
    if (context.channel.isDMBased()) return true;
    if (context instanceof SlashCommandContext) return true;
    if (!context.guild?.available) return false;

    if (context.command.voice && context.member?.voice.channelId) {
      const { members } = context.member.voice.channel as VoiceBasedChannel;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-non-null-asserted-optional-chain
      if (members.has(this.client.user?.id!)) return true;
      const hasBot = members.hasAny(...Tune.bots);
      if (hasBot) return false;
      const firstAvaibleBot = Tune.bots.find((id) => {
        const member =
          id === this.client.user?.id
            ? context.guild?.members.me
            : context.guild?.members.cache.get(id);
        if (!member) return false;
        if (member.isCommunicationDisabled()) return false;
        if (member.voice.channelId) return false;
        if (member.presence && member.presence.status === "offline")
          return false;
        // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain, @typescript-eslint/no-non-null-assertion
        const vcPerm = member.permissionsIn(context.member?.voice.channelId!);
        const chPerm = member.permissionsIn(context.channel.id);
        return (
          vcPerm.has(["Connect", "Speak", "ViewChannel"], true) &&
          chPerm.has(
            [
              "SendMessages",
              "AttachFiles",
              "EmbedLinks",
              "UseExternalEmojis",
              "ViewChannel",
            ],
            true
          )
        );
      });
      return this.client.user?.id === firstAvaibleBot;
    }

    if (
      context.member?.voice.channel &&
      context.member.voice.channel.members.hasAny(...Tune.bots)
    ) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const botOnChannel = context.member.voice.channel.members.findKey(
        (_a, id) => Tune.bots.includes(id)
      )!;
      if (botOnChannel !== this.client.user?.id) return false;
      const chPerm = context.channel.permissionsFor(botOnChannel);
      if (
        chPerm?.has(
          [
            "SendMessages",
            "AttachFiles",
            "EmbedLinks",
            "UseExternalEmojis",
            "ViewChannel",
          ],
          true
        )
      )
        return true;
    }

    const firstAvaibleBot = Tune.bots.find((id) => {
      const member =
        id === this.client.user?.id
          ? context.guild?.members.me
          : context.guild?.members.cache.get(id);
      if (!member) return false;
      if (member.isCommunicationDisabled()) return false;
      if (member.presence && member.presence.status === "offline") return false;
      const chPerm = member.permissionsIn(context.channel.id);
      return chPerm.has(
        [
          "SendMessages",
          "AttachFiles",
          "EmbedLinks",
          "UseExternalEmojis",
          "ViewChannel",
        ],
        true
      );
    });

    return this.client.user?.id === firstAvaibleBot;
  }
}

interface BotData {
  guilds: Set<string>;
  shards: Set<number>;
  players: number;
  ping: number;
}
