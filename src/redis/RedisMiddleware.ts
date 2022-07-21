import { Prisma } from "@prisma/client";
import { GatewayGuildMemberAddDispatchData } from "discord.js";
import { createClient } from "redis";
import { Tune } from "../Tune";
import Models from "./models";

export class RedisMiddleware {
  public ping = -1;
  public readonly connection = createClient({ url: process.env.REDIS_URL });
  public pubsub?: typeof this.connection;
  public readonly client: Tune;
  private interval?: NodeJS.Timer;

  constructor(client: Tune) {
    this.client = client;

    this.listenEvents(this.connection, ["Redis"]);
  }

  private async makePing() {
    const now = Date.now();
    await this.connection.ping();
    const time = Date.now() - now;
    this.ping = time;
    this.client.logger.debug(`Redis server acknowledged a ping in ${time}ms.`, {
      tags: ["Redis"],
    });
    return time;
  }

  connect() {
    return this.connection
      .connect()
      .then(async () => {
        this.pubsub = this.connection.duplicate();
        this.listenEvents(this.pubsub, ["Redis", "PubSub"], false);
        await this.pubsub.connect();
        this.pubsub.subscribe("discord:guilds", async (packet) => {
          const json = JSON.parse(packet);
          switch (json.t) {
            case "GUILDS": {
              if (json.d.user_id === process.env.DISCORD_CLIENT_ID) return;
              json.d.guilds.forEach(
                (member: GatewayGuildMemberAddDispatchData) => {
                  const guild = this.client.guilds.cache.get(member.guild_id);
                  if (!guild) return;
                  // @ts-ignore
                  // eslint-disable-next-line no-underscore-dangle
                  guild.members._add({
                    ...member,
                    user: { id: json.d.user_id },
                  });
                }
              );
              break;
            }
            case "GUILDS_REQUEST": {
              if (json.d.user_id === process.env.DISCORD_CLIENT_ID) return;
              const p = {
                t: "GUILDS",
                op: 0,
                d: {
                  user_id: process.env.DISCORD_CLIENT_ID,
                  guilds: await Promise.all(
                    [...this.client.guilds.cache.values()].map(
                      async (guild) => {
                        const me = await guild.members.fetchMe();
                        return {
                          nick: me.nickname ?? null,
                          avatar: me.avatar ?? null,
                          roles: [...me.roles.cache.keys()],
                          joined_at: me.joinedAt?.toISOString(),
                          premium_since: me.premiumSince?.toISOString() ?? null,
                          deaf: !!me.voice.deaf,
                          mute: !!me.voice.mute,
                          pending: !!me.pending,
                          permissions: null,
                          communication_disabled_until:
                            me.communicationDisabledUntil?.toISOString() ??
                            null,
                        };
                      }
                    )
                  ),
                },
              };
              this.connection.publish("discord:guilds", JSON.stringify(p));
              break;
            }
            case "GUILD_MEMBER_ADD":
            case "GUILD_MEMBER_UPDATE": {
              if (json.d.user.id === process.env.DISCORD_CLIENT_ID) return;
              const guild = this.client.guilds.cache.get(json.d.guild_id);
              if (!guild) return;
              // @ts-ignore
              // eslint-disable-next-line no-underscore-dangle
              guild.members._add(json.d);
              break;
            }
            case "GUILD_MEMBER_REMOVE": {
              if (json.d.user.id === process.env.DISCORD_CLIENT_ID) return;
              const guild = this.client.guilds.cache.get(json.d.guild_id);
              if (!guild) return;
              guild.members.cache.delete(json.d.user.id);
            }
          }
        });
      })
      .catch((e: any) => this.client.logger.error(e, { tags: ["Redis"] }));
  }

  requestGuilds() {
    return this.connection.publish(
      "discord:guilds",
      JSON.stringify({
        op: 0,
        t: "GUILDS_REQUEST",
        d: { user_id: process.env.DISCORD_CLIENT_ID },
      })
    );
  }

  register(
    params: Prisma.MiddlewareParams,
    next: (p: Prisma.MiddlewareParams) => Promise<any>
  ): Promise<any> {
    if (typeof params.model !== "string") return next(params);
    return Models[params.model][params.action](params, this, next);
  }

  private listenEvents(
    redis: typeof this.connection,
    tags: string[],
    interval = true
  ) {
    redis
      .on("connect", () =>
        this.client.logger.debug("Starting to connect to redis.", { tags })
      )
      .on("ready", async () => {
        this.client.logger.info("Redis connected.", { tags });
        if (interval) {
          await this.makePing();
          this.interval = setInterval(this.makePing.bind(this), 45000);
        }
      })
      .on("end", () =>
        this.client.logger.debug("Redis disconnected.", { tags })
      )
      .on("error", (error: any) => {
        if (interval) {
          clearInterval(this.interval);
          this.interval = undefined;
        }
        this.client.logger.error(error, { tags });
      })
      .on("reconnecting", () =>
        this.client.logger.debug("Reconnecting to Redis server.", { tags })
      );
  }
}
