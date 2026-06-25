import { devLoggedFetch } from "@/lib/dev-logger"
import type { EmoteCatalogEntry } from "@/lib/chat/chat-emotes"
import {
  buildInitialEmoteCardDetails,
  getTwitchChannelUrl,
  type EmoteCardDetails,
  type EmoteCardTarget,
} from "@/lib/chat/emote-card"
import { fetchTwitchEmoteFromIvr } from "@/lib/twitch/twitch-emote-ivr"

type BetterTtvEmoteDetails = {
  code?: string
  user?: {
    displayName?: string
    name?: string
    providerId?: string
  }
}

type SevenTvEmoteDetails = {
  name?: string
  data?: {
    name?: string
    alias?: string[]
    owner?: {
      display_name?: string
      username?: string
    }
  }
}

export async function loadEmoteCardDetails(options: {
  target: EmoteCardTarget
  catalogEntry: EmoteCatalogEntry | null
}): Promise<EmoteCardDetails> {
  const { target, catalogEntry } = options

  if (target.provider === "twitch") {
    return loadTwitchEmoteCardDetails(target, catalogEntry)
  }

  let details = buildInitialEmoteCardDetails(target, catalogEntry)
  details = await enrichThirdPartyEmoteDetails(details, target)
  return details
}

async function loadTwitchEmoteCardDetails(
  target: EmoteCardTarget,
  catalogEntry: EmoteCatalogEntry | null
): Promise<EmoteCardDetails> {
  const fallback = buildInitialEmoteCardDetails(target, catalogEntry)
  const ivr = await fetchTwitchEmoteFromIvr(target.id)

  if (!ivr) {
    return fallback
  }

  const artistLogin = ivr.artist?.login?.trim() || null
  const artist = ivr.artist?.displayName?.trim() || artistLogin || null
  const channelLogin = ivr.channelLogin?.trim() || null

  return {
    ...fallback,
    name: ivr.emoteCode?.trim() || fallback.name,
    artist,
    artistLogin,
    channelUrl: channelLogin ? getTwitchChannelUrl(channelLogin) : null,
  }
}

async function enrichThirdPartyEmoteDetails(
  details: EmoteCardDetails,
  target: EmoteCardTarget
): Promise<EmoteCardDetails> {
  // Catalog entries from 7TV/BTTV room fetches already include uploader and aliases.
  if (details.uploader && details.aliases.length > 0) {
    return details
  }

  switch (target.provider) {
    case "bttv":
      return enrichBetterTtvDetails(details, target.id)
    case "7tv":
      return enrichSevenTvDetails(details, target.id)
    default:
      return details
  }
}

async function enrichBetterTtvDetails(
  details: EmoteCardDetails,
  emoteId: string
): Promise<EmoteCardDetails> {
  const response = await devLoggedFetch(
    `https://api.betterttv.net/3/emotes/${encodeURIComponent(emoteId)}`
  )
  if (!response.ok) {
    return details
  }

  const payload = (await response.json()) as BetterTtvEmoteDetails
  const user = payload.user
  const login = user?.name?.trim() || user?.displayName?.trim() || null

  return {
    ...details,
    name: payload.code?.trim() || details.name,
    uploader: details.uploader || user?.displayName?.trim() || login,
    uploaderLogin: details.uploaderLogin || login,
  }
}

async function enrichSevenTvDetails(
  details: EmoteCardDetails,
  emoteId: string
): Promise<EmoteCardDetails> {
  const response = await devLoggedFetch(
    `https://7tv.io/v3/emotes/${encodeURIComponent(emoteId)}`
  )
  if (!response.ok) {
    return details
  }

  const payload = (await response.json()) as SevenTvEmoteDetails
  const owner = payload.data?.owner
  const canonicalName =
    payload.data?.name?.trim() || payload.name?.trim() || details.name
  const aliases = (payload.data?.alias ?? details.aliases).filter(
    (alias) => alias.toLowerCase() !== canonicalName.toLowerCase()
  )

  return {
    ...details,
    name: canonicalName,
    aliases,
    uploader:
      details.uploader ||
      owner?.display_name?.trim() ||
      owner?.username?.trim() ||
      null,
    uploaderLogin: details.uploaderLogin || owner?.username?.trim() || null,
  }
}
