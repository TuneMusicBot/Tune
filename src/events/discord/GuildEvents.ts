import { RedisJSON } from "@redis/json/dist/commands";
import {
  GatewayDispatchEvents,
  GatewayGuildCreateDispatchData,
  GatewayGuildDeleteDispatchData,
  GatewayReadyDispatchData,
  GatewayVoiceState,
} from "discord-api-types/v10";
import { EventListener } from "../../structures/EventListener";
import { Tune } from "../../Tune";

export class GuildEvents extends EventListener {
  constructor(client: Tune) {
    super(
      [
        GatewayDispatchEvents.Ready,
        GatewayDispatchEvents.GuildCreate,
        GatewayDispatchEvents.GuildDelete,
      ],
      client
    );
    this.rawDiscord = true;
  }

  async onReady(packet: GatewayReadyDispatchData, shard: number) {
    const guilds = packet.guilds.map((g) => g.id);
    const formattedGuilds = `(${guilds.join("|")}) @shard:[${shard} ${shard}]`;
    const deletedGuilds = await this.client.redis.connection.ft
      .search(
        `discord:${packet.user.id}:guilds`,
        `-@guild_id:${formattedGuilds}`
      )
      .catch(() => null);
    if (deletedGuilds && deletedGuilds.documents.length > 0) {
      await Promise.all(
        deletedGuilds.documents.map(({ id, value }) =>
          Promise.all([
            this.client.redis.connection.json.del(id, "$"),
            this.client.redis.connection.json.del(
              `discord:${packet.user.id}:guilds:${value.id}:channels`
            ),
            this.client.redis.connection.json.del(
              `discord:${packet.user.id}:guilds:${value.id}:roles`
            ),
            this.client.redis.connection.json.del(
              `discord:${packet.user.id}:guilds:${value.id}:members`
            ),
            this.client.redis.connection.json.del(
              `discord:${packet.user.id}:guilds:${value.id}:events`
            ),
          ])
        )
      );
    }
    const states = await this.client.redis.connection.ft
      .search(
        `discord:${packet.user.id}:voice`,
        `-@guild_id:${formattedGuilds}`
      )
      .catch(() => null);
    if (states && states.documents.length > 0) {
      const users: Set<string> = new Set();

      states.documents.map((s) => users.add(s.value.user_id as string));
      users.forEach(async (userId) => {
        if (!userId) return;
        const allStates = (await this.client.redis.connection.json.get(
          `discord:${this.client.user.id}:users:voice:${userId}`
        )) as unknown as GatewayVoiceState[];
        const newStates = allStates.filter((s) =>
          guilds.includes(s.guild_id as string)
        );
        await this.client.redis.connection.json.set(
          `discord:${this.client.user.id}:users:voice:${userId}`,
          "$",
          newStates as unknown as RedisJSON
        );
      });
    }
  }

  async onGuildDelete(packet: GatewayGuildDeleteDispatchData, shard: number) {
    if (packet.unavailable) return;
    await Promise.all([
      this.client.redis.connection.json.del(
        `discord:${this.client.user.id}:guilds:${packet.id}`,
        "$"
      ),
      this.client.redis.connection.json.del(
        `discord:${this.client.user.id}:guilds:${packet.id}:channels`,
        "$"
      ),
      this.client.redis.connection.json.del(
        `discord:${this.client.user.id}:guilds:${packet.id}:roles`,
        "$"
      ),
      this.client.redis.connection.json.del(
        `discord:${this.client.user.id}:guilds:${packet.id}:members`,
        "$"
      ),
      this.client.redis.connection.json.del(
        `discord:${this.client.user.id}:guilds:${packet.id}:events`,
        "$"
      ),
    ]);
    const states = await this.client.redis.connection.ft
      .search(
        `discord:${this.client.user.id}:voice`,
        `@guild_id:${packet.id} @shard:[${shard} ${shard}]`
      )
      .catch(() => null);
    if (states && states.documents.length > 0) {
      const users: Set<string> = new Set();

      states.documents
        // @ts-ignore
        .map((s) => users.add(s.value.user_id));
      users.forEach(async (userId) => {
        const allStates = (await this.client.redis.connection.json.get(
          `discord:${this.client.user.id}:users:voice:${userId}`
        )) as unknown as GatewayVoiceState[];
        allStates.splice(
          allStates.findIndex((s) => s.guild_id === packet.id),
          1
        );
        await this.client.redis.connection.json.set(
          `discord:${this.client.user.id}:users:voice:${userId}`,
          "$",
          allStates as unknown as RedisJSON
        );
      });
    }
  }

