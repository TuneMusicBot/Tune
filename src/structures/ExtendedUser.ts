/* eslint-disable no-underscore-dangle */
import {
  APIConnection,
  APIUser,
  RESTPostOAuth2AccessTokenResult,
  User,
  UserFlagsBitField,
  UserPremiumType,
  UserResolvable,
} from "discord.js";
import { User as UserAccount, UserConnection } from "@prisma/client";
import { Tune } from "../Tune";
import { UserConnection as DiscordConnection } from "./UserConnection";
import { Utils } from "../utils/Utils";

export class ExtendedUser extends User {
  public static toExtendedUser(
    user: UserResolvable | ExtendedUser | User,
    client: Tune
  ): ExtendedUser {
    if (user instanceof ExtendedUser) {
      if (!client.users.cache.has(user.id))
        client.users.cache.set(user.id, user);
      return user;
    }
    if (user instanceof User) {
      if (client.users.cache.has(user.id)) client.users.cache.delete(user.id);
      const extendedUser = new ExtendedUser(
        client,
        Utils.userToAPI(user) as any
      );
      client.users.cache.set(user.id, extendedUser);
      return extendedUser;
    }

    if (client.users.cache.has(user.toString())) {
      // eslint-disable-next-line no-param-reassign
      user = client.users.cache.get(user.toString()) as User;
      client.users.cache.delete(user.toString());
      const extendedUser = new ExtendedUser(
        client,
        Utils.userToAPI(user) as any
      );
      client.users.cache.set(user.id, extendedUser);
      return extendedUser;
    }
    const extendedUser = new ExtendedUser(client, {
      id: user.toString(),
    } as any);
    client.users.cache.set(extendedUser.id, extendedUser);
    return extendedUser;
  }

  public email?: string;
  public locale?: string;
  public verified?: boolean;
  public premiumType?: UserPremiumType;
  public mfaEnabled?: boolean;
  public account?: UserAccount;

  public accessToken?: string;
  public refreshToken?: string;
  public expiresAt?: Date;
  public scopes?: string[];

  get language() {
    return this.account?.language ?? this.locale;
  }

  // eslint-disable-next-line no-underscore-dangle
  _patch(data: APIUser) {
    if (typeof data.mfa_enabled === "boolean") {
      this.mfaEnabled = data.mfa_enabled;
    } else {
      this.mfaEnabled ??= undefined;
    }

    if (typeof data.email === "string") {
      this.email = data.email;
    } else {
      this.email ??= undefined;
    }

    if (typeof data.locale === "string") {
      this.locale = data.locale;
    } else {
      this.locale ??= undefined;
    }

    if (typeof data.verified === "boolean") {
      this.verified = data.verified;
    } else {
      this.verified ??= undefined;
    }

    if (typeof data.premium_type === "number") {
      this.premiumType =
        // eslint-disable-next-line no-nested-ternary
        data.premium_type === 0
          ? UserPremiumType.None
          : data.premium_type === 1
          ? UserPremiumType.NitroClassic
          : UserPremiumType.Nitro;
    } else {
      this.premiumType ??= undefined;
    }

    if (typeof data.flags === "number") {
      this.flags = new UserFlagsBitField(data.flags);
    }

    // @ts-ignore
    // eslint-disable-next-line no-underscore-dangle
    super._patch(data);
  }

  patchAuth(
    oauth2: RESTPostOAuth2AccessTokenResult & {
      expires_at?: Date;
      expires_in?: number;
    }
  ) {
    if (!oauth2.scope.includes("identify")) return;
    this.accessToken = oauth2.access_token;
    this.refreshToken = oauth2.refresh_token;
    this.scopes = oauth2.scope.split(" ");
    this.expiresAt = oauth2.expires_at
      ? oauth2.expires_at
      : new Date(Date.now() + oauth2.expires_in * 1000);
  }

  fetch(): Promise<ExtendedUser> {
    if (this.accessToken && this.scopes?.includes("identify")) {
      return (this.client as Tune).oauth2
        .setToken(this.accessToken)
        .get("/users/@me", { auth: true, authPrefix: "Bearer" })
        .then((user) => {
          this._patch(user as APIUser);
          return this;
        });
    }
    return this.client.rest
      .get(`/users/${this.id}`, { auth: true, authPrefix: "Bot" })
      .then((user) => {
        this._patch(user as APIUser);
        return this;
      });
  }

  async fetchAccount(
    { create, cache }: { create: boolean; cache: boolean } = {
      cache: true,
      create: true,
    }
  ): Promise<UserAccount> {
    if (this.bot) throw new Error("Invalid on bot");
    if (this.account && cache) return this.account;
    const accountId = await (this.client as Tune).prisma.userConnection
      .findUnique({ where: { id: this.id } })
      .then((u) => u?.user_id)
      .catch(() => null);
    if (!accountId && !create) throw new Error("User doesn't has an account.");
    if (!accountId) {
      const account = await (this.client as Tune).prisma.user
        .create({ data: { language: this.locale, logged_at: new Date() } })
        .catch(() => null);
      if (!account) throw new Error("Failed to create user account.");
      if (cache) this.setAccount(account);
      await (this.client as Tune).prisma.userConnection.create({
        data: {
          user_id: account.id,
          id: this.id,
          platform: "DISCORD",
          access_token: this.accessToken ?? "",
          scopes: this.scopes?.join(" "),
          dm_channel_id: this.dmChannel?.id,
          data: this.toApiJson() as object,
          logged_at: new Date(),
          config: {},
        },
      });
      return account;
    }
    const account = await (this.client as Tune).prisma.user
      .findUnique({ where: { id: accountId } })
      .catch(() => null);
    if (!account) throw new Error("Failed to fetch user account.");
    if (cache) this.setAccount(account);
    return account;
  }

  fetchDiscordConnections(): Promise<DiscordConnection[]> {
    if (this.bot) throw new Error("Invalid on bot");
    if (!this.accessToken) throw new Error("User not logged.");
    if (!this.scopes?.includes("connections"))
      throw new Error('Missing "connections" scope.');
    return (this.client as Tune).oauth2
      .setToken(this.accessToken)
      .get("/users/@me/connections", { auth: true })
      .then((connections) =>
        (connections as APIConnection[]).map(
          (connection) => new DiscordConnection(connection)
        )
      );
  }

  async fetchConnections(): Promise<UserConnection[]> {
    if (this.bot) throw new Error("Invalid on bot");
    const account = await this.fetchAccount();
    const connections = await (this.client as Tune).prisma.userConnection
      .findMany({ where: { user_id: account.id } })
      .catch(() => null);
    if (!connections) throw new Error("Failed to fetch user connections.");
    return connections;
  }

  setLocale(locale: string) {
    this.locale = locale;
  }

  setAccount(account: UserAccount) {
    this.account = account;
  }

  toApiJson(): APIUser {
    return {
      id: this.id,
      username: this.username,
      discriminator: this.discriminator,
      avatar: this.avatar,
      premium_type: this.premiumType,
      public_flags: this.flags?.bitfield,
      flags: this.flags?.bitfield,
      email: this.email,
      locale: this.locale,
      system: this.system,
      bot: this.bot,
      accent_color: this.accentColor,
      banner: this.banner,
      mfa_enabled: this.mfaEnabled,
      verified: this.verified,
    };
  }
}
