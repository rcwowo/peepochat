import { describe, expect, test } from "bun:test"

import {
  createRecentUserMessageBucketCache,
  updateRecentUserMessageBuckets,
} from "../src/lib/chat/recent-user-messages"
import type { TwitchTimelineItem } from "../src/lib/twitch/twitch-chat-types"

function chatItem(
  id: string,
  userName: string,
  userId: string
): TwitchTimelineItem {
  return {
    kind: "chat",
    message: {
      id,
      channel: "x",
      roomId: null,
      sourceRoomId: null,
      userId,
      userName,
      displayName: userName,
      text: id,
      color: null,
      receivedAt: "2020-01-01T00:00:00.000Z",
      badges: [],
      badgeInfo: [],
      emotes: [],
      reply: null,
      bits: null,
      deletedAt: null,
      flags: {
        isBroadcaster: false,
        isModerator: false,
        isSubscriber: false,
        isVip: false,
        isFirst: false,
        isAction: false,
      },
    },
  }
}

describe("updateRecentUserMessageBuckets", () => {
  test("appends without rebuilding when the timeline only grows", () => {
    const cache = createRecentUserMessageBucketCache()
    const first = [chatItem("a", "alice", "1")]
    updateRecentUserMessageBuckets(cache, first)
    const firstBuckets = cache.buckets

    const next = [chatItem("a", "alice", "1"), chatItem("b", "bob", "2")]
    const buckets = updateRecentUserMessageBuckets(cache, next)

    expect(buckets.get("login:alice")).toBe(firstBuckets.get("login:alice"))
    expect(buckets.get("login:bob")?.map((message) => message.id)).toEqual([
      "b",
    ])
  })

  test("rebuilds when a dropped message was in a recent bucket", () => {
    const cache = createRecentUserMessageBucketCache()
    const first = [
      chatItem("a", "alice", "1"),
      chatItem("b", "bob", "2"),
      chatItem("c", "carol", "3"),
    ]
    updateRecentUserMessageBuckets(cache, first)

    const next = [
      chatItem("b", "bob", "2"),
      chatItem("c", "carol", "3"),
      chatItem("d", "dave", "4"),
    ]
    const buckets = updateRecentUserMessageBuckets(cache, next)

    expect(buckets.has("login:alice")).toBe(false)
    expect(buckets.get("login:dave")?.map((message) => message.id)).toEqual([
      "d",
    ])
  })
})
