import type { ChannelChatter } from "@/lib/chat/chatters/store"
import type { TwitchPinnedChatMessage } from "@/lib/twitch/auth/api"
import {
  emotesFromV2Fragments,
  asRecord,
  asString,
} from "@/lib/twitch/eventsub/parse"
import type {
  TwitchBadge,
  TwitchChatMessage,
  TwitchEmote,
} from "@/lib/twitch/chat/chat"
import type { TwitchTimelineItem } from "@/lib/twitch/chat/types"

const EMPTY_FLAGS: TwitchChatMessage["flags"] = {
  isBroadcaster: false,
  isModerator: false,
  isSubscriber: false,
  isVip: false,
  isFirst: false,
  isAction: false,
}

export type ChannelPinnedMessage = {
  message: TwitchChatMessage
  pinnedByUserId: string
  pinnedByUserLogin: string
  pinnedByUserName: string
  startsAt: string
  endsAt: string | null
  updatedAt: string
  fromTimeline: boolean
}

export function findChatMessageInTimeline(
  timeline: readonly TwitchTimelineItem[],
  messageId: string
): TwitchChatMessage | null {
  if (!messageId) {
    return null
  }

  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const entry = timeline[index]
    if (entry?.kind === "chat" && entry.message.id === messageId) {
      return entry.message
    }
  }

  return null
}

export function isPinnedMessageExpired(
  pin: Pick<ChannelPinnedMessage, "endsAt">,
  now = Date.now()
): boolean {
  if (!pin.endsAt) {
    return false
  }

  const expiresAt = Date.parse(pin.endsAt)
  return Number.isFinite(expiresAt) && expiresAt <= now
}

export function pinnedMessagesEqual(
  left: ChannelPinnedMessage | null,
  right: ChannelPinnedMessage | null
): boolean {
  if (left === right) {
    return true
  }
  if (!left || !right) {
    return false
  }

  const leftMessage = left.message
  const rightMessage = right.message

  return (
    left.fromTimeline === right.fromTimeline &&
    left.endsAt === right.endsAt &&
    left.updatedAt === right.updatedAt &&
    left.pinnedByUserId === right.pinnedByUserId &&
    left.pinnedByUserLogin === right.pinnedByUserLogin &&
    left.pinnedByUserName === right.pinnedByUserName &&
    leftMessage.id === rightMessage.id &&
    leftMessage.deletedAt === rightMessage.deletedAt &&
    leftMessage.text === rightMessage.text &&
    leftMessage.color === rightMessage.color &&
    leftMessage.userName === rightMessage.userName &&
    leftMessage.displayName === rightMessage.displayName &&
    leftMessage.flags.isAction === rightMessage.flags.isAction &&
    leftMessage.flags.isBroadcaster === rightMessage.flags.isBroadcaster &&
    leftMessage.flags.isModerator === rightMessage.flags.isModerator &&
    leftMessage.flags.isSubscriber === rightMessage.flags.isSubscriber &&
    leftMessage.flags.isVip === rightMessage.flags.isVip &&
    badgesEqual(leftMessage.badges, rightMessage.badges) &&
    emotesEqual(leftMessage.emotes, rightMessage.emotes)
  )
}

function badgesEqual(left: TwitchBadge[], right: TwitchBadge[]): boolean {
  if (left === right) {
    return true
  }
  if (left.length !== right.length) {
    return false
  }
  return left.every(
    (badge, index) =>
      badge.set === right[index]?.set && badge.version === right[index]?.version
  )
}

function emotesEqual(left: TwitchEmote[], right: TwitchEmote[]): boolean {
  if (left === right) {
    return true
  }
  if (left.length !== right.length) {
    return false
  }
  return left.every((emote, index) => {
    const other = right[index]
    return (
      other !== undefined &&
      emote.id === other.id &&
      emote.provider === other.provider &&
      emote.start === other.start &&
      emote.end === other.end &&
      emote.imageUrl === other.imageUrl
    )
  })
}

