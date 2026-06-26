import type * as React from "react"

import {
  CHAT_EMOTE_SCALE_DEFAULT,
  CHAT_FONT_SIZE_DEFAULT,
  type ChatConfig,
} from "@/lib/peepochat/peepochat-config"

const CHAT_BASE_EMOTE_SIZE_PX = 28
const CHAT_LINE_HEIGHT_MULTIPLIER = 1.25
const CHAT_EMOTE_MARGIN_REM = -0.35
const CHAT_ROOT_FONT_SIZE_PX = 16
const CHAT_NOMINAL_EMOTE_OVERFLOW_PX =
  CHAT_BASE_EMOTE_SIZE_PX - CHAT_FONT_SIZE_DEFAULT * CHAT_LINE_HEIGHT_MULTIPLIER
const CHAT_ROW_PADDING_OVERFLOW_FACTOR = 0.4

function getDesiredEmoteMarginPx(emoteScaleRatio: number): number {
  return CHAT_EMOTE_MARGIN_REM * emoteScaleRatio * CHAT_ROOT_FONT_SIZE_PX
}

function getCappedEmoteMarginPx(
  emoteSizePx: number,
  lineHeightPx: number,
  emoteScaleRatio: number
): number {
  const desiredMarginPx = getDesiredEmoteMarginPx(emoteScaleRatio)
  const overflowPx = emoteSizePx - lineHeightPx
  const overflowBeyondNominal = Math.max(
    0,
    overflowPx - CHAT_NOMINAL_EMOTE_OVERFLOW_PX
  )
  const intralineBreakT = Math.min(
    1,
    overflowBeyondNominal / CHAT_NOMINAL_EMOTE_OVERFLOW_PX
  )
  const targetNetLinePx =
    lineHeightPx + (emoteSizePx - lineHeightPx) * intralineBreakT
  const minMarginPx = (targetNetLinePx - emoteSizePx) / 2

  return Math.max(desiredMarginPx, minMarginPx)
}

export function getChatPresentationStyle(
  chat: Pick<ChatConfig, "fontSizePx" | "emoteScale">,
  cssFontFamily?: string
): React.CSSProperties {
  const emoteScaleRatio = chat.emoteScale / CHAT_EMOTE_SCALE_DEFAULT
  const lineHeightPx = chat.fontSizePx * CHAT_LINE_HEIGHT_MULTIPLIER
  const emoteSizePx = Math.round(CHAT_BASE_EMOTE_SIZE_PX * emoteScaleRatio)
  const overflowPx = emoteSizePx - lineHeightPx
  const extraRowPaddingPx = Math.max(
    0,
    (overflowPx - CHAT_NOMINAL_EMOTE_OVERFLOW_PX) *
      CHAT_ROW_PADDING_OVERFLOW_FACTOR
  )
  const emoteMarginPx = getCappedEmoteMarginPx(
    emoteSizePx,
    lineHeightPx,
    emoteScaleRatio
  )

  return {
    "--chat-font-size": `${chat.fontSizePx}px`,
    "--chat-line-height": `${lineHeightPx}px`,
    "--chat-emote-size": `${emoteSizePx}px`,
    "--chat-emote-margin": `${emoteMarginPx.toFixed(2)}px`,
    "--chat-message-extra-padding-block": `${extraRowPaddingPx}px`,
    ...(cssFontFamily ? { fontFamily: cssFontFamily } : {}),
  } as React.CSSProperties
}
