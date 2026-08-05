import type { TwitchSystemMessage } from "@/lib/twitch/twitch-chat"

export const COMPOSER_NOTICE_AUTO_DISMISS_MS = 5000

export type TwitchChannelSendBlock = {
  kind: "ban" | "timeout"
  message: string
  /** Unix ms when a timeout lifts; null for permanent bans. */
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
    const durationSec = message.banDurationSeconds
    return {
      kind: "timeout",
      message: message.text,
      expiresAt:
        durationSec && durationSec > 0 ? Date.now() + durationSec * 1000 : null,
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
    const durationSec = message.banDurationSeconds
    return {
      kind: "timeout",
      message: message.text,
      expiresAt:
        durationSec && durationSec > 0 ? Date.now() + durationSec * 1000 : null,
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
