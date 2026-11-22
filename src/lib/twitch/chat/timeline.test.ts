import { afterEach, describe, expect, test } from "bun:test"

import { DEFAULT_CHAT_MODES } from "@/lib/chat/room/modes"
import {
  createChatModesSystemMessage,
  parseIrcPrivmsg,
} from "@/lib/twitch/chat/chat"
import {
  appendTimelineWithinLimit,
  applyDeletedBehaviorToTimeline,
  buildSyncChannelsKey,
  createEmptyRoom,
  getTimelineMessageIds,
  notifyChatMessageDeleted,
  partitionTimeline,
  partitionTimelineWithKnownIds,
  purgeDeletedChatEntries,
  purgeMessagesFromUsers,
  selfChatStatesEqual,
  selfStateFromMessage,
  trimTimeline,
  type TimelineMatchableMessage,
} from "@/lib/twitch/chat/timeline"
import type {
  TwitchSelfChatState,
  TwitchTimelineItem,
} from "@/lib/twitch/chat/types"

const DELETED_AT = "2024-01-01T00:00:00.000Z"

function chat(
  id: string,
  userName: string,
  options: { userId?: string; isHistorical?: boolean } = {}
): TwitchTimelineItem {
  const userIdTag = options.userId ? `;user-id=${options.userId}` : ""
  const message = parseIrcPrivmsg(
    `@id=${id};tmi-sent-ts=1700000000000${userIdTag} :${userName}!${userName}@${userName}.tmi.twitch.tv PRIVMSG #chan :message ${id}`
  )
  if (!message) throw new Error("fixture failed to parse")
  return { kind: "chat", message, isHistorical: options.isHistorical }
}

function suspicious(id: string, userName: string): TwitchTimelineItem {
  return {
    kind: "suspicious",
    message: {
      id,
      messageId: id,
      channel: "chan",
      roomId: "1",
      userId: `${userName}-id`,
      userName,
      displayName: userName,
      text: "sus",
      emotes: [],
      badges: [],
      color: null,
      bits: null,
      receivedAt: DELETED_AT,
      status: "monitored",
      deletedAt: null,
    },
  }
}

function system(text: string, isHistorical = false): TwitchTimelineItem {
  return {
    kind: "system",
    message: createChatModesSystemMessage({
      channel: "chan",
      roomId: "1",
      text,
      receivedAt: DELETED_AT,
    }),
    isHistorical,
  }
}

function ids(timeline: TwitchTimelineItem[]) {
  return timeline.map((entry) => entry.message.id)
}

const byUser =
  (userName: string) =>
  (message: TimelineMatchableMessage): boolean =>
    message.userName === userName

describe("applyDeletedBehaviorToTimeline", () => {
  test("marks matching chat and suspicious messages as deleted", () => {
    const timeline = [
      chat("1", "spammer"),
      chat("2", "friend"),
      suspicious("3", "spammer"),
      system("spammer joined"),
    ]

    const result = applyDeletedBehaviorToTimeline(
      timeline,
      byUser("spammer"),
      DELETED_AT,
      "strikethrough"
    )

    expect(ids(result.timeline)).toEqual(ids(timeline))
    expect(result.deletedMessageIds).toEqual(["1", "3"])
    const deletedStates = result.timeline.map((entry) =>
      entry.kind === "chat" || entry.kind === "suspicious"
        ? entry.message.deletedAt
        : "n/a"
    )
    expect(deletedStates).toEqual([DELETED_AT, null, DELETED_AT, "n/a"])
  })

  test("does not mutate the original timeline entries", () => {
    const original = chat("1", "spammer")

    applyDeletedBehaviorToTimeline(
      [original],
      byUser("spammer"),
      DELETED_AT,
      "strikethrough"
    )

    expect(original.kind === "chat" && original.message.deletedAt).toBeNull()
  })

  test("removes matching messages with the remove behavior", () => {
    const result = applyDeletedBehaviorToTimeline(
      [chat("1", "spammer"), chat("2", "friend"), suspicious("3", "spammer")],
      byUser("spammer"),
      DELETED_AT,
      "remove"
    )

    expect(ids(result.timeline)).toEqual(["2"])
    expect(result.deletedMessageIds).toEqual(["1", "3"])
  })

  test("keeps the original deletion time for already deleted messages", () => {
    const first = applyDeletedBehaviorToTimeline(
      [chat("1", "spammer")],
      byUser("spammer"),
      DELETED_AT,
      "show-on-hover"
    )
    const second = applyDeletedBehaviorToTimeline(
      first.timeline,
      byUser("spammer"),
      "2025-01-01T00:00:00.000Z",
      "remove"
    )

    expect(second.timeline).toHaveLength(1)
    expect(second.timeline[0]).toBe(first.timeline[0])
    expect(second.deletedMessageIds).toEqual(["1"])
  })
})

