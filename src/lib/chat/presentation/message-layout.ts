import type { ChatPresentationMetrics } from "@/lib/chat/presentation/presentation-style"
import { getReplyDisplayContent } from "@/lib/chat/threads/strip-reply-mention"
import type {
  GifMessageAppearance,
  MessageTimestampFormat,
} from "@/lib/peepochat/peepochat-config"
import {
  getEmoteConsumedEnd,
  getGifConsumedEnd,
  type TwitchChatGif,
  type TwitchEmote,
} from "@/lib/twitch/chat/chat"
import type { TwitchTimelineItem } from "@/lib/twitch/chat/types"

const MESSAGE_PADDING_X_PX = 24
const TIMESTAMP_GAP_PX = 6
const BADGE_LIST_MARGIN_PX = 4
const BADGE_GAP_PX = 2
const COLON_WIDTH_PX = 5
const REPLY_BLOCK_PX = 18
const ANNOUNCEMENT_HEADER_PX = 28
const ANNOUNCEMENT_BODY_PADDING_Y_PX = 12
const NOTICE_BLOCK_PADDING_Y_PX = 8
const NOTICE_DETAILS_GAP_PX = 4
const FIRST_MESSAGE_BODY_PADDING_Y_PX = 12
const WRAP_SAFETY_PX = 8
const BODY_CHAR_WIDTH_RATIO = 0.58
const USERNAME_CHAR_WIDTH_RATIO = 0.64
const TIMESTAMP_CHAR_WIDTH_PX = 7.2
const FALLBACK_VIEWPORT_WIDTH_PX = 360

const charWidthCache = new Map<string, number>()

export type ChatListLayout = {
  metrics: ChatPresentationMetrics
  viewportWidth: number
  fontFamily: string
  timestampFormat: MessageTimestampFormat
  messageSeparators: boolean
  showTwitchBadges: boolean
  gifAppearance: GifMessageAppearance
}

export function getTimelineItemLineHeight(
  metrics: ChatPresentationMetrics,
  hasEmotes: boolean
) {
  if (!hasEmotes) {
    return metrics.lineHeightPx
  }

  return Math.max(
    metrics.lineHeightPx,
    metrics.emoteSizePx + 2 * metrics.emoteMarginPx
  )
}

export function estimateTimelineItemSize(
  entry: TwitchTimelineItem | undefined,
  layout: ChatListLayout
) {
  if (!entry) {
    return fallbackRowHeight(layout.metrics, false)
  }

  const separator = layout.messageSeparators ? 1 : 0

  switch (entry.kind) {
    case "chat": {
      const display = getReplyDisplayContent(
        entry.message.text,
        entry.message.emotes,
        entry.message.reply,
        entry.message.gifs
      )
      return (
        estimateChatRowHeight({
          text: display.text,
          emotes: display.emotes,
          gifs: display.gifs,
          displayName: entry.message.displayName,
          badgeCount: layout.showTwitchBadges
            ? entry.message.badges.length + (entry.message.sourceRoomId ? 1 : 0)
            : 0,
          hasReply: Boolean(entry.message.reply),
          isFirst: entry.message.flags.isFirst,
          layout,
        }) + separator
      )
    }
    case "suspicious":
      return (
        estimateBannerRowHeight({
          text: entry.message.text,
          emotes: entry.message.emotes,
          displayName: entry.message.displayName,
          badgeCount: layout.showTwitchBadges ? entry.message.badges.length : 0,
          layout,
        }) + separator
      )
    case "automod":
      return (
        estimateBannerRowHeight({
          text: entry.message.text,
          emotes: entry.message.emotes,
          displayName: entry.message.displayName,
          badgeCount: layout.showTwitchBadges ? entry.message.badges.length : 0,
          layout,
        }) + separator
      )
    case "system":
      return estimateSystemRowHeight(entry, layout) + separator
  }
}

function fallbackRowHeight(
  metrics: ChatPresentationMetrics,
  hasEmotes: boolean
) {
  return Math.ceil(
    metrics.rowPaddingY + getTimelineItemLineHeight(metrics, hasEmotes)
  )
}

