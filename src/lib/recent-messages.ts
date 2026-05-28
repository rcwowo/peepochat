import { normalizeChannelLogin } from "@/lib/twitch-channel"
import {
  EMPTY_SYSTEM_MESSAGE_META,
  parseIrcPrivmsg,
  type TwitchChatMessage,
  type TwitchSystemMessage,
} from "@/lib/twitch-chat"

const RECENT_MESSAGES_BASE =
  "https://recent-messages.robotty.de/api/v2/recent-messages"

export const RECENT_MESSAGES_DEFAULT_LIMIT = 100
export const RECENT_MESSAGES_CONCURRENCY = 3

export const RECENT_MESSAGES_UNAVAILABLE_TEXT =
  "Recent chat history isn't available for this channel."
export const RECENT_MESSAGES_ERROR_TEXT =
  "Couldn't load recent messages right now."

type RecentMessagesResponse = {
  messages?: string[]
  error?: string | null
  error_code?: string | null
}

export type RecentMessagesFetchOutcome =
  | { status: "success"; messages: TwitchChatMessage[] }
  | { status: "unavailable" }
  | { status: "error"; message: string }

function isDeletedHistoricalLine(raw: string): boolean {
  if (!raw.startsWith("@")) return false

  const tagSectionEnd = raw.indexOf(" ")
  if (tagSectionEnd === -1) return false

  const tags = raw.slice(1, tagSectionEnd)
  return /(?:^|;)rm-deleted=1(?:;|$)/.test(tags)
}

function isPrivmsgLine(raw: string): boolean {
  return raw.includes(" PRIVMSG ")
}

export function createRecentMessagesStatusMessage(
  channelLogin: string,
  text: string
): TwitchSystemMessage {
  const channel = normalizeChannelLogin(channelLogin)

  return {
    id: `${channel}:recent-messages:${Date.now()}`,
    channel,
    roomId: null,
    text,
    headline: text,
    details: null,
    receivedAt: new Date().toISOString(),
    event: "status",
    level: "info",
    accentColor: null,
    ...EMPTY_SYSTEM_MESSAGE_META,
  }
}

/**
 * Fetch recent IRC lines for a channel from recent-messages.robotty.de.
 * @see https://recent-messages.robotty.de/api
 */
export async function fetchRecentMessages(
  channelLogin: string,
  limit = RECENT_MESSAGES_DEFAULT_LIMIT
): Promise<RecentMessagesFetchOutcome> {
  const login = normalizeChannelLogin(channelLogin)
  if (!login) {
    return { status: "success", messages: [] }
  }

  const url = new URL(`${RECENT_MESSAGES_BASE}/${encodeURIComponent(login)}`)
  url.searchParams.set("limit", String(limit))
  url.searchParams.set("hide_moderated_messages", "true")

  try {
    const response = await fetch(url)

    if (response.status === 403 || response.status === 400) {
      return { status: "unavailable" }
    }

    if (!response.ok) {
      return {
        status: "error",
        message: `Recent messages request failed (${response.status})`,
      }
    }

    const payload = (await response.json()) as RecentMessagesResponse

    if (payload.error) {
      return { status: "unavailable" }
    }

    return {
      status: "success",
      messages: parseRecentChatMessages(payload.messages ?? []),
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Recent messages request failed"
    return { status: "error", message }
  }
}

/** Parse API IRC lines into chat messages (PRIVMSG only). */
export function parseRecentChatMessages(lines: string[]): TwitchChatMessage[] {
  const messages: TwitchChatMessage[] = []

  for (const line of lines) {
    if (!isPrivmsgLine(line) || isDeletedHistoricalLine(line)) {
      continue
    }

    const message = parseIrcPrivmsg(line)
    if (message) {
      messages.push(message)
    }
  }

  return messages
}
