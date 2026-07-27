import type { TwitchBadge, TwitchEmote } from "@/lib/twitch/twitch-chat"

export function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function twitchEmoteImageUrl(emoteId: string): string {
  return `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(emoteId)}/animated/dark/1.0`
}

export function emotesFromV2Fragments(fragments: unknown): {
  text: string
  emotes: TwitchEmote[]
} {
  if (!Array.isArray(fragments)) {
    return { text: "", emotes: [] }
  }

  let text = ""
  const emotes: TwitchEmote[] = []

  for (const fragment of fragments) {
    const record = asRecord(fragment)
    if (!record) continue

    const fragmentText = asString(record.text)
    if (!fragmentText) continue

    const type = asString(record.type)
    const start = text.length
    text += fragmentText
    const end = text.length - 1

    if (type !== "emote") continue

    const emote = asRecord(record.emote)
    const emoteId = asString(emote?.id).trim()
    if (!emoteId) continue

    emotes.push({
      id: emoteId,
      code: fragmentText,
      provider: "twitch",
      imageUrl: twitchEmoteImageUrl(emoteId),
      start,
      end,
    })
  }

  return { text, emotes }
}

export function emotesFromV1Fragments(
  messageText: string,
  fragments: unknown
): TwitchEmote[] {
  const record = asRecord(fragments)
  const emoteList = Array.isArray(record?.emotes) ? record.emotes : []
  if (emoteList.length === 0 || !messageText) return []

  const emotes: TwitchEmote[] = []
  let searchFrom = 0

  for (const entry of emoteList) {
    const emote = asRecord(entry)
    if (!emote) continue
    const code = asString(emote.text)
    const emoteId = asString(emote.id).trim()
    if (!code || !emoteId) continue

    const start = messageText.indexOf(code, searchFrom)
    if (start < 0) continue
    const end = start + code.length - 1
    searchFrom = end + 1

    emotes.push({
      id: emoteId,
      code,
      provider: "twitch",
      imageUrl: twitchEmoteImageUrl(emoteId),
      start,
      end,
    })
  }

  return emotes.sort((a, b) => a.start - b.start)
}

export function parseEventSubMessageBody(event: Record<string, unknown>): {
  text: string
  emotes: TwitchEmote[]
} {
  const message = event.message
  if (typeof message === "string") {
    return {
      text: message,
      emotes: emotesFromV1Fragments(message, event.fragments),
    }
  }

  const record = asRecord(message)
  if (!record) {
    return { text: "", emotes: [] }
  }

  const fromFragments = emotesFromV2Fragments(record.fragments)
  const text = asString(record.text) || fromFragments.text
  if (fromFragments.emotes.length > 0) {
    return { text, emotes: fromFragments.emotes }
  }

  return {
    text,
    emotes: emotesFromV1Fragments(text, event.fragments),
  }
}

export function extractModerateTargetNames(
  event: Record<string, unknown>
): string[] {
  const action = asString(event.action).trim()
  if (!action) return []

  const target = asRecord(event[action])
  if (!target) return []

  const names = [target.user_login, target.user_name]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
  return [...new Set(names)]
}

export function badgesFromEventSub(value: unknown): TwitchBadge[] {
  if (!Array.isArray(value)) return []

  const badges: TwitchBadge[] = []
  for (const entry of value) {
    const record = asRecord(entry)
    if (!record) continue
    const set = asString(record.set_id).trim() || asString(record.setId).trim()
    const version =
      asString(record.id).trim() || asString(record.version).trim() || "1"
    if (!set) continue
    badges.push({ set, version })
  }
  return badges
}
