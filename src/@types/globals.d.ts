declare global {
  const CUSTOM_COLORS: Record<string, number> = {};
  namespace NodeJS {
    interface ProcessEnv {
      readonly NODES: string;
      readonly DEFAULT_PREFIX: string;
      readonly DEFAULT_ARTWORK_URL: string;
      readonly LASTFM_APIKEY: string;
      readonly LASTFM_SECRET: string;
      readonly SPOTIFY_CLIENT_ID: string;
      readonly SPOTIFY_CLIENT_SECRET: string;
      readonly YOUTUBE_OAUTH_ID: string;
      readonly YOUTUBE_OAUTH_SECRET: string;
      readonly VAGALUME_KEY: string;
      readonly MUSIXMATCH_KEY: string;
      readonly SENTRY_DSN: string;
      readonly REDIS_URL: string;
      readonly DISCORD_CLIENT_ID: string;
      readonly DISCORD_TOKEN: string;
    }
  }
}

export = {};
