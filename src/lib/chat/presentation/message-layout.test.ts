import { describe, expect, test } from "bun:test"

import {
  estimateTimelineItemSize,
  getTimelineItemLineHeight,
  type ChatListLayout,
} from "@/lib/chat/presentation/message-layout"
import { getChatPresentationMetrics } from "@/lib/chat/presentation/presentation-style"
import {
  CHAT_EMOTE_SCALE_DEFAULT,
  CHAT_FONT_SIZE_DEFAULT,
} from "@/lib/peepochat/peepochat-config"
import {
  EMPTY_SYSTEM_MESSAGE_META,
  type TwitchChatMessage,
  type TwitchSystemMessage,
} from "@/lib/twitch/chat/chat"
import type { TwitchTimelineItem } from "@/lib/twitch/chat/types"

const metrics = getChatPresentationMetrics({
  fontSizePx: CHAT_FONT_SIZE_DEFAULT,
  emoteScale: CHAT_EMOTE_SCALE_DEFAULT,
})

function layout(overrides: Partial<ChatListLayout> = {}): ChatListLayout {
  return {
    metrics,
    viewportWidth: 400,
    fontFamily: "sans-serif",
    timestampFormat: "none",
    messageSeparators: false,
    showTwitchBadges: true,
    gifAppearance: "display",
    ...overrides,
  }
}

function chat(
  text: string,
  overrides: Partial<TwitchChatMessage> = {}
): TwitchTimelineItem {
  return {
    kind: "chat",
    message: {
      id: "m",
      channel: "room",
      roomId: "1",
      sourceRoomId: null,
      userId: "1",
      userName: "user",
      displayName: "User",
      text,
      color: null,
      receivedAt: "2024-01-01T00:00:00.000Z",
      badges: [],
      badgeInfo: [],
      emotes: [],
      gifs: [],
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
      ...overrides,
    },
  }
}

function system(overrides: Partial<TwitchSystemMessage>): TwitchTimelineItem {
  return {
    kind: "system",
    message: {
      id: "s",
      channel: "room",
      roomId: "1",
      text: "notice",
      headline: "notice",
      details: null,
      receivedAt: "2024-01-01T00:00:00.000Z",
      event: "notice",
      level: "info",
      accentColor: null,
      ...EMPTY_SYSTEM_MESSAGE_META,
      badges: [],
      ...overrides,
    },
  }
}

const oneLine = Math.ceil(metrics.rowPaddingY + metrics.lineHeightPx)
const longText = "lorem ipsum dolor ".repeat(20)

describe("getTimelineItemLineHeight", () => {
  test("grows to fit emotes but never shrinks below the text line", () => {
    expect(getTimelineItemLineHeight(metrics, false)).toBe(metrics.lineHeightPx)
    expect(getTimelineItemLineHeight(metrics, true)).toBe(
      Math.max(
        metrics.lineHeightPx,
        metrics.emoteSizePx + 2 * metrics.emoteMarginPx
      )
    )
    expect(
      getTimelineItemLineHeight({ ...metrics, emoteSizePx: 4 }, true)
    ).toBe(metrics.lineHeightPx)
  })
})

describe("estimateTimelineItemSize", () => {
  test("estimates a short chat message as a single line", () => {
    expect(estimateTimelineItemSize(undefined, layout())).toBe(oneLine)
    expect(estimateTimelineItemSize(chat("hi"), layout())).toBe(oneLine)
    expect(
      estimateTimelineItemSize(chat("hi"), layout({ messageSeparators: true }))
    ).toBe(oneLine + 1)
  })

  test("wraps long messages into whole extra lines", () => {
    const wide = estimateTimelineItemSize(chat(longText), layout())
    const narrow = estimateTimelineItemSize(
      chat(longText),
      layout({ viewportWidth: 200 })
    )
    expect(wide).toBeGreaterThan(oneLine)
    expect(narrow).toBeGreaterThan(wide)
    const lineCounts = Array.from({ length: 20 }, (_, index) => index + 2)
    expect(
      lineCounts.some(
        (lines) =>
          Math.ceil(metrics.rowPaddingY + lines * metrics.lineHeightPx) === wide
      )
    ).toBe(true)
  })

  test("falls back to a default viewport width when unmeasured", () => {
    expect(
      estimateTimelineItemSize(chat(longText), layout({ viewportWidth: 0 }))
    ).toBe(
      estimateTimelineItemSize(chat(longText), layout({ viewportWidth: 360 }))
    )
  })

  test("adds room for reply context and first-message chrome", () => {
    const reply = {
      parentMessageId: "p",
      threadRootMessageId: "p",
      parentDisplayName: "Parent",
      parentUserName: "parent",
      parentBody: "original",
      parentColor: null,
    }
    expect(
      estimateTimelineItemSize(chat("@parent hi", { reply }), layout())
    ).toBe(oneLine + 18)
    const first = chat("hi")
    if (first.kind === "chat") {
      first.message.flags.isFirst = true
    }
    expect(estimateTimelineItemSize(first, layout())).toBe(oneLine + 40)
  })

  test("adds gif height only when gifs are displayed inline", () => {
    const gifs = [
      { id: "g", url: "https://example.test/g.gif", start: 0, end: 2 },
    ]
    const entry = chat("gif", { gifs })
    expect(estimateTimelineItemSize(entry, layout())).toBe(
      oneLine + metrics.gifMaxHeightPx
    )
    expect(
      estimateTimelineItemSize(entry, layout({ gifAppearance: "links" }))
    ).toBe(oneLine)
  })

  test("counts badge width only when badges are shown", () => {
    const badges = Array.from({ length: 12 }, (_, index) => ({
      set: `b${index}`,
      version: "1",
    }))
    const text = "x".repeat(30)
    const withBadges = estimateTimelineItemSize(
      chat(text, { badges }),
      layout({ viewportWidth: 300 })
    )
    const withoutBadges = estimateTimelineItemSize(
      chat(text, { badges }),
      layout({ viewportWidth: 300, showTwitchBadges: false })
    )
    expect(withBadges).toBeGreaterThan(withoutBadges)
  })

  test("adds announcement chrome for announcements", () => {
    const announcement = system({
      event: "announcement",
      headline: "Announcement",
      details: "hello",
    })
    expect(estimateTimelineItemSize(announcement, layout())).toBe(
      Math.ceil(metrics.rowPaddingY + 28 + 12 + metrics.lineHeightPx)
    )
    expect(estimateTimelineItemSize(system({}), layout())).toBe(oneLine)
  })
})
