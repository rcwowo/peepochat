import { isTimelineAppend } from "@/lib/chat/timeline-prefix"
import type { TwitchChatMessage } from "@/lib/twitch/twitch-chat"
import type {
  TwitchSuspiciousUserMessage,
  TwitchTimelineItem,
} from "@/lib/twitch/twitch-chat-types"

type TimelineEntry = TwitchTimelineItem

const EMPTY_RECENT_USER_MESSAGES: TwitchChatMessage[] = []

export function getEmptyRecentUserMessages(): TwitchChatMessage[] {
  return EMPTY_RECENT_USER_MESSAGES
}

function suspiciousAsChatMessage(
  message: TwitchSuspiciousUserMessage
): TwitchChatMessage {
  return {
    id: message.id,
    channel: message.channel,
    roomId: message.roomId,
    userId: message.userId,
    userName: message.userName,
    displayName: message.displayName,
    text: message.text,
    color: message.color,
    receivedAt: message.receivedAt,
    badges: [],
    badgeInfo: [],
    emotes: message.emotes,
    reply: null,
    deletedAt: message.deletedAt,
    flags: {
      isBroadcaster: false,
      isModerator: false,
      isSubscriber: false,
      isVip: false,
      isFirst: false,
      isAction: false,
    },
  }
}

function entryAsRecentChatMessage(
  entry: TimelineEntry
): TwitchChatMessage | null {
  if (entry.kind === "chat") {
    return entry.message.deletedAt ? null : entry.message
  }
  if (entry.kind === "suspicious") {
    return entry.message.deletedAt
      ? null
      : suspiciousAsChatMessage(entry.message)
  }
  return null
}

export function getRecentUserMessages({
  timeline,
  userId,
  userName,
  limit = 6,
}: {
  timeline: TimelineEntry[]
  userId: string | null
  userName: string
  limit?: number
}): TwitchChatMessage[] {
  const normalizedLogin = userName.toLowerCase()
  const messages: TwitchChatMessage[] = []

  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const message = entryAsRecentChatMessage(timeline[index])
    if (!message) {
      continue
    }

    const matchesId = Boolean(userId && message.userId === userId)
    const matchesLogin = message.userName.toLowerCase() === normalizedLogin
    if (!matchesId && !matchesLogin) {
      continue
    }

    messages.push(message)
    if (messages.length >= limit) {
      break
    }
  }

  return messages.reverse()
}

function rememberRecentUserMessage(
  buckets: Map<string, TwitchChatMessage[]>,
  key: string | null | undefined,
  message: TwitchChatMessage,
  limit: number
) {
  if (!key) {
    return
  }

  const existing = buckets.get(key)
  const bucket = existing ? [...existing] : []
  bucket.push(message)
  if (bucket.length > limit) {
    bucket.shift()
  }
  buckets.set(key, bucket)
}

function rememberTimelineEntry(
  buckets: Map<string, TwitchChatMessage[]>,
  entry: TimelineEntry,
  limit: number
) {
  const message = entryAsRecentChatMessage(entry)
  if (!message) {
    return
  }

  rememberRecentUserMessage(
    buckets,
    `login:${message.userName.toLowerCase()}`,
    message,
    limit
  )
  rememberRecentUserMessage(
    buckets,
    message.userId ? `id:${message.userId}` : null,
    message,
    limit
  )
}

function bucketsEqual(left: TwitchChatMessage[], right: TwitchChatMessage[]) {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

export function getRecentUserMessageBuckets(
  timeline: TimelineEntry[],
  limit = 6
): Map<string, TwitchChatMessage[]> {
  const buckets = new Map<string, TwitchChatMessage[]>()

  for (const entry of timeline) {
    rememberTimelineEntry(buckets, entry, limit)
  }

  return buckets
}

export type RecentUserMessageBucketCache = {
  timeline: TimelineEntry[] | null
  buckets: Map<string, TwitchChatMessage[]>
}

export function createRecentUserMessageBucketCache(): RecentUserMessageBucketCache {
  return {
    timeline: null,
    buckets: new Map(),
  }
}

export function updateRecentUserMessageBuckets(
  cache: RecentUserMessageBucketCache,
  timeline: TimelineEntry[],
  limit = 6
): Map<string, TwitchChatMessage[]> {
  const previousTimeline = cache.timeline

  if (previousTimeline && isTimelineAppend(previousTimeline, timeline)) {
    const buckets = new Map(cache.buckets)

    for (
      let index = previousTimeline.length;
      index < timeline.length;
      index += 1
    ) {
      rememberTimelineEntry(buckets, timeline[index], limit)
    }

    cache.timeline = timeline
    cache.buckets = buckets
    return buckets
  }

  const rebuilt = getRecentUserMessageBuckets(timeline, limit)
  const buckets = new Map<string, TwitchChatMessage[]>()

  for (const [key, nextBucket] of rebuilt) {
    const previousBucket = cache.buckets.get(key)
    if (previousBucket && bucketsEqual(previousBucket, nextBucket)) {
      buckets.set(key, previousBucket)
    } else {
      buckets.set(key, nextBucket)
    }
  }

  cache.timeline = timeline
  cache.buckets = buckets
  return buckets
}
