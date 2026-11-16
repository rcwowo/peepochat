import { describe, expect, test } from "bun:test"

import {
  createRecentUserMessageBucketCache,
  getRecentUserMessageBuckets,
  updateMergedRecentUserMessageBuckets,
  updateRecentUserMessageBuckets,
  type RecentUserMessageBucketCache,
} from "@/lib/chat/threads/recent-user-messages"
import type { TwitchChatMessage } from "@/lib/twitch/chat/chat"
import type { TwitchTimelineItem } from "@/lib/twitch/chat/types"

function chat(
  id: string,
  user: string,
  options: { userId?: string | null; deletedAt?: string | null } = {}
): TwitchTimelineItem {
  const message: TwitchChatMessage = {
    id,
    channel: "room",
    roomId: "1",
    sourceRoomId: null,
    userId:
      options.userId === undefined
        ? `${user.toLowerCase()}-id`
        : options.userId,
    userName: user,
    displayName: user,
    text: id,
    color: null,
    receivedAt: "2024-01-01T00:00:00.000Z",
    badges: [],
    badgeInfo: [],
    emotes: [],
    gifs: [],
    reply: null,
    bits: null,
    deletedAt: options.deletedAt ?? null,
    flags: {
      isBroadcaster: false,
      isModerator: false,
      isSubscriber: false,
      isVip: false,
      isFirst: false,
      isAction: false,
    },
  }
  return { kind: "chat", message }
}

function suspicious(id: string, user: string): TwitchTimelineItem {
  return {
    kind: "suspicious",
    message: {
      id,
      messageId: id,
      channel: "room",
      roomId: "1",
      userId: `${user}-id`,
      userName: user,
      displayName: user,
      text: id,
      emotes: [],
      badges: [],
      color: null,
      bits: null,
      receivedAt: "2024-01-01T00:00:00.000Z",
      status: "monitored",
      deletedAt: null,
    },
  }
}

function system(id: string): TwitchTimelineItem {
  return {
    kind: "system",
    message: {
      id,
      channel: "room",
      roomId: "1",
      text: id,
      headline: id,
      details: null,
      receivedAt: "2024-01-01T00:00:00.000Z",
      event: "status",
      level: "info",
      accentColor: null,
      msgId: null,
      banDurationSeconds: null,
      actor: null,
      target: null,
      badges: [],
      modActionKind: null,
      viewerCount: null,
      cumulativeMonths: null,
      streakMonths: null,
      giftCount: null,
      subPlan: null,
      announcementTheme: null,
    },
  }
}

function ids(buckets: Map<string, TwitchChatMessage[]>, key: string) {
  return buckets.get(key)?.map((message) => message.id)
}

function snapshot(buckets: Map<string, TwitchChatMessage[]>) {
  return Object.fromEntries(
    [...buckets].map(([key, messages]) => [key, messages.map((m) => m.id)])
  )
}

describe("getRecentUserMessageBuckets", () => {
  test("indexes messages by lowercased login and by user id", () => {
    const buckets = getRecentUserMessageBuckets([
      chat("1", "Alice"),
      chat("2", "bob"),
      chat("3", "ALICE"),
    ])
    expect(ids(buckets, "login:alice")).toEqual(["1", "3"])
    expect(ids(buckets, "id:alice-id")).toEqual(["1", "3"])
    expect(ids(buckets, "login:bob")).toEqual(["2"])
  })

  test("keeps only the newest messages up to the limit", () => {
    const timeline = ["1", "2", "3", "4"].map((id) => chat(id, "alice"))
    expect(
      ids(getRecentUserMessageBuckets(timeline, 2), "login:alice")
    ).toEqual(["3", "4"])
  })

  test("skips deleted messages and non-chat entries but includes suspicious users", () => {
    const buckets = getRecentUserMessageBuckets([
      chat("1", "alice", { deletedAt: "2024-01-01T00:00:01.000Z" }),
      system("sys"),
      suspicious("2", "alice"),
      chat("3", "alice"),
    ])
    expect(ids(buckets, "login:alice")).toEqual(["2", "3"])
    expect(buckets.get("login:alice")![0]!.badges).toEqual([])
  })

  test("only indexes by login when the user id is unknown", () => {
    const buckets = getRecentUserMessageBuckets([
      chat("1", "anon", { userId: null }),
    ])
    expect([...buckets.keys()]).toEqual(["login:anon"])
  })
})

