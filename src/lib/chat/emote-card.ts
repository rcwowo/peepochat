import type { EmoteCatalogEntry } from "@/lib/chat/chat-emotes"
import { buildTwitchEmoteCdnUrl } from "@/lib/twitch/twitch-api"
import type { TwitchEmoteProvider } from "@/lib/twitch/twitch-chat"

export type EmoteCardTarget = {
  id: string
  code: string
  provider: TwitchEmoteProvider
  imageUrl: string
}

export type EmoteCardDetails = {
  name: string
  aliases: string[]
  uploader: string | null
  uploaderLogin: string | null
  artist: string | null
  artistLogin: string | null
  platformUrl: string
  channelUrl: string | null
}

export function emoteCardTargetKey(target: EmoteCardTarget) {
  return `${target.provider}:${target.id}`
}

export function toEmoteCardTarget(emote: {
  id: string
  code: string
  provider: TwitchEmoteProvider
  imageUrl: string
}): EmoteCardTarget {
  return {
    id: emote.id,
    code: emote.code,
    provider: emote.provider,
    imageUrl: emote.imageUrl,
  }
}

export function getTwitchEmoteBaseUrl(emoteId: string) {
  return buildTwitchEmoteCdnUrl(emoteId, "default", "dark").replace(
    /\/1\.0$/,
    ""
  )
}

export function getEmotePlatformUrl(provider: TwitchEmoteProvider, id: string) {
  switch (provider) {
    case "twitch":
      return `https://www.twitch.tv/emotes/${encodeURIComponent(id)}`
    case "bttv":
      return `https://betterttv.com/emotes/${encodeURIComponent(id)}`
    case "ffz":
      return `https://www.frankerfacez.com/emoticon/${encodeURIComponent(id)}`
    case "7tv":
      return `https://7tv.app/emotes/${encodeURIComponent(id)}`
  }
}

export function getTwitchChannelUrl(login: string) {
  const normalized = login.trim().replace(/^#/, "").toLowerCase()
  if (!normalized) {
    return null
  }
  return `https://www.twitch.tv/${encodeURIComponent(normalized)}`
}

export function getLargeEmotePreviewUrl(target: EmoteCardTarget) {
  if (target.provider === "twitch") {
    return buildTwitchEmoteCdnUrl(target.id, "default", "dark", "3.0")
  }

  if (target.provider === "7tv") {
    return target.imageUrl.replace("/1x.", "/3x.")
  }

  return target.imageUrl
}

export function lookupEmoteCatalogEntry(
  catalog: {
    byCode: Map<string, EmoteCatalogEntry>
    twitchById: Map<string, EmoteCatalogEntry>
    thirdPartyById: Map<string, EmoteCatalogEntry>
  },
  target: EmoteCardTarget
): EmoteCatalogEntry | null {
  if (target.provider === "twitch") {
    return (
      catalog.twitchById.get(target.id) ??
      catalog.byCode.get(target.code) ??
      null
    )
  }

  return catalog.thirdPartyById.get(emoteCardTargetKey(target)) ?? null
}

export function buildInitialEmoteCardDetails(
  target: EmoteCardTarget,
  entry: EmoteCatalogEntry | null = null
): EmoteCardDetails {
  return {
    name: target.code,
    aliases: normalizeAliases(entry?.aliases, target.code),
    uploader: entry?.ownerName?.trim() || null,
    uploaderLogin: entry?.ownerLogin?.trim() || null,
    artist: null,
    artistLogin: null,
    platformUrl: getEmotePlatformUrl(target.provider, target.id),
    channelUrl: null,
  }
}

function normalizeAliases(aliases: string[] | undefined, code: string) {
  if (!aliases?.length) {
    return []
  }

  const normalizedCode = code.toLowerCase()
  return [
    ...new Set(
      aliases.flatMap((alias) => {
        const trimmed = alias.trim()
        return trimmed ? [trimmed] : []
      })
    ),
  ].filter((alias) => alias.toLowerCase() !== normalizedCode)
}
