import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import type { TwitchSystemMessage } from "@/lib/twitch/twitch-chat"

export const COMPOSER_NOTICE_AUTO_DISMISS_MS = 5000

export type TwitchChannelSendBlock = {
  kind: "ban" | "timeout"
  message: string
  expiresAt: number | null
}

const PERMANENT_BAN_MSG_IDS = new Set(["msg_banned"])
const TIMEOUT_MSG_IDS = new Set(["msg_timedout"])

export type SendOutcomeEvent =
  | {
      type: "echo"
      message: import("@/lib/twitch/twitch-chat").TwitchChatMessage
    }
  | { type: "rejected"; channel: string; message: string }
  | {
      type: "notice"
      channel: string
      message: string
      id: string
      discardPending?: boolean
    }
  | {
      type: "dismiss-notice"
      channel: string
      id: string
    }

export function isAutomodHoldNoticeText(text: string): boolean {
  const lower = text.toLowerCase()
  return lower.includes("automod") || lower.includes("auto mod")
}

export function isTimeoutComposerNoticeText(text: string): boolean {
  const lower = text.toLowerCase()
  return lower.includes("timed out") || lower.includes("timeout")
}

export function timeoutComposerNoticeId(channelLogin: string): string | null {
  const channel = normalizeChannelLogin(channelLogin)
  if (!channel) return null
  return `${channel}:timeout`
}

export function formatSelfTimeoutNoticeMessage(
  durationSeconds: number
): string {
  return `You are timed out for ${Math.floor(durationSeconds)} seconds.`
}

export function formatSelfBanNoticeMessage(): string {
  return "You are permanently banned from talking in this channel."
}

export type SelfModerationRestriction =
  | { kind: "timeout"; durationSeconds: number }
  | { kind: "ban" }
  | { kind: "clear" }

export function parseTimeoutRemainingSeconds(text: string): number | null {
  const match =
    text.match(/timed out for (\d+) more seconds/i) ??
    text.match(/timed out for (\d+) seconds/i)
  if (!match) return null
  const seconds = Number.parseInt(match[1]!, 10)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

function resolveTimeoutExpiresAt(message: TwitchSystemMessage): number | null {
  const durationSec =
    message.banDurationSeconds && message.banDurationSeconds > 0
      ? message.banDurationSeconds
      : parseTimeoutRemainingSeconds(message.text)
  return durationSec && durationSec > 0 ? Date.now() + durationSec * 1000 : null
}

export function classifySendNotice(
  message: TwitchSystemMessage
): TwitchChannelSendBlock | null {
  if (message.event !== "notice" || !message.channel) {
    return null
  }

  const msgId = message.msgId ?? ""

  if (PERMANENT_BAN_MSG_IDS.has(msgId)) {
    return {
      kind: "ban",
      message: message.text,
      expiresAt: null,
    }
  }

  if (TIMEOUT_MSG_IDS.has(msgId)) {
    return {
      kind: "timeout",
      message: message.text,
      expiresAt: resolveTimeoutExpiresAt(message),
    }
  }

  const lower = message.text.toLowerCase()
  if (lower.includes("permanently banned")) {
    return {
      kind: "ban",
      message: message.text,
      expiresAt: null,
    }
  }

  if (lower.includes("timed out") || lower.includes("timeout")) {
    return {
      kind: "timeout",
      message: message.text,
      expiresAt: resolveTimeoutExpiresAt(message),
    }
  }

  return null
}

export function isPersistentSendBlockText(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    lower.includes("permanently banned") ||
    lower.includes("banned from talking") ||
    lower.includes("timed out") ||
    lower.includes("timeout")
  )
}

export function isSendRejectionNotice(message: TwitchSystemMessage): boolean {
  if (message.event !== "notice" || !message.channel) {
    return false
  }

  if (classifySendNotice(message)) {
    return true
  }

  const msgId = message.msgId ?? ""
  return msgId.startsWith("msg_")
}