describe("updateRecentUserMessageBuckets", () => {
  function run(
    cache: RecentUserMessageBucketCache,
    timeline: TwitchTimelineItem[],
    limit = 3
  ) {
    const incremental = updateRecentUserMessageBuckets(cache, timeline, limit)
    const rebuilt = getRecentUserMessageBuckets(timeline, limit)
    expect(snapshot(incremental)).toEqual(snapshot(rebuilt))
    expect(incremental).toEqual(rebuilt)
    return incremental
  }

  function deleted(entry: TwitchTimelineItem): TwitchTimelineItem {
    if (entry.kind !== "chat" && entry.kind !== "suspicious") {
      return entry
    }
    return {
      ...entry,
      message: { ...entry.message, deletedAt: "2024-01-01T00:00:05.000Z" },
    } as TwitchTimelineItem
  }

  test("matches a full rebuild across appends and front trims", () => {
    const cache = createRecentUserMessageBucketCache()
    const all = [
      chat("1", "alice"),
      chat("2", "bob"),
      chat("3", "alice"),
      system("s1"),
      chat("4", "carol"),
      chat("5", "alice"),
      chat("6", "alice"),
      chat("7", "bob"),
      chat("8", "alice"),
    ]

    run(cache, all.slice(0, 3))
    run(cache, all.slice(0, 5))
    run(cache, all.slice(1, 7))
    run(cache, all.slice(3, 9))
    run(cache, all.slice(6, 9))
    expect(cache.timeline).toEqual(all.slice(6, 9))
  })

  test("matches a full rebuild when retained messages are deleted in place", () => {
    const cache = createRecentUserMessageBucketCache()
    const m1 = chat("1", "alice")
    const m2 = chat("2", "alice")

    run(cache, [m1, m2])
    const afterDelete = run(cache, [deleted(m1), m2])
    expect(ids(afterDelete, "login:alice")).toEqual(["2"])
    expect(ids(afterDelete, "id:alice-id")).toEqual(["2"])
  })

  test("matches a full rebuild when deletions coincide with trims and appends", () => {
    const cache = createRecentUserMessageBucketCache()
    const all = [
      system("s0"),
      chat("2", "bob"),
      suspicious("3", "alice"),
      chat("4", "alice"),
      chat("5", "bob"),
      chat("6", "alice"),
    ]

    run(cache, all.slice(0, 5))
    const timeline = [all[1], deleted(all[2]), deleted(all[3]), all[4], all[5]]
    const next = run(cache, timeline)
    expect(ids(next, "login:alice")).toEqual(["6"])
    expect(ids(next, "login:bob")).toEqual(["2", "5"])

    run(cache, [...timeline, chat("7", "alice")])
  })

  test("picks up replaced message objects for retained entries", () => {
    const cache = createRecentUserMessageBucketCache()
    const original = chat("1", "alice")
    run(cache, [original])

    const edited = {
      ...original,
      message: { ...original.message, text: "edited" },
    } as TwitchTimelineItem
    const next = run(cache, [edited, chat("2", "bob")])
    expect(next.get("login:alice")![0]).toBe(
      edited.message as TwitchChatMessage
    )
  })

  test("keeps the incremental path when retained entries are unchanged", () => {
    const cache = createRecentUserMessageBucketCache()
    const flagged = suspicious("1", "alice")
    const bob = chat("2", "bob")
    const first = run(cache, [flagged, bob])
    const aliceBucket = first.get("login:alice")

    const second = run(cache, [{ ...flagged }, bob, chat("3", "carol")])
    expect(second.get("login:alice")).toBe(aliceBucket!)
  })

  test("trims old messages incrementally when they already fell out of the bucket", () => {
    const cache = createRecentUserMessageBucketCache()
    const all = [
      chat("1", "alice"),
      chat("2", "alice", { deletedAt: "2024-01-01T00:00:01.000Z" }),
      chat("3", "alice"),
      chat("4", "alice"),
      chat("5", "bob"),
      chat("6", "alice"),
    ]

    const first = run(cache, all.slice(0, 5), 2)
    const bobBucket = first.get("login:bob")
    const second = run(cache, all.slice(2, 6), 2)

    expect(ids(second, "login:alice")).toEqual(["4", "6"])
    expect(second.get("login:bob")).toBe(bobBucket!)
    expect(second).not.toBe(first)
  })

  test("rebuilds when the timeline is replaced", () => {
    const cache = createRecentUserMessageBucketCache()
    run(cache, [chat("1", "alice"), chat("2", "bob")])
    run(cache, [chat("3", "carol")])
    run(cache, [])
  })

  test("reuses unchanged buckets when rebuilding", () => {
    const cache = createRecentUserMessageBucketCache()
    const alice = chat("1", "alice")
    const first = run(cache, [alice, chat("2", "bob")])
    const aliceBucket = first.get("login:alice")

    const second = run(cache, [alice, chat("3", "carol")])
    expect(second.get("login:alice")).toBe(aliceBucket!)
    expect(second.get("login:bob")).toBeUndefined()
  })

  test("does not mutate buckets returned by an earlier update", () => {
    const cache = createRecentUserMessageBucketCache()
    const timeline = [chat("1", "alice")]
    const first = run(cache, timeline)
    const before = snapshot(first)
    run(cache, [...timeline, chat("2", "alice")])
    expect(snapshot(first)).toEqual(before)
  })
})

describe("updateMergedRecentUserMessageBuckets", () => {
  test("concatenates per-channel buckets in entry order", () => {
    const caches = new Map<string, RecentUserMessageBucketCache>()
    const merged = updateMergedRecentUserMessageBuckets(caches, [
      { login: "one", timeline: [chat("a1", "alice"), chat("b1", "bob")] },
      { login: "two", timeline: [chat("a2", "alice")] },
    ])

    expect(ids(merged, "login:alice")).toEqual(["a1", "a2"])
    expect(ids(merged, "login:bob")).toEqual(["b1"])
    expect([...caches.keys()]).toEqual(["one", "two"])
  })

  test("drops caches for channels that are no longer present", () => {
    const caches = new Map<string, RecentUserMessageBucketCache>()
    updateMergedRecentUserMessageBuckets(caches, [
      { login: "one", timeline: [chat("a1", "alice")] },
      { login: "two", timeline: [chat("a2", "alice")] },
    ])
    const oneCache = caches.get("one")

    const merged = updateMergedRecentUserMessageBuckets(caches, [
      { login: "one", timeline: [chat("a1", "alice"), chat("a3", "alice")] },
    ])

    expect([...caches.keys()]).toEqual(["one"])
    expect(caches.get("one")).toBe(oneCache!)
    expect(ids(merged, "login:alice")).toEqual(["a1", "a3"])
  })
})
