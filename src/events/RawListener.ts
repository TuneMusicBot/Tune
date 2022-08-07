import {
  GatewayDispatchEvents,
  GatewayOpcodes,
  GatewayReceivePayload,
} from "discord-api-types/v10";
import { RawRESTRequest } from "eris";
import { EventListener } from "../structures/EventListener";
import { Tune } from "../Tune";

export class RawListener extends EventListener {
  constructor(client: Tune) {
    super(["rawREST", "rawWS"], client);
  }

  async onRawWS(packet: GatewayReceivePayload, shard: number) {
    if (packet.op !== GatewayOpcodes.Dispatch) return;
    if (packet.t === GatewayDispatchEvents.VoiceServerUpdate) {
      const connection = this.client.connections.get(packet.d.guild_id);
      if (!connection) return;
      connection.emit("voiceServer", packet.d);
    } else if (packet.t === GatewayDispatchEvents.VoiceStateUpdate) {
      if (packet.d.user_id === process.env.DISCORD_CLIENT_ID) {
        const connection = this.client.connections.get(
          packet.d.guild_id as string
        );
        if (!connection) return;
        connection.emit("voiceState", packet.d);
        return;
      }
      const user =
        this.client.users.get(packet.d.user_id) ||
        (await this.client.getRESTUser(packet.d.user_id));
      if (!this.client.users.has(packet.d.user_id))
        this.client.users.set(user.id, user);
      if (user.bot) return;
    }
    this.client.discordEvents.emit(packet.t, packet.d, shard);
  }

  onRawREST({
    method,
    url,
    resp,
    route,
    latency,
  }: RawRESTRequest & { latency: number }) {
    resp.once("end", () => {
      const now = Date.now();
      setTimeout(() => {
        const { requestHandler } = this.client;
        let string = `${method} ${url} ${resp.statusCode}: ${latency}ms (${requestHandler.latencyRef.latency}ms avg)`;
        if (requestHandler.ratelimits[route]) {
          string += ` | ${requestHandler.ratelimits[route].remaining}/${
            requestHandler.ratelimits[route].limit
          } left | Reset ${requestHandler.ratelimits[route].reset} (${
            requestHandler.ratelimits[route].reset - now
          }ms left)`;
        }
        this.client.logger.debug(string, { tags: ["Discord", "REST"] });
      }, 100);
    });
  }
}
