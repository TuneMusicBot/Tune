import { APIUser, User } from "discord.js";
import { URL } from "url";

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

  public static userToAPI(user: User): Partial<APIUser> & { id: string } {
    return {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      system: user.system,
      bot: user.bot,
      public_flags: user.flags?.bitfield,
      banner: user.banner,
      accent_color: user.accentColor,
      email: undefined,
      flags: 0,
      locale: undefined,
      premium_type: undefined,
      mfa_enabled: undefined,
      verified: undefined,
    };
  }
}
