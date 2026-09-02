import { describe, expect, test } from "bun:test"

import { trimTimeline } from "../src/lib/twitch/chat-timeline"
import type { TwitchTimelineItem } from "../src/lib/twitch/twitch-chat-types"

function item(id: string, historical = false): TwitchTimelineItem {
  return {
    kind: "chat",
    isHistorical: historical || undefined,
    message: {
      id,
      channel: "x",
      roomId: null,
      sourceRoomId: null,
      userId: "1",
      userName: "u",
      displayName: "u",
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

describe("trimTimeline", () => {
  test("returns the same array when under the limit", () => {
    const timeline = [item("a"), item("b")]
    expect(trimTimeline(timeline, 5)).toBe(timeline)
  })

  test("drops historical messages before live ones", () => {
    const timeline = [
      item("h1", true),
      item("h2", true),
      item("h3", true),
      item("l1"),
      item("l2"),
      item("l3"),
    ]

    expect(trimTimeline(timeline, 4).map((entry) => entry.message.id)).toEqual([
      "h3",
      "l1",
      "l2",
      "l3",
    ])
  })

  test("drops live messages from the front after historical is gone", () => {
    const timeline = [
      item("l1"),
      item("l2"),
      item("l3"),
      item("l4"),
      item("l5"),
      item("l6"),
    ]

    expect(trimTimeline(timeline, 4).map((entry) => entry.message.id)).toEqual([
      "l3",
      "l4",
      "l5",
      "l6",
    ])
  })
})
