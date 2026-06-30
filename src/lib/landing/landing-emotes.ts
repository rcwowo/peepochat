export type LandingEmoteProvider = "bttv" | "ffz" | "7tv"

export type LandingEmote = {
  name: string
  url: string
  provider: LandingEmoteProvider
}

const EMOTE_BASE = "/landing/emotes"

export const LANDING_EMOTES = {
  KEKW: {
    name: "KEKW",
    url: `${EMOTE_BASE}/KEKW.webp`,
    provider: "bttv",
  },
  buh: {
    name: "buh",
    url: `${EMOTE_BASE}/buh.webp`,
    provider: "7tv",
  },
  MikuStare: {
    name: "MikuStare",
    url: `${EMOTE_BASE}/MikuStare.webp`,
    provider: "7tv",
  },
  jakeS: {
    name: "jakeS",
    url: `${EMOTE_BASE}/jakeS.webp`,
    provider: "ffz",
  },
  Sadge: {
    name: "Sadge",
    url: `${EMOTE_BASE}/Sadge.webp`,
    provider: "bttv",
  },
  catJAM: {
    name: "catJAM",
    url: `${EMOTE_BASE}/catJAM.webp`,
    provider: "bttv",
  },
  Jackass: {
    name: "Jackass",
    url: `${EMOTE_BASE}/Jackass.webp`,
    provider: "bttv",
  },
  widepeepoHappy: {
    name: "widepeepoHappy",
    url: `${EMOTE_BASE}/widepeepoHappy.webp`,
    provider: "ffz",
  },
  om: {
    name: "om",
    url: `${EMOTE_BASE}/om.webp`,
    provider: "ffz",
  },
  ewphop: {
    name: "ewphop",
    url: `${EMOTE_BASE}/ewphop.webp`,
    provider: "7tv",
  },
} as const satisfies Record<string, LandingEmote>

export type LandingEmoteKey = keyof typeof LANDING_EMOTES

export const LANDING_EMOTE_PROVIDERS = [
  {
    id: "twitch" as const,
    name: "Twitch",
    shortName: "Twitch",
    iconSrc: "/icons/twitch.svg",
    accent: "#9146ff",
    emoteKeys: [] as const satisfies readonly LandingEmoteKey[],
    tagline: "Native global, subscriber, and channel emotes.",
  },
  {
    id: "bttv" as const,
    name: "BetterTTV",
    shortName: "BTTV",
    iconSrc: "/icons/bttv.svg",
    accent: "#e91916",
    emoteKeys: [
      "KEKW",
      "Sadge",
      "catJAM",
      "Jackass",
    ] as const satisfies readonly LandingEmoteKey[],
    tagline: "Global & channel emotes from the OG extension.",
  },
  {
    id: "ffz" as const,
    name: "FrankerFaceZ",
    shortName: "FFZ",
    iconSrc: "/icons/ffz.svg",
    accent: "#9b59b6",
    emoteKeys: [
      "om",
      "jakeS",
      "widepeepoHappy",
    ] as const satisfies readonly LandingEmoteKey[],
    tagline: "Animated room emotes and custom sets.",
  },
  {
    id: "7tv" as const,
    name: "7TV",
    shortName: "7TV",
    iconSrc: "/icons/7tv.svg",
    accent: "#00b5ad",
    emoteKeys: [
      "buh",
      "MikuStare",
      "ewphop",
    ] as const satisfies readonly LandingEmoteKey[],
    tagline: "The fastest-growing emote library on Twitch.",
  },
] as const
