/* eslint-disable no-nested-ternary */
/* eslint-disable consistent-return */
// eslint-disable-next-line max-classes-per-file
import { Platforms, Player } from "@prisma/client";
import {
  ChannelType,
  GatewayOpcodes,
  GatewayVoiceServerUpdateDispatchData,
  GatewayVoiceStateUpdateDispatchData,
  GuildScheduledEventStatus,
  PermissionFlagsBits,
} from "discord-api-types/v10";
import { AnyVoiceChannel } from "eris";
import { EventEmitter, once } from "node:events";
import { Tune } from "../Tune";
import { Node } from "./Node";

export enum ConnectionStates {
  IDLE,
  CONNECTING,
  CONNECTED,
  DISCONNECTED,
  DISCONNECTING,
  RECONNECTING,
}

export enum ConnectOptionsTypes {
  COMPLETE,
  WEBSOCKET_ONLY,
}
interface ConnectOptions {
  player: Player;
  type: ConnectOptionsTypes;
  confirm: boolean;
}

export class TimeoutError extends Error {}
const timeoutError = new TimeoutError(
  "Connection took more than 15 seconds to be completed."
);

type VoiceState = GatewayVoiceStateUpdateDispatchData & {
  guild_id: string;
  channel_id?: string;
};
type VoiceServer = GatewayVoiceServerUpdateDispatchData & { endpoint?: string };

export class Connection extends EventEmitter {
  public state: ConnectionStates = ConnectionStates.IDLE;
  public readonly guildId: string;
  private readonly client: Tune;

  public endpoint?: string;
  public token?: string;
  public ping = -1;

  constructor(client: Tune, guildId: string) {
    super();
    this.guildId = guildId;
    this.client = client;

    this.on("voiceState", async (state: VoiceState) => {
      if (
        [
          ConnectionStates.DISCONNECTING,
          ConnectionStates.RECONNECTING,
        ].includes(this.state) &&
        !state.channel_id
      )
        return this.emit("voiceChannelLeave");
      if (
        [ConnectionStates.CONNECTING, ConnectionStates.RECONNECTING].includes(
          this.state
        ) &&
        state.channel_id &&
        state.session_id === this.sessionId
      )
        this.emit("voiceChannelConnect");
      const player = await this.client.prisma.player
        .findFirst({
          where: {
            guild_id: state.guild_id,
            bot_id: process.env.DISCORD_CLIENT_ID,
            platform: Platforms.DISCORD,
          },
        })
        .catch(() => null);
      if (!state.channel_id) {
        if (player) {
          await this.client.prisma.playerTrack
            .deleteMany({ where: { player_id: player.id } })
            .catch(() => null);
          await this.client.prisma.playerAction
            .deleteMany({ where: { player_id: player.id } })
            .catch(() => null);
          await this.client.prisma.player
            .delete({ where: { id: player.id } })
            .catch(() => null);
          await this.client.nodes
            .get(player.node_id as number)
            ?.send({ op: "destroy", guildId: state.guild_id });
          if (player.text_channel_id && player.message_id)
            await this.client
              .deleteMessage(player.text_channel_id, player.message_id)
              .catch(() => null);
          this.client.connections.delete(state.guild_id);
          return;
        }
      }
      const guild = this.client.guilds.get(state.guild_id);
      if (!guild) return;
      const voiceChannel = guild.channels.get(
        state.channel_id
      ) as AnyVoiceChannel;
      if (!voiceChannel) return;
      if (player && player?.voice_channel_id !== state.channel_id) {
        await this.client.prisma.player.update({
          where: { id: player.id },
          data: {
            voice_channel_id: voiceChannel.id,
            voice_channel_name: voiceChannel.name,
            voice_channel_type:
              voiceChannel.type === ChannelType.GuildVoice
                ? "VOICE_CHANNEL"
                : guild.stageInstances.find(
                    (s) => s.channel.id === voiceChannel.id
                  ) ||
                  guild.events.find(
                    (e) =>
                      // @ts-ignore Missing on types
                      e.channel.id === voiceChannel.id &&
                      e.status === GuildScheduledEventStatus.Active
                  )
                ? "ACTIVE_STAGE_CHANNEL"
                : "STAGE_CHANNEL",
          },
        });
      }
      const settings = await this.client.prisma.guild
        .findFirst({
          where: { id: state.guild_id, platform: Platforms.DISCORD },
        })
        .catch(() => null);
      if (!settings) return;
      const permissions = voiceChannel.permissionsOf(this.client.user.id);
      const me =
        guild.members.get(this.client.user.id) ||
        (await this.client.getRESTGuildMember(
          state.guild_id,
          this.client.user.id
        ));
      if (
        settings.auto_unsupress &&
        voiceChannel.type === ChannelType.GuildStageVoice &&
        state.suppress &&
        (me.permissions.has(PermissionFlagsBits.Administrator) ||
          permissions.has(PermissionFlagsBits.MuteMembers))
      ) {
        await this.client.editGuildVoiceState(state.guild_id, {
          suppress: false,
          channelID: state.channel_id,
        });
      } else if (
        voiceChannel.type === ChannelType.GuildStageVoice &&
        state.suppress &&
        !state.request_to_speak_timestamp &&
        (me.permissions.has(PermissionFlagsBits.Administrator) ||
          permissions.has(PermissionFlagsBits.RequestToSpeak))
      ) {
        await this.client.editGuildVoiceState(state.guild_id, {
          requestToSpeakTimestamp: new Date(),
          channelID: state.channel_id,
        });
      }
    })
      .on("voiceServer", async (state: VoiceServer) => {
        if (this.state === ConnectionStates.CONNECTING) return;
        this.token = state.token ?? this.token;
        this.endpoint = state.endpoint ?? this.endpoint;
        if (!this.endpoint) return; // Wait for the next update.
        const player = await this.client.prisma.player
          .findFirst({
            where: {
              bot_id: this.client.user?.id,
              guild_id: state.guild_id,
              platform: Platforms.DISCORD,
            },
          })
          .catch(() => null);
        if (!player) return;
        const node =
          typeof player.node_id === "number"
            ? this.client.nodes.get(player.node_id)
            : this.client.getIdealNode(
                this.endpoint?.split(".").shift()?.replace(/[0-9]/g, "")
              );
        if (!node) return;
        await node.send({
          op: "voiceUpdate",
          guildId: state.guild_id,
          sessionId: this.sessionId,
          event: { token: this.token, endpoint: this.endpoint },
        });
        if (node.id !== player.node_id)
          await this.client.prisma.player
            .update({
              where: { id: player.id },
              data: { node_id: node.id },
            })
            .catch(() => null);
      })
      .on("voiceConnectionReady", () => {
        this.client.logger.debug(
          `Voice connection ready for player ${this.guildId}`,
          { tags: ["Players"] }
        );
        this.state = ConnectionStates.CONNECTED;
      });
  }

