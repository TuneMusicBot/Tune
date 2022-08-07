import { createClient } from "redis";
import { Tune } from "./Tune";

export class Redis {
  public ping = -1;
  public readonly connection = createClient({ url: process.env.REDIS_URL });
  private readonly client: Tune;
  private interval?: NodeJS.Timer;

  constructor(client: Tune) {
    this.client = client;

    this.connection
      .on("connect", () =>
        this.client.logger.debug("Starting to connect to redis.", {
          tags: ["Redis"],
        })
      )
      .on("ready", async () => {
        this.client.logger.info("Redis connected.", { tags: ["Redis"] });

        await this.makePing();
        this.interval = setInterval(this.makePing.bind(this), 45000);
      })
      .on("end", () =>
        this.client.logger.debug("Redis disconnected.", { tags: ["Redis"] })
      )
      .on("error", (error: any) => {
        clearInterval(this.interval);
        this.interval = undefined;

        this.client.logger.error(error, { tags: ["Redis"] });
      })
      .on("reconnecting", () =>
        this.client.logger.debug("Reconnecting to Redis server.", {
          tags: ["Redis"],
        })
      );
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
      .catch((err: any) => this.client.logger.error(err, { tags: ["Error"] }));
  }
}