describe("purgeDeletedChatEntries", () => {
  test("drops deleted chat and suspicious entries but keeps other kinds", () => {
    const { timeline } = applyDeletedBehaviorToTimeline(
      [
        chat("1", "spammer"),
        suspicious("2", "spammer"),
        chat("3", "friend"),
        system("notice"),
      ],
      byUser("spammer"),
      DELETED_AT,
      "strikethrough"
    )

    expect(ids(purgeDeletedChatEntries(timeline))).toEqual([
      "3",
      timeline[3].message.id,
    ])
  })
})

describe("purgeMessagesFromUsers", () => {
  test("removes chat and suspicious messages from matching users only", () => {
    const timeline = [
      chat("1", "blocked", { userId: "9" }),
      suspicious("2", "blocked"),
      chat("3", "friend", { userId: "8" }),
      system("blocked was banned."),
    ]

    const result = purgeMessagesFromUsers(
      timeline,
      (message) => message.userId === "9" || message.userName === "blocked"
    )

    expect(ids(result)).toEqual(["3", timeline[3].message.id])
  })
})

describe("trimTimeline", () => {
  test("returns the same array when within the limit", () => {
    const timeline = [chat("1", "a"), chat("2", "a")]

    expect(trimTimeline(timeline, 2)).toBe(timeline)
  })

  test("drops the oldest entries first, historical before live", () => {
    const timeline = [
      chat("h1", "a", { isHistorical: true }),
      chat("h2", "a", { isHistorical: true }),
      chat("l1", "a"),
      chat("l2", "a"),
      chat("l3", "a"),
    ]

    expect(ids(trimTimeline(timeline, 4))).toEqual(["h2", "l1", "l2", "l3"])
    expect(ids(trimTimeline(timeline, 2))).toEqual(["l2", "l3"])
  })

  test("handles a zero limit", () => {
    expect(trimTimeline([chat("1", "a")], 0)).toEqual([])
  })
})

describe("appendTimelineWithinLimit", () => {
  const ids = (timeline: TwitchTimelineItem[]) =>
    timeline.map((entry) => entry.message.id)

  test("appends everything when under the limit", () => {
    const timeline = [chat("a", "u1"), chat("b", "u2")]
    const result = appendTimelineWithinLimit(timeline, [chat("c", "u3")], 5)
    expect(ids(result)).toEqual(["a", "b", "c"])
  })

  test("drops the oldest existing entries when over the limit", () => {
    const timeline = [chat("a", "u1"), chat("b", "u2"), chat("c", "u3")]
    const result = appendTimelineWithinLimit(
      timeline,
      [chat("d", "u4"), chat("e", "u5")],
      3
    )
    expect(ids(result)).toEqual(["c", "d", "e"])
  })

  test("keeps only the newest items when a batch exceeds the limit", () => {
    const timeline = [chat("a", "u1"), chat("b", "u2")]
    const batch = ["c", "d", "e", "f", "g"].map((id) => chat(id, "u"))
    const result = appendTimelineWithinLimit(timeline, batch, 3)
    expect(ids(result)).toEqual(["e", "f", "g"])
  })

  test("keeps the whole batch when it exactly matches the limit", () => {
    const timeline = [chat("a", "u1")]
    const batch = ["b", "c", "d"].map((id) => chat(id, "u"))
    const result = appendTimelineWithinLimit(timeline, batch, 3)
    expect(ids(result)).toEqual(["b", "c", "d"])
  })
})

