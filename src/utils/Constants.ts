import { ImageFormat } from "eris";

const COLORS: Record<string, number> = {
  MAIN: 14596286,
  ERROR: 14691136,
};

const CUSTOM_TYPES: Record<
  string,
  {
    username: string;
    discriminator: string;
    dynamicAvatarURL(format?: ImageFormat, size?: number): string;
  }
> = {
  AUTOPLAY: {
    username: "commons:music.autoplay",
    discriminator: "-1",
    dynamicAvatarURL: () => process.env.DEFAULT_ARTWORK_URL,
  },
  YOUTUBE: {
    username: "commons:music.ytNotify",
    discriminator: "-1",
    dynamicAvatarURL: () =>
      "https://cdn.discordapp.com/emojis/797193117895229452.png",
  },
  TWITCH: {
    username: "commons:music.twNotify",
    discriminator: "-1",
    dynamicAvatarURL: () =>
      "https://cdn.discordapp.com/emojis/801575077215862834.png",
  },
};

const ICONS: Record<string, string> = {
  DISCORD: "https://cdn.discordapp.com/emojis/797191993624887306.png",
};

const EMOJIS: Record<string, string> = {
  APPLE_MUSIC: "<:applemusic:861720016172089385>",
  BANDCAMP: "<:bandcamp:859196023288365076>",
  BANDLAB: "<:bandlab:859195119983263744>",
  JAMENDO: "<:jamendo:859195451969241128>",
  VIMEO: "<:vimeo:859194988104646736>",
  MIXCLOUD: "<:mixcloud:859194729622011915>",
  CLYP: "<:clyp:859195264379519027>",
  SOUNDCLOUD: "<:SoundCloud:801549047218438164>",
  YOUTUBE: "<:YouTube:797193117895229452>",
  TWITCH: "<:Twitch:801575077215862834>",
  SPOTIFY: "<:spotify:946562130356887582>",
  NAPSTER: "<:napster:946562341993078884>",
  DEEZER: "<:deezer:946562612697661550>",
  TIDAL: "<:tidal:946563065590210661>",
  YANDEX_MUSIC: "<:yandexmusic:946563323837698068>",
  ODYSEE: "<:odysee:946563638246932500>",
  REDDIT: "<:reddit:946563809542303754>",
  STREAMABLE: "<:streamable:946564109288235040>",
  TIKTOK: "<:tiktok:946564979593740288>",
  TUNEIN: "<:tunein:946565259286683689>",
  TWITTER: "<:twitter:946565460579721296>",
  IHEART: "<:iheart:946566111686721546>",
  BILIBILI: "<:bilibili:946566428306309150>",
  "GETYARN.IO": "<:getyarn:946568379236507730>",
  YOUTUBE_MUSIC: "<:ytmusic:946932890447540264>",
  NEWGROUNDS: "<:newgrounds:946940477398196324>",
  DISCORD: "<:Discord:797191993624887306>",
  AUDIOMACK: "<:audiomack:878465693325086740>",
  HTTP: "🎵",
  LOCAL: "🎵",
  ARROW_LEFT: "<:arrowLeft:890751041946140704>",
  ARROW_RIGHT: "<:arrowRight:890751042197782548>",
  BACK: "<:backemote:868294703437738044>",
  SKIP: "<:skip:868294703366410240>",
  PAUSE: "<:pausado:883320244783968337>",
  PLAY: "<:tocando:883320824323518578>",
  GROOVY_BOT: "<:groovy:961371007124402186>",
  TUNE: "<:tune:823679346925240361>",
  TUNE_2: "",
  TUNE_3: "<:tune_3:962361256134729728>",
  TUNE_4: "<:tune_4:962361256608661564>",
  TUNE_5: "<:tune_5:962361256197623818>",
  TUNE_6: "<:tune_6:962361255912423474>",
  TUNE_DART: "<:tune_dart:962361257107783790>",
  TUNE_TESTER: "<:tune_tester:823679347809320960>",
  TUNE_PATREON: "",
  TUNE_CHAN: "<:tune_chan:987761726063800421>",
  REPLAY: "<:replay:883324714406281266>",
  CHANNEL: "<:channel:961767278221877260>",
  STAGE: "<:stage:886097390627610624>",
  STAGE_ACTIVE: "<:stageActive:886644593314103367>",
  VOICE: "<:voice:883381698224590858>",
  LASTFM: "<:lastfm:991046240940720188>",
};

export { EMOJIS, COLORS, CUSTOM_TYPES, ICONS };