  get sessionId() {
    return this.client.shards.get(this.client.guildShardMap[this.guildId])
      ?.sessionID;
  }

  public connect({
    player,
    type = ConnectOptionsTypes.COMPLETE,
    confirm = false,
  }: ConnectOptions): Promise<Node> {
    if (this.state === ConnectionStates.CONNECTING)
      return Promise.reject(new Error("Already connecting."));
    if (this.state === ConnectionStates.DISCONNECTING)
      return Promise.reject(new Error("Can't connect while disconnecting."));
    if (this.state === ConnectionStates.RECONNECTING)
      return Promise.reject(new Error("Can't connect while reconnecting."));
    const shardId =
      (parseInt(this.guildId) >> 22) %
      (this.client.options.maxShards as number);
    const shard = this.client.shards.get(shardId);
    if (!shard) return Promise.reject(new Error("Unknown shard"));
    this.state = ConnectionStates.CONNECTING;
    return new Promise(async (resolve, reject) => {
      if (
        type === ConnectOptionsTypes.COMPLETE ||
        !(this.endpoint || this.token || this.sessionId)
      ) {
        shard.sendWS(GatewayOpcodes.VoiceStateUpdate, {
          guild_id: this.guildId,
          channel_id: player.voice_channel_id,
          self_deaf: true,
          self_mute: false,
        });
        let timeout: NodeJS.Timeout | undefined;
        try {
          const controller = new AbortController();
          timeout = setTimeout(() => controller.abort(), 15000);
          const promises = [
            once(this, "voiceServer", { signal: controller.signal }),
          ];
          if (confirm)
            promises.push(
              once(this, "voiceChannelConnect", { signal: controller.signal })
            );
          let [[voiceServer]] = (await Promise.all(promises)) as [
            [VoiceServer]
          ];
          if (!voiceServer.endpoint) {
            // Discord didn't send the endpoint, wait again for the next voice server.
            voiceServer = (
              await once(this, "voiceServer", {
                signal: controller.signal,
              })
            )[0] as VoiceServer;
          }
          this.token = voiceServer.token;
          this.endpoint = voiceServer.endpoint;
          clearTimeout(timeout);
        } catch (e: unknown) {
          if (e instanceof Error && e.name.toLowerCase() === "aborterror") {
            reject(timeoutError);
            return;
          }
          clearTimeout(timeout);
          reject(e);
          return;
        }
      }
      const node =
        typeof player.node_id === "number"
          ? this.client.nodes.get(player.node_id)
          : this.client.getIdealNode(
              this.endpoint?.split(".").shift()?.replace(/[0-9]/g, "")
            );
      if (!node) {
        reject(new Error("Unknown node"));
        return;
      }
      let timeout: NodeJS.Timeout | undefined;
      try {
        await node.send({
          op: "voiceUpdate",
          guildId: this.guildId,
          sessionId: this.sessionId,
          event: { token: this.token, endpoint: this.endpoint },
        });
        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), 15_000);
        await once(this, "voiceConnectionReady", { signal: controller.signal });
        clearTimeout(timeout);
        resolve(node);
      } catch (e: unknown) {
        if (e instanceof Error && e.name.toLowerCase() === "aborterror") {
          reject(timeoutError);
          return;
        }
        reject(e);
      }
    });
  }

  disconnect({ confirm = true }: { confirm: boolean }) {
    const shardId =
      (parseInt(this.guildId) >> 22) %
      (this.client.options.maxShards as number);
    const shard = this.client.shards.get(shardId);
    if (!shard) return Promise.reject(new Error("Unknown shard"));
    this.state = ConnectionStates.DISCONNECTING;
    return new Promise(async (resolve, reject) => {
      let timeout: NodeJS.Timeout | undefined;
      try {
        shard.sendWS(GatewayOpcodes.VoiceStateUpdate, {
          guild_id: this.guildId,
          channel_id: null,
        });
        if (confirm) {
          const controller = new AbortController();
          timeout = setTimeout(() => controller.abort(), 15000);
          await once(this, "voiceChannelLeave", { signal: controller.signal });
        }
        this.state = ConnectionStates.DISCONNECTED;
        resolve(true);
      } catch (e) {
        clearTimeout(timeout);
        if (e instanceof Error && e.name.toLowerCase() === "aborterror") {
          reject(
            new TimeoutError("Connection took more than 15 to be finished.")
          );
          return;
        }
        reject(e);
      }
    });
  }
}