function estimateChatRowHeight({
  text,
  emotes,
  gifs = [],
  displayName,
  badgeCount,
  hasReply,
  isFirst,
  layout,
}: {
  text: string
  emotes: TwitchEmote[]
  gifs?: TwitchChatGif[]
  displayName: string
  badgeCount: number
  hasReply: boolean
  isFirst: boolean
  layout: ChatListLayout
}) {
  const lineHeight = getTimelineItemLineHeight(
    layout.metrics,
    emotes.length > 0
  )
  const lines = estimateMessageLines({
    text,
    emotes,
    gifs,
    displayName,
    badgeCount,
    layout,
  })
  let height = layout.metrics.rowPaddingY + lines * lineHeight

  if (layout.gifAppearance === "display" && gifs.length > 0) {
    height += gifs.length * layout.metrics.gifMaxHeightPx
  }

  if (hasReply) {
    height += REPLY_BLOCK_PX
  }

  if (isFirst) {
    height += ANNOUNCEMENT_HEADER_PX + FIRST_MESSAGE_BODY_PADDING_Y_PX
  }

  return Math.ceil(height)
}

function estimateBannerRowHeight({
  text,
  emotes,
  gifs = [],
  displayName,
  badgeCount,
  layout,
}: {
  text: string
  emotes: TwitchEmote[]
  gifs?: TwitchChatGif[]
  displayName: string
  badgeCount: number
  layout: ChatListLayout
}) {
  const lineHeight = getTimelineItemLineHeight(
    layout.metrics,
    emotes.length > 0
  )
  const lines = estimateMessageLines({
    text,
    emotes,
    gifs,
    displayName,
    badgeCount,
    layout,
  })
  let height =
    layout.metrics.rowPaddingY +
    ANNOUNCEMENT_HEADER_PX +
    ANNOUNCEMENT_BODY_PADDING_Y_PX +
    lines * lineHeight

  if (layout.gifAppearance === "display" && gifs.length > 0) {
    height += gifs.length * layout.metrics.gifMaxHeightPx
  }

  return Math.ceil(height)
}

function estimateSystemRowHeight(
  entry: Extract<TwitchTimelineItem, { kind: "system" }>,
  layout: ChatListLayout
) {
  const { message } = entry
  const detailsEmotes = message.detailsEmotes ?? []
  const lineHeight = getTimelineItemLineHeight(
    layout.metrics,
    detailsEmotes.length > 0
  )

  if (message.event === "announcement") {
    const lines = estimateMessageLines({
      text: message.details || message.headline,
      emotes: detailsEmotes,
      gifs: [],
      displayName: message.actor?.displayName ?? "",
      badgeCount: layout.showTwitchBadges ? message.badges.length : 0,
      layout,
    })
    return Math.ceil(
      layout.metrics.rowPaddingY +
        ANNOUNCEMENT_HEADER_PX +
        ANNOUNCEMENT_BODY_PADDING_Y_PX +
        lines * lineHeight
    )
  }

  if (message.event === "subscription" || message.event === "raid") {
    const headlineLines = estimateWrappedLines(
      estimateTextWidth(message.headline, layout, USERNAME_CHAR_WIDTH_RATIO) +
        timestampWidth(layout) +
        layout.metrics.badgeSizePx +
        8,
      layout
    )
    const detailsLines = message.details
      ? estimateMessageLines({
          text: message.details,
          emotes: detailsEmotes,
          gifs: [],
          displayName: "",
          badgeCount: 0,
          layout,
        })
      : 0
    return Math.ceil(
      layout.metrics.rowPaddingY +
        NOTICE_BLOCK_PADDING_Y_PX +
        headlineLines * lineHeight +
        (detailsLines > 0
          ? NOTICE_DETAILS_GAP_PX + detailsLines * lineHeight
          : 0)
    )
  }

  return estimateChatRowHeight({
    text: message.text,
    emotes: detailsEmotes,
    gifs: [],
    displayName: message.actor?.displayName ?? "",
    badgeCount: 0,
    hasReply: false,
    isFirst: false,
    layout,
  })
}

function estimateMessageLines({
  text,
  emotes,
  gifs = [],
  displayName,
  badgeCount,
  layout,
}: {
  text: string
  emotes: TwitchEmote[]
  gifs?: TwitchChatGif[]
  displayName: string
  badgeCount: number
  layout: ChatListLayout
}) {
  const prefixWidth =
    timestampWidth(layout) +
    badgeListWidth(badgeCount, layout.metrics) +
    estimateTextWidth(displayName, layout, USERNAME_CHAR_WIDTH_RATIO) +
    COLON_WIDTH_PX
  const bodyWidth = estimateBodyWidth(text, emotes, gifs, layout)
  return estimateWrappedLines(prefixWidth + bodyWidth, layout)
}

