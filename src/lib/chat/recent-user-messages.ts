import type { TwitchChatMessage } from "@/lib/twitch/twitch-chat"

type TimelineEntry =
  | { kind: "chat"; message: TwitchChatMessage }
  | { kind: "system"; message: unknown }

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
    const entry = timeline[index]
    if (entry.kind !== "chat") {
      continue
    }

    const message = entry.message
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

export function getRecentUserMessageBuckets(
  timeline: TimelineEntry[],
  limit = 6
): Map<string, TwitchChatMessage[]> {
  const buckets = new Map<string, TwitchChatMessage[]>()

  const remember = (key: string | null | undefined, message: TwitchChatMessage) => {
    if (!key) return
    const bucket = buckets.get(key) ?? []
    bucket.push(message)
    if (bucket.length > limit) {
      bucket.shift()
    }
    buckets.set(key, bucket)
  }

  for (const entry of timeline) {
    if (entry.kind !== "chat") {
      continue
    }

    remember(`login:${entry.message.userName.toLowerCase()}`, entry.message)
    remember(entry.message.userId ? `id:${entry.message.userId}` : null, entry.message)
  }

  return buckets
}
