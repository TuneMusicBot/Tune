/* eslint-disable no-fallthrough */
import { ChannelType } from "discord-api-types/v10";
import { GuildChannel, TextableChannel } from "eris";
import { URL } from "url";
import { Tune } from "../Tune";

export class Utils {
  public static capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  public static clean(str: string): string {
    const space = String.fromCharCode(8203);
    return str.replace(/`/g, `\`${space}`).replace(/@/g, `@${space}`);
  }

  public static limit(str: string, limit: number, extra?: string): string {
    if (str.length < limit && str.length + 3 < limit && extra)
      // eslint-disable-next-line no-param-reassign
      str += ` - ${extra}`;
    return str.length > limit ? `${str.substring(0, limit)}...` : str;
  }

  public static isURL(str: string): boolean {
    try {
      // eslint-disable-next-line no-new
      new URL(str);
      return true;
    } catch (e) {
      return false;
    }
  }

  public static reverseObject<
    T extends string | number,
    K extends string | number
  >(input: Record<T, K>): Record<K, T> {
    const entries: [string, K][] = Object.entries(input);
    const obj: Record<K, T> = Object.create(null);
    // @ts-ignore
    for (const [key, value] of entries) obj[value] = key;
    return obj as Record<K, T>;
  }

  // Forked from Discord.JS
  public static cleanContent(
    content: string,
    channel: TextableChannel,
    client: Tune
  ) {
    return content.replaceAll(/<(@[!&]?|#)(\d{17,19})>/g, (match, type, id) => {
      switch (type) {
        case "@":
        case "@!": {
          if (channel instanceof GuildChannel) {
            const member = channel.guild.members.get(id);
            if (member) return `@${member.nick ?? member.username}`;
          }
          const user = client.users.get(id);
          return user ? `@${user.username}` : match;
        }
        case "@&": {
          if (channel.type === ChannelType.DM) return match;
        }
        case "#": {
          const guild = client.guilds.get(client.channelGuildMap[id]);
          const ch = guild?.channels.get(id);
          return ch ? `#${ch.name}` : match;
        }
        default: {
          return match;
        }
      }
    });
  }
}