function estimateWrappedLines(contentWidth: number, layout: ChatListLayout) {
  const available = Math.max(
    1,
    (layout.viewportWidth > 0
      ? layout.viewportWidth
      : FALLBACK_VIEWPORT_WIDTH_PX) -
      MESSAGE_PADDING_X_PX -
      WRAP_SAFETY_PX
  )
  return Math.max(1, Math.ceil(contentWidth / available))
}

function timestampWidth(layout: ChatListLayout) {
  switch (layout.timestampFormat) {
    case "none":
      return 0
    case "12-hour-meridiem":
      return 8 * TIMESTAMP_CHAR_WIDTH_PX + TIMESTAMP_GAP_PX
    case "12-hour":
      return 5 * TIMESTAMP_CHAR_WIDTH_PX + TIMESTAMP_GAP_PX
    default:
      return 5 * TIMESTAMP_CHAR_WIDTH_PX + TIMESTAMP_GAP_PX
  }
}

function badgeListWidth(badgeCount: number, metrics: ChatPresentationMetrics) {
  if (badgeCount <= 0) {
    return 0
  }

  return (
    badgeCount * metrics.badgeSizePx +
    Math.max(0, badgeCount - 1) * BADGE_GAP_PX +
    BADGE_LIST_MARGIN_PX
  )
}

function estimateBodyWidth(
  text: string,
  emotes: TwitchEmote[],
  gifs: TwitchChatGif[],
  layout: ChatListLayout
) {
  const spans: Array<
    | { kind: "emote"; start: number; consumedEnd: number; emote: TwitchEmote }
    | { kind: "gif"; start: number; consumedEnd: number; gif: TwitchChatGif }
  > = [
    ...gifs.map((gif) => ({
      kind: "gif" as const,
      start: gif.start,
      consumedEnd: getGifConsumedEnd(gif),
      gif,
    })),
    ...emotes.map((emote) => ({
      kind: "emote" as const,
      start: emote.start,
      consumedEnd: getEmoteConsumedEnd(emote),
      emote,
    })),
  ].sort((left, right) => left.start - right.start)

  if (spans.length === 0) {
    return estimateTextWidth(text, layout, BODY_CHAR_WIDTH_RATIO)
  }

  let width = 0
  let cursor = 0
  for (const span of spans) {
    if (span.start < cursor) {
      continue
    }

    if (span.start > cursor) {
      width += estimateTextWidth(
        text.slice(cursor, span.start),
        layout,
        BODY_CHAR_WIDTH_RATIO
      )
    }

    if (span.kind === "gif") {
      if (layout.gifAppearance === "links") {
        width += estimateTextWidth(span.gif.url, layout, BODY_CHAR_WIDTH_RATIO)
      }
    } else {
      width += layout.metrics.emoteSizePx
      if (span.emote.cheermote) {
        width += estimateTextWidth(
          String(span.emote.cheermote.amount),
          layout,
          USERNAME_CHAR_WIDTH_RATIO
        )
      }
    }

    cursor = span.consumedEnd
  }

  if (cursor < text.length) {
    width += estimateTextWidth(
      text.slice(cursor),
      layout,
      BODY_CHAR_WIDTH_RATIO
    )
  }

  return width
}

function estimateTextWidth(
  text: string,
  layout: ChatListLayout,
  ratio: number
) {
  if (!text) {
    return 0
  }

  const measured = measureAverageCharWidth(
    layout.metrics.fontSizePx,
    layout.fontFamily
  )
  const averageCharWidth =
    measured > 0 ? measured : layout.metrics.fontSizePx * BODY_CHAR_WIDTH_RATIO
  return text.length * averageCharWidth * (ratio / BODY_CHAR_WIDTH_RATIO)
}

function measureAverageCharWidth(fontSizePx: number, fontFamily: string) {
  const family = fontFamily.trim() || "sans-serif"
  const cacheKey = `${fontSizePx}:${family}`
  const cached = charWidthCache.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  if (typeof document === "undefined") {
    return 0
  }

  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")
  if (!context) {
    return 0
  }

  context.font = `${fontSizePx}px ${family}`
  const sample =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  const width = context.measureText(sample).width / sample.length
  charWidthCache.set(cacheKey, width)
  return width
}
