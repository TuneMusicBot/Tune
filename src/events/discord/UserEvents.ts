import { RedisJSON } from "@redis/json/dist/commands";
import {
  GatewayDispatchEvents,
  GatewayPresenceUpdateDispatchData,
  GatewayVoiceState,
} from "discord-api-types/v10";
import { EventListener } from "../../structures/EventListener";
import { Tune } from "../../Tune";

export class UserEvents extends EventListener {
  constructor(client: Tune) {
    super(
      [
        GatewayDispatchEvents.PresenceUpdate,
        GatewayDispatchEvents.VoiceStateUpdate,
      ],
      client
    );
    this.rawDiscord = true;
  }

  async onPresenceUpdate(presence: GatewayPresenceUpdateDispatchData) {
    await this.client.redis.connection.json.set(
      `discord:${this.client.user.id}:users:${presence.user.id}:presence`,
      "$",
      presence as unknown as RedisJSON
    );
  }

  async onVoiceStateUpdate(p: GatewayVoiceState, shard: number) {
    const state = { ...p, shard };
    let saved = (await this.client.redis.connection.json
      .get(`discord:${this.client.user.id}:users:voice:${state.user_id}`)
      .catch(() => null)) as GatewayVoiceState[] | null;
    if (!saved && state.channel_id) {
      await this.client.redis.connection.json.set(
        `discord:${this.client.user.id}:users:voice:${state.user_id}`,
        "$",
        [state] as unknown as RedisJSON
      );
      return;
    }
    if (!saved) saved = [];
    const exists = saved.findIndex((s) => s.guild_id === p.guild_id);
    if (exists !== -1) {
      if (state.channel_id) saved[exists] = state;
      else saved.splice(exists, 1);
    } else if (state.channel_id) saved.push(state);
    await this.client.redis.connection.json.set(
      `discord:${this.client.user.id}:users:voice:${state.user_id}`,
      "$",
      saved as unknown as RedisJSON
    );
  }
}
