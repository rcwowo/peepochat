import { getTimelineWindowShift } from "@/lib/chat/timeline-prefix"
import type { TwitchChatMessage } from "@/lib/twitch/twitch-chat"
import type {
  TwitchSuspiciousUserMessage,
  TwitchTimelineItem,
} from "@/lib/twitch/twitch-chat-types"

type TimelineEntry = TwitchTimelineItem

function suspiciousAsChatMessage(
  message: TwitchSuspiciousUserMessage
): TwitchChatMessage {
  return {
    id: message.id,
    channel: message.channel,
    roomId: message.roomId,
    sourceRoomId: null,
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
    bits: null,
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

function forgetRecentUserMessage(
  buckets: Map<string, TwitchChatMessage[]>,
  key: string | null | undefined,
  messageId: string
) {
  if (!key) {
    return false
  }

  const existing = buckets.get(key)
  if (!existing) {
    return false
  }

  const next = existing.filter((message) => message.id !== messageId)
  if (next.length === existing.length) {
    return false
  }

  if (next.length === 0) {
    buckets.delete(key)
  } else {
    buckets.set(key, next)
  }
  return true
}

function forgetTimelineEntry(
  buckets: Map<string, TwitchChatMessage[]>,
  entry: TimelineEntry
) {
  if (entry.kind !== "chat" && entry.kind !== "suspicious") {
    return false
  }

  const message = entry.message
  const loginChanged = forgetRecentUserMessage(
    buckets,
    `login:${message.userName.toLowerCase()}`,
    message.id
  )
  const idChanged = forgetRecentUserMessage(
    buckets,
    message.userId ? `id:${message.userId}` : null,
    message.id
  )
  return loginChanged || idChanged
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

  if (previousTimeline) {
    const shift = getTimelineWindowShift(previousTimeline, timeline)
    if (shift) {
      const buckets = new Map(cache.buckets)
      let lostRecent = false

      for (let index = 0; index < shift.dropped; index += 1) {
        if (forgetTimelineEntry(buckets, previousTimeline[index])) {
          lostRecent = true
          break
        }
      }

      if (!lostRecent) {
        for (let index = shift.addedFrom; index < timeline.length; index += 1) {
          rememberTimelineEntry(buckets, timeline[index], limit)
        }

        cache.timeline = timeline
        cache.buckets = buckets
        return buckets
      }
    }
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

export function updateMergedRecentUserMessageBuckets(
  caches: Map<string, RecentUserMessageBucketCache>,
  entries: Array<{ login: string; timeline: TimelineEntry[] }>,
  limit = 6
): Map<string, TwitchChatMessage[]> {
  const merged = new Map<string, TwitchChatMessage[]>()
  const nextCaches = new Map<string, RecentUserMessageBucketCache>()

  for (const { login, timeline } of entries) {
    const cache = caches.get(login) ?? createRecentUserMessageBucketCache()
    const buckets = updateRecentUserMessageBuckets(cache, timeline, limit)
    nextCaches.set(login, cache)

    for (const [key, messages] of buckets) {
      const existing = merged.get(key)
      merged.set(key, existing ? [...existing, ...messages] : messages)
    }
  }

  caches.clear()
  for (const [login, cache] of nextCaches) {
    caches.set(login, cache)
  }

  return merged
}
