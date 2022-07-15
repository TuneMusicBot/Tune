/* eslint-disable @typescript-eslint/no-non-null-asserted-optional-chain */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { GuildPermission } from "@prisma/client";
import { GuildMember, PermissionsString, Team } from "discord.js";
import { CommandRequirementsOpts } from "../../@types/commands";
import { CustomPermissions } from "../../utils/CustomPermissions";
import { CommandError } from "./CommandError";
import { CommandContext } from "./context/CommandContext";

export class CommandRequirements {
  static async handleRequirements(
    context: CommandContext,
    opts: CommandRequirementsOpts
  ) {
    if (
      opts.devOnly &&
      !(context.client.application?.owner as Team).members.has(context.user.id)
    ) {
      throw new CommandError(context.t("errors:devOnly"), false, context);
    }

    const currentChannel =
      context.member?.voice && context.member?.voice.channelId;
    if (opts.voiceChanneOnly && !currentChannel) {
      throw new CommandError(
        context.t("errors:voiceChannelOnly"),
        false,
        context
      );
    }
    const player = await context.client.prisma.player
      .findFirst({
        where: {
          guild_id: context.guild?.id,
          platform: "DISCORD",
          bot_id: context.client.user?.id,
        },
      })
      .catch(() => null);
    if (
      opts.sameVoiceChannelOnly &&
      (!currentChannel ||
        (player && player.voice_channel_id !== currentChannel))
    ) {
      throw new CommandError(
        context.t("errors:sameVoiceChannelOnly"),
        false,
        context
      );
    }

    if (opts.musicPlayerOnly && !player) {
      throw new CommandError(
        context.t("errors:musicPlayerOnly"),
        false,
        context
      );
    }

    if (
      opts.musicPlayerPlayingOnly &&
      (!player || player?.state !== "PLAYING")
    ) {
      throw new CommandError(
        context.t("errors:musicPlayerPlayingOnly"),
        false,
        context
      );
    }

    if (opts.botPermissions && opts.botPermissions.length > 0) {
      const missingPerms: PermissionsString[] = [];
      const me = context.guild?.members.me as GuildMember;
      opts.botPermissions.map((perm) =>
        !me.permissions.has(perm, true) ? missingPerms.push(perm) : null
      );
      if (missingPerms.length > 0) {
        throw new CommandError(
          context.t(
            `errors:botMissingPermission${missingPerms.length > 1 ? "s" : ""}`,
            {
              permission: missingPerms
                .map((perm) =>
                  context.t(`discord:permissions.${perm}`).toLowerCase()
                )
                .join(", "),
            }
          ),
          false,
          context
        );
      }
    }

    if (opts.permissions && opts.permissions.length > 0) {
      const missingPerms: PermissionsString[] = [];
      const me = context.guild?.members.me as GuildMember;
      opts.permissions.map((perm) =>
        !me.permissions.has(perm, true) ? missingPerms.push(perm) : null
      );
      if (missingPerms.length > 0) {
        throw new CommandError(
          context.t(
            `errors:missingPermission${missingPerms.length > 1 ? "s" : ""}`,
            {
              permission: missingPerms
                .map((perm) =>
                  context.t(`discord:permissions.${perm}`).toLowerCase()
                )
                .join(", "),
            }
          ),
          false,
          context
        );
      }
    }

    if (opts.customPermissions && context.guild) {
      // eslint-disable-next-line no-inner-declarations
      async function check() {
        const permissions =
          ((await context.client.prisma.guildPermission.findMany({
            where: { guild_id: context.guild!.id },
          })) || [
            {
              id: "everyone",
              guild_id: context.guild!.id,
              allow: 76,
              deny: 50,
            },
          ]) as GuildPermission[];
        const everyonePerm = permissions.find((p) => p.id === "everyone");
        const deny = new CustomPermissions(everyonePerm?.deny ?? 0);
        const perms = permissions.filter(
          (p) =>
            p.id === context.user.id || context.member?.roles.cache.has(p.id)
        );
        if (perms.length > 0) {
          perms.map((perm) => deny.add(perm.deny));
        }
        if (!context.member?.permissions.has("Administrator")) {
          const missingPermissions: string[] = [];
          opts.customPermissions!.map((perm) =>
            deny.has(perm) ? missingPermissions.push(perm) : null
          );
          if (missingPermissions.length > 0)
            throw new CommandError(
              context.t(
                `errors:missingPermission${
                  missingPermissions.length > 1 ? "s" : ""
                }`,
                {
                  permission: missingPermissions
                    .map((perm) =>
                      context.t(`commons:permissions.${perm}`).toLowerCase()
                    )
                    .join(", "),
                }
              ),
              false,
              context
            );
        }
      }

      if (opts.checkVoiceMembers) {
        const members = context.member?.voice.channel?.members.filter(
          (m) => !m.user.bot
        ).size;
        if (typeof members === "number" && members > 1) await check();
      } else {
        await check();
      }
    }
  }
}
