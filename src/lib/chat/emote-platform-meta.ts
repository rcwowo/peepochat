import type { TwitchEmoteProvider } from "@/lib/twitch/twitch-chat"

export type EmotePlatformMeta = {
  label: string
  iconSrc: string
}

export const EMOTE_PLATFORM_META: Record<TwitchEmoteProvider, EmotePlatformMeta> =
  {
    'twitch': { label: "Twitch", iconSrc: "/icons/twitch.svg" },
    '7tv': { label: "7TV", iconSrc: "/icons/7tv.svg" },
    'bttv': { label: "BTTV", iconSrc: "/icons/bttv.svg" },
    'ffz': { label: "FFZ", iconSrc: "/icons/ffz.svg" },
  }
