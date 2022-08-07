import { Platforms } from "@prisma/client";
import { GuildApplicationCommandPermissions } from "eris";
import { EventListener } from "../structures/EventListener";
import { Tune } from "../Tune";

export class GuildListener extends EventListener {
  constructor(client: Tune) {
    super(
      [
        "applicationCommandPermissionsUpdate",
        "guildCreate",
        "guildDelete",
        "guildMemberUpdate",
      ],
      client
    );
  }

  async onApplicationCommandPermissionsUpdate(
    data: GuildApplicationCommandPermissions
  ) {
    if (data.application_id !== this.client.application?.id) return;
    const command = this.client.commands.find((c) => c.id === data.id);
    if (!command) return;
    const guild = this.client.guilds.get(data.guild_id);
    if (!guild) return;
    const config = await this.client.prisma.guild
      .findFirst({
        where: { platform: Platforms.DISCORD, id: data.guild_id },
      })
      .catch(() => null);
    // eslint-disable-next-line no-useless-return
    if (!config?.auto_sync_commands) return;
  }
}
