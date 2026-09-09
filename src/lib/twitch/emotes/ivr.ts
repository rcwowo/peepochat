import { devLoggedFetch } from "@/lib/dev-logger"

export type IvrTwitchEmote = {
  channelName: string | null
  channelLogin: string | null
  channelID: string | null
  artist: {
    displayName: string
    login: string
    id: string
  } | null
  emoteID: string
  emoteCode: string
  emoteURL: string
  emoteSetID: string | null
  emoteAssetType: string
  emoteState: string
  emoteType: string
  emoteTier: string | null
}

const emoteCache = new Map<string, Promise<IvrTwitchEmote | null>>()

export function clearTwitchEmoteIvrCache() {
  emoteCache.clear()
}

export async function fetchTwitchEmoteFromIvr(
  emoteId: string
): Promise<IvrTwitchEmote | null> {
  const normalizedId = emoteId.trim()
  if (!normalizedId) {
    return null
  }

  const cached = emoteCache.get(normalizedId)
  if (cached) {
    return cached
  }

  const request = devLoggedFetch(
    `https://api.ivr.fi/v2/twitch/emotes/${encodeURIComponent(normalizedId)}?id=true`
  )
    .then(async (response) => {
      if (!response.ok) {
        return null
      }
      return (await response.json()) as IvrTwitchEmote
    })
    .catch(() => null)

  emoteCache.set(normalizedId, request)
  return request
}
