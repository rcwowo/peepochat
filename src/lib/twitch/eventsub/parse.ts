import type { TwitchBadge, TwitchEmote } from "@/lib/twitch/chat/chat"
import { buildTwitchEmoteCdnUrl } from "@/lib/twitch/auth/api"

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
  return buildTwitchEmoteCdnUrl(emoteId)
}

export type EventSubMessageBody = {
  text: string
  emotes: TwitchEmote[]
  bits: number | null
}

function cheermoteFragmentBits(cheermote: unknown): number {
  const record = asRecord(cheermote)
  const raw = record?.bits
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw
  }

  if (typeof raw === "string") {
    const parsed = Number.parseInt(raw, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }

  return 0
}

export function emotesFromV2Fragments(fragments: unknown): EventSubMessageBody {
  if (!Array.isArray(fragments)) {
    return { text: "", emotes: [], bits: null }
  }

  let text = ""
  const emotes: TwitchEmote[] = []
  let bits = 0

  for (const fragment of fragments) {
    const record = asRecord(fragment)
    if (!record) continue

    const fragmentText = asString(record.text)
    if (!fragmentText) continue

    if (asString(record.type) === "cheermote") {
      bits += cheermoteFragmentBits(record.cheermote)
      text += fragmentText
      continue
    }

    const start = text.length
    text += fragmentText
    const end = text.length - 1

    if (asString(record.type) !== "emote") continue

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

  return { text, emotes, bits: bits > 0 ? bits : null }
}

type EmoteRange = { start: number; end: number }

function isWhitespaceAt(text: string, index: number): boolean {
  return index < 0 || index >= text.length || /\s/.test(text[index]!)
}

function findFreeOccurrence(
  text: string,
  code: string,
  claimed: EmoteRange[],
  wholeTokenOnly: boolean
): number {
  let index = text.indexOf(code)
  while (index >= 0) {
    const end = index + code.length - 1
    const isFree = claimed.every(
      (range) => end < range.start || index > range.end
    )
    const isWholeToken =
      isWhitespaceAt(text, index - 1) && isWhitespaceAt(text, end + 1)
    if (isFree && (!wholeTokenOnly || isWholeToken)) {
      return index
    }
    index = text.indexOf(code, index + 1)
  }
  return -1
}

function emotesFromV1Fragments(
  messageText: string,
  fragments: unknown
): TwitchEmote[] {
  const record = asRecord(fragments)
  const emoteList = Array.isArray(record?.emotes) ? record.emotes : []
  if (emoteList.length === 0 || !messageText) return []

  const candidates: { code: string; emoteId: string }[] = []
  for (const entry of emoteList) {
    const emote = asRecord(entry)
    if (!emote) continue
    const code = asString(emote.text)
    const emoteId = asString(emote.id).trim()
    if (!code || !emoteId) continue
    candidates.push({ code, emoteId })
  }
  candidates.sort((a, b) => b.code.length - a.code.length)

  const emotes: TwitchEmote[] = []
  for (const { code, emoteId } of candidates) {
    let start = findFreeOccurrence(messageText, code, emotes, true)
    if (start < 0) {
      start = findFreeOccurrence(messageText, code, emotes, false)
    }
    if (start < 0) continue

    emotes.push({
      id: emoteId,
      code,
      provider: "twitch",
      imageUrl: twitchEmoteImageUrl(emoteId),
      start,
      end: start + code.length - 1,
    })
  }

  return emotes.sort((a, b) => a.start - b.start)
}

export function parseEventSubMessageBody(
  event: Record<string, unknown>
): EventSubMessageBody {
  const message = event.message
  if (typeof message === "string") {
    return {
      text: message,
      emotes: emotesFromV1Fragments(message, event.fragments),
      bits: null,
    }
  }

  const record = asRecord(message)
  if (!record) {
    return { text: "", emotes: [], bits: null }
  }

  const fromFragments = emotesFromV2Fragments(record.fragments)
  const text = asString(record.text) || fromFragments.text
  if (fromFragments.emotes.length > 0) {
    return { text, emotes: fromFragments.emotes, bits: fromFragments.bits }
  }

  return {
    text,
    emotes: emotesFromV1Fragments(text, event.fragments),
    bits: fromFragments.bits,
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