  async onGuildCreate(packet: GatewayGuildCreateDispatchData, shard: number) {
    const {
      channels,
      roles,
      members,
      presences,
      voice_states: states,
      guild_scheduled_events: events,
    } = packet;
    const guild = {
      shard,
      id: packet.id,
      icon: packet.icon,
      name: packet.name,
      banner: packet.banner,
      owner_id: packet.owner_id,
      features: packet.features,
      premium_tier: packet.premium_tier,
      preferred_locale: packet.preferred_locale,
    };
    await Promise.all([
      this.client.redis.connection.json.set(
        `discord:${this.client.user.id}:guilds:${packet.id}`,
        "$",
        guild
      ),
      this.client.redis.connection.json.set(
        `discord:${this.client.user.id}:guilds:${packet.id}:channels`,
        "$",
        channels as unknown as RedisJSON
      ),
      this.client.redis.connection.json.set(
        `discord:${this.client.user.id}:guilds:${packet.id}:roles`,
        "$",
        roles as unknown as RedisJSON
      ),
      this.client.redis.connection.json.set(
        `discord:${this.client.user.id}:guilds:${packet.id}:members`,
        "$",
        members as unknown as RedisJSON
      ),
      this.client.redis.connection.json.set(
        `discord:${this.client.user.id}:guilds:${packet.id}:events`,
        "$",
        events as unknown as RedisJSON
      ),
    ]);
    await Promise.all(
      presences.map((p) =>
        this.client.redis.connection.json.set(
          `discord:${this.client.user.id}:users:${p.user.id}:presence`,
          "$",
          p as unknown as RedisJSON
        )
      )
    );
    let query = `@guild_id:${packet.id} @shard:[${shard} ${shard}]`;
    if (states.length > 0)
      query += ` -@user_id:(${states.map((s) => s.user_id).join("|")})`;
    const savedStates = await this.client.redis.connection.ft
      .search(`discord:${this.client.user.id}:voice`, query)
      .catch(() => null);
    if (savedStates && savedStates.documents.length > 0) {
      const users: Set<string> = new Set();
      savedStates.documents
        .filter((s) => Array.isArray(s.value))
        // @ts-ignore
        .map((s) => users.add(s.value[0].user_id));
      users.forEach(async (userId) => {
        const content = (await this.client.redis.connection.json.get(
          `discord:${this.client.user.id}:users:voice:${userId}`
        )) as unknown as GatewayVoiceState[];
        content.splice(
          content.findIndex((s) => s.guild_id === packet.id),
          1
        );
        await this.client.redis.connection.json.set(
          `discord:${this.client.user.id}:users:voice:${userId}`,
          "$",
          content as unknown as RedisJSON
        );
      });
    }
    states.map(async (p) => {
      const state = { ...p, shard, guild_id: packet.id };
      const saved = (await this.client.redis.connection.json
        .get(`discord:${this.client.user.id}:users:voice:${state.user_id}`, {
          path: "$",
        })
        .catch(() => null)) as GatewayVoiceState[] | null;
      if (!saved) {
        await this.client.redis.connection.json.set(
          `discord:${this.client.user.id}:users:voice:${state.user_id}`,
          "$",
          [state] as unknown as RedisJSON
        );
        return;
      }
      const exists = saved.findIndex((s) => s.guild_id === packet.id);
      if (exists !== -1) saved[exists] = state;
      else saved.push(state);
      await this.client.redis.connection.json.set(
        `discord:${this.client.user.id}:users:voice:${state.user_id}`,
        "$",
        saved as unknown as RedisJSON
      );
    });
  }
}