export function chatMessageFromPinnedHelix({
  pin,
  channelLogin,
  roomId,
  chatter,
  color,
}: {
  pin: TwitchPinnedChatMessage
  channelLogin: string
  roomId: string | null
  chatter: ChannelChatter | null
  color?: string | null
}): TwitchChatMessage {
  const fromFragments = emotesFromV2Fragments(pin.messageFragments)
  const rawText = pin.messageText || fromFragments.text
  const stripped = stripActionMessage(rawText, fromFragments.emotes)
  const flags = chatter?.flags ?? EMPTY_FLAGS

  return {
    id: pin.messageId,
    channel: channelLogin,
    roomId,
    sourceRoomId: null,
    userId: pin.senderUserId,
    userName: pin.senderUserLogin || pin.senderUserName.toLowerCase(),
    displayName: pin.senderUserName || pin.senderUserLogin,
    text: stripped.text,
    color: color ?? chatter?.color ?? null,
    receivedAt: pin.startsAt || new Date().toISOString(),
    badges: badgesFromChatterFlags(flags),
    badgeInfo: [],
    emotes: stripped.emotes,
    gifs: [],
    reply: null,
    bits: bitsFromFragments(pin.messageFragments),
    deletedAt: null,
    flags: {
      isBroadcaster: flags.isBroadcaster,
      isModerator: flags.isModerator,
      isSubscriber: flags.isSubscriber,
      isVip: flags.isVip,
      isFirst: false,
      isAction: stripped.isAction,
    },
  }
}

export function channelPinnedMessageFromHelix({
  pin,
  message,
  fromTimeline,
}: {
  pin: TwitchPinnedChatMessage
  message: TwitchChatMessage
  fromTimeline: boolean
}): ChannelPinnedMessage {
  return {
    message,
    pinnedByUserId: pin.pinnedByUserId,
    pinnedByUserLogin: pin.pinnedByUserLogin,
    pinnedByUserName: pin.pinnedByUserName || pin.pinnedByUserLogin,
    startsAt: pin.startsAt,
    endsAt: pin.endsAt,
    updatedAt: pin.updatedAt,
    fromTimeline,
  }
}

function badgesFromChatterFlags(
  flags: TwitchChatMessage["flags"]
): TwitchBadge[] {
  const badges: TwitchBadge[] = []
  if (flags.isBroadcaster) {
    badges.push({ set: "broadcaster", version: "1" })
  } else if (flags.isModerator) {
    badges.push({ set: "moderator", version: "1" })
  }
  if (flags.isVip) {
    badges.push({ set: "vip", version: "1" })
  }
  if (flags.isSubscriber) {
    badges.push({ set: "subscriber", version: "0" })
  }
  return badges
}

function stripActionMessage(
  text: string,
  emotes: TwitchEmote[]
): { text: string; isAction: boolean; emotes: TwitchEmote[] } {
  if (!text.startsWith("\x01ACTION ") || !text.endsWith("\x01")) {
    return { text, isAction: false, emotes }
  }

  return {
    text: text.slice(8, -1),
    isAction: true,
    emotes: emotes.map((emote) => ({
      ...emote,
      start: emote.start - 8,
      end: emote.end - 8,
    })),
  }
}

function bitsFromFragments(fragments: unknown): number | null {
  if (!Array.isArray(fragments)) {
    return null
  }

  let bits = 0
  for (const fragment of fragments) {
    const record = asRecord(fragment)
    if (!record || asString(record.type) !== "cheermote") {
      continue
    }

    const cheermote = asRecord(record.cheermote)
    const amount = cheermote?.bits
    if (typeof amount === "number" && Number.isFinite(amount)) {
      bits += amount
      continue
    }
    if (typeof amount === "string") {
      const parsed = Number.parseInt(amount, 10)
      if (Number.isFinite(parsed)) {
        bits += parsed
      }
    }
  }

  return bits > 0 ? bits : null
}
