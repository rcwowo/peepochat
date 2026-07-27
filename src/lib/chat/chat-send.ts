import {
  ChatRateLimiter,
  type ChatRateLimitResult,
} from "@/lib/chat/chat-rate-limiter"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"

export type ChatSenderPrivileges = {
  isBroadcaster: boolean
  isModerator: boolean
  isVip: boolean
}

export type ChatSendFailureReason =
  "empty" | "not_connected" | "too_fast" | "too_many" | "blocked"

export type ChatSendResult =
  { ok: true } | { ok: false; reason: ChatSendFailureReason; message?: string }

export type {
  TwitchChannelSendBlock,
  SendOutcomeEvent,
} from "@/lib/chat/chat-send-notice"

export const CHAT_RATE_LIMIT_MESSAGES = {
  too_fast: "You're sending messages too fast.",
  too_many: "You're sending too many messages, wait for a while and try again.",
} as const

export function isPrivilegedChannelSender(
  channelLogin: string,
  accountLogin: string | null | undefined,
  selfState: ChatSenderPrivileges | null
): boolean {
  const normalizedChannel = normalizeChannelLogin(channelLogin)
  if (
    accountLogin &&
    normalizedChannel === normalizeChannelLogin(accountLogin)
  ) {
    return true
  }

  return Boolean(
    selfState?.isBroadcaster || selfState?.isModerator || selfState?.isVip
  )
}

export function mapRateLimitResult(
  result: ChatRateLimitResult
): ChatSendFailureReason | null {
  switch (result) {
    case "ok":
      return null
    case "too_fast":
      return "too_fast"
    case "too_many":
      return "too_many"
  }
}

export function createChatRateLimiter() {
  return new ChatRateLimiter()
}