describe("partitionTimeline", () => {
  test("splits historical and live entries preserving order", () => {
    const timeline = [
      chat("h1", "a", { isHistorical: true }),
      system("live notice"),
      chat("l1", "a"),
      system("old notice", true),
    ]

    const { historical, live } = partitionTimeline(timeline)

    expect(ids(historical)).toEqual(["h1", timeline[3].message.id])
    expect(ids(live)).toEqual([timeline[1].message.id, "l1"])
  })

  test("also collects known ids", () => {
    const { knownIds, historical, live } = partitionTimelineWithKnownIds([
      chat("h1", "a", { isHistorical: true }),
      chat("l1", "a"),
    ])

    expect([...knownIds]).toEqual(["h1", "l1"])
    expect(ids(historical)).toEqual(["h1"])
    expect(ids(live)).toEqual(["l1"])
  })
})

describe("getTimelineMessageIds", () => {
  test("collects unique ids across entry kinds", () => {
    expect([
      ...getTimelineMessageIds([
        chat("1", "a"),
        chat("1", "a"),
        suspicious("2", "b"),
      ]),
    ]).toEqual(["1", "2"])
  })
})

describe("buildSyncChannelsKey", () => {
  test("cannot collide for different channel lists", () => {
    expect(buildSyncChannelsKey(["a,b"])).not.toBe(
      buildSyncChannelsKey(["a", "b"])
    )
    expect(buildSyncChannelsKey(["a", "b"])).not.toBe(
      buildSyncChannelsKey(["b", "a"])
    )
  })
})

describe("selfChatStatesEqual", () => {
  const base: TwitchSelfChatState = {
    channel: "chan",
    roomId: "1",
    displayName: "Me",
    color: "#FF0000",
    badges: [{ set: "moderator", version: "1" }],
    isBroadcaster: false,
    isModerator: true,
    isSubscriber: false,
    isVip: false,
  }

  test("treats separate objects with identical fields as equal", () => {
    expect(
      selfChatStatesEqual(base, {
        ...base,
        badges: [{ set: "moderator", version: "1" }],
      })
    ).toBe(true)
  })

  test("detects changed scalar fields", () => {
    expect(selfChatStatesEqual(base, { ...base, color: "#00FF00" })).toBe(false)
    expect(selfChatStatesEqual(base, { ...base, isModerator: false })).toBe(
      false
    )
  })

  test("detects changed badges", () => {
    expect(
      selfChatStatesEqual(base, {
        ...base,
        badges: [{ set: "moderator", version: "2" }],
      })
    ).toBe(false)
    expect(
      selfChatStatesEqual(base, {
        ...base,
        badges: [...base.badges, { set: "subscriber", version: "0" }],
      })
    ).toBe(false)
  })
})

describe("selfStateFromMessage", () => {
  test("derives self state from a parsed chat message", () => {
    const message = parseIrcPrivmsg(
      "@badges=moderator/1;color=#FF0000;display-name=Me;id=1;mod=1;room-id=55;subscriber=1 :me!me@me.tmi.twitch.tv PRIVMSG #Chan :hi"
    )!

    expect(selfStateFromMessage(message)).toEqual({
      channel: "chan",
      roomId: "55",
      displayName: "Me",
      color: "#FF0000",
      badges: [{ set: "moderator", version: "1" }],
      isBroadcaster: false,
      isModerator: true,
      isSubscriber: true,
      isVip: false,
    })
  })
})

describe("createEmptyRoom", () => {
  test("creates a joining room with independent default chat modes", () => {
    const room = createEmptyRoom("chan")
    room.chatModes.slowMode = true

    expect(room).toMatchObject({
      login: "chan",
      roomId: null,
      joined: false,
      joining: true,
      timeline: [],
    })
    expect(DEFAULT_CHAT_MODES.slowMode).toBe(false)
    expect(createEmptyRoom("chan").chatModes.slowMode).toBe(false)
  })
})

describe("notifyChatMessageDeleted", () => {
  const received: unknown[] = []
  const listener = (event: Event) => {
    received.push((event as CustomEvent).detail)
  }

  afterEach(() => {
    window.removeEventListener("peepochat:message-deleted", listener)
    received.length = 0
  })

  test("dispatches a window event with the channel and message id", () => {
    window.addEventListener("peepochat:message-deleted", listener)

    notifyChatMessageDeleted("chan", "msg-1")

    expect(received).toEqual([{ channelLogin: "chan", messageId: "msg-1" }])
  })
})
