import { describe, expect, test } from "bun:test"

import {
  getChatPresentationMetrics,
  getChatPresentationStyle,
} from "@/lib/chat/presentation/presentation-style"
import {
  CHAT_EMOTE_SCALE_DEFAULT,
  CHAT_FONT_SIZE_DEFAULT,
} from "@/lib/peepochat/peepochat-config"

const DEFAULTS = {
  fontSizePx: CHAT_FONT_SIZE_DEFAULT,
  emoteScale: CHAT_EMOTE_SCALE_DEFAULT,
}

describe("getChatPresentationMetrics", () => {
  test("uses the nominal emote overlap at default settings", () => {
    const metrics = getChatPresentationMetrics(DEFAULTS)
    expect(metrics.emoteSizePx).toBe(28)
    expect(metrics.extraRowPaddingPx).toBe(0)
    expect(metrics.rowPaddingY).toBe(8)
    expect(metrics.emoteMarginPx).toBeCloseTo(-5.6)
    expect(metrics.lineHeightPx).toBeCloseTo(CHAT_FONT_SIZE_DEFAULT * 1.25)
  })

  test("scales emotes and gifs with the emote scale", () => {
    const metrics = getChatPresentationMetrics({
      ...DEFAULTS,
      emoteScale: CHAT_EMOTE_SCALE_DEFAULT * 2,
    })
    expect(metrics.emoteSizePx).toBe(56)
    expect(metrics.gifMaxHeightPx).toBe(280)
    expect(metrics.emoteMarginPx).toBe(0)
    expect(metrics.extraRowPaddingPx).toBeGreaterThan(0)
    expect(metrics.rowPaddingY).toBeCloseTo(8 + 2 * metrics.extraRowPaddingPx)
  })

  test("never lets an emote line collapse below the text line height", () => {
    for (const fontSizePx of [10, 13, 18, 24]) {
      for (const emoteScale of [6, 10, 13, 16, 20, 26, 40]) {
        const metrics = getChatPresentationMetrics({ fontSizePx, emoteScale })
        expect(
          metrics.emoteSizePx + 2 * metrics.emoteMarginPx
        ).toBeGreaterThanOrEqual(metrics.lineHeightPx - 1e-9)
        expect(metrics.extraRowPaddingPx).toBeGreaterThanOrEqual(0)
        expect(metrics.emoteMarginPx).toBeLessThanOrEqual(
          Math.max(0, (metrics.lineHeightPx - metrics.emoteSizePx) / 2) + 1e-9
        )
      }
    }
  })

  test("scales badges with the font size", () => {
    expect(
      getChatPresentationMetrics({ ...DEFAULTS, fontSizePx: 13 }).badgeSizePx
    ).toBeCloseTo(18)
    expect(
      getChatPresentationMetrics({ ...DEFAULTS, fontSizePx: 26 }).badgeSizePx
    ).toBeCloseTo(36)
  })
})

describe("getChatPresentationStyle", () => {
  test("exposes the metrics as CSS variables", () => {
    const style = getChatPresentationStyle(DEFAULTS) as Record<string, string>
    expect(style["--chat-font-size"]).toBe("13px")
    expect(style["--chat-emote-size"]).toBe("28px")
    expect(style["--chat-emote-margin"]).toBe("-5.60px")
    expect(style["--chat-message-extra-padding-block"]).toBe("0px")
    expect("fontFamily" in style).toBe(false)
  })

  test("adds the font family only when provided", () => {
    expect(
      getChatPresentationStyle(DEFAULTS, "Inter, sans-serif").fontFamily
    ).toBe("Inter, sans-serif")
    expect("fontFamily" in getChatPresentationStyle(DEFAULTS, "")).toBe(false)
  })
})
