import { RedisJSON } from "@redis/json/dist/commands";
import { GatewayOpcodes, GatewayReceivePayload } from "discord.js";
import { EventListener } from "../structures/EventListener";
import { Tune } from "../Tune";

export class RawListener extends EventListener {
  constructor(client: Tune) {
    super(["raw"], client);
  }

  async onRaw(packet: GatewayReceivePayload) {
    if (packet.op !== GatewayOpcodes.Dispatch) return;

    switch (packet.t) {
      case "CHANNEL_CREATE": {
        const channel = packet.d as typeof packet.d & { guild_id?: string };
        if (!channel.guild_id) return;
        await this.client.redis.connection.json.arrAppend(
          `discord:${process.env.DISCORD_CLIENT_ID}:guildsdata:${channel.guild_id}`,
          ".channels",
          packet as unknown as RedisJSON
        );
        break;
      }
      case "CHANNEL_DELETE": {
        break;
      }
      case "CHANNEL_UPDATE": {
        break;
      }
      case "GUILD_CREATE": {
        const me = packet.d.members.find(
          (m) => m.user?.id === process.env.DISCORD_CLIENT_ID
        );
        if (me) {
          const p = {
            op: 0,
            d: Object.assign(me, {
              guild_id: packet.d.id,
              user: { id: process.env.DISCORD_CLIENT_ID },
            }),
            t: "GUILD_MEMBER_ADD",
          };
          this.client.redis.connection.publish(
            "discord:guilds",
            JSON.stringify(p)
          );
          await this.client.redis.connection.json.del(
            `discord:${process.env.DISCORD_CLIENT_ID}:guildsdata:${packet.d.id}`,
            "$"
          );
          await this.client.redis.connection.json.set(
            `discord:${process.env.DISCORD_CLIENT_ID}:guildsdata:${packet.d.id}`,
            "$",
            {
              states: packet.d.voice_states,
              channels: packet.d.channels,
              me,
              roles: packet.d.roles.map((r) => ({
                id: r.id,
                permissions: r.permissions,
              })),
            } as unknown as RedisJSON
          );
        }
        break;
      }
      case "GUILD_DELETE": {
        const p = {
          op: 0,
          d: {
            guild_id: packet.d.id,
            user: { id: process.env.DISCORD_CLIENT_ID },
          },
          t: "GUILD_MEMBER_REMOVE",
        };
        this.client.redis.connection.publish(
          "discord:guilds",
          JSON.stringify(p)
        );
        await this.client.redis.connection.json.del(
          `discord:${process.env.DISCORD_CLIENT_ID}:guildsdata:${packet.d.id}`,
          "$"
        );
        break;
      }
      case "GUILD_MEMBER_UPDATE": {
        if (packet.d.user.id !== this.client.user?.id) return;
        const p = { op: 0, d: packet.d, t: "GUILD_MEMBER_UPDATE" };
        await this.client.redis.connection.publish(
          "discord:guilds",
          JSON.stringify(p)
        );
        await this.client.redis.connection.json.set(
          `discord:${process.env.DISCORD_CLIENT_ID}:guildsdata:${packet.d.guild_id}`,
          "me",
          packet.d as unknown as RedisJSON
        );
        break;
      }
      case "GUILD_ROLE_CREATE": {
        await this.client.redis.connection.json.arrAppend(
          `discord:${process.env.DISCORD_CLIENT_ID}:guildsdata:${packet.d.guild_id}`,
          ".roles",
          {
            id: packet.d.role.id,
            permissions: packet.d.role.permissions,
          } as RedisJSON
        );
        break;
      }
      case "GUILD_ROLE_DELETE": {
        break;
      }
      case "GUILD_ROLE_UPDATE": {
        break;
      }
      case "PRESENCE_UPDATE": {
        break;
      }
      case "VOICE_STATE_UPDATE": {
        if (!packet.d.guild_id) return;
        const connection = this.client.connections.get(packet.d.guild_id);
        if (connection && packet.d.user_id === this.client.user?.id)
          connection.emit("voiceState", packet.d);
        break;
      }
      case "VOICE_SERVER_UPDATE": {
        const connection = this.client.connections.get(packet.d.guild_id);
        if (connection) connection.emit("voiceServer", packet.d);
        break;
      }
    }
  }
}
