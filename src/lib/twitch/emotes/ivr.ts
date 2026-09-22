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

type IvrCacheEntry = {
  request: Promise<IvrTwitchEmote | null>
  settledAt: number
  found: boolean
}

const NEGATIVE_TTL_MS = 60 * 1000

const emoteCache = new Map<string, IvrCacheEntry>()

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
    const isStaleFailure =
      !cached.found && Date.now() - cached.settledAt >= NEGATIVE_TTL_MS
    if (!isStaleFailure) {
      return cached.request
    }
    emoteCache.delete(normalizedId)
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

  const entry: IvrCacheEntry = {
    request,
    settledAt: Date.now(),
    found: false,
  }
  void request.then((value) => {
    entry.found = value !== null
    entry.settledAt = Date.now()
  })

  emoteCache.set(normalizedId, entry)
  return request
}
