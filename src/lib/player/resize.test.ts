import { describe, expect, test } from "bun:test"

import {
  PLAYER_CHAT_MIN_WIDTH_PX,
  PLAYER_DESKTOP_SIZE_MAX,
  PLAYER_DESKTOP_SIZE_MIN,
} from "@/lib/peepochat/peepochat-config"
import {
  clampPlayerPercent,
  getPersistedPlayerPercent,
  getPlayerMaxPercent,
} from "@/lib/player/resize"

const chat = PLAYER_CHAT_MIN_WIDTH_PX

describe("getPlayerMaxPercent", () => {
  test("leaves room for the minimum chat width", () => {
    expect(getPlayerMaxPercent(chat * 2)).toBe(50)
    expect(getPlayerMaxPercent(chat * 4)).toBe(75)
  })

  test("caps at the desktop maximum on very wide containers", () => {
    expect(getPlayerMaxPercent(1_000_000)).toBe(PLAYER_DESKTOP_SIZE_MAX)
  })

  test("is zero when the container cannot fit the chat", () => {
    expect(getPlayerMaxPercent(chat)).toBe(0)
    expect(getPlayerMaxPercent(chat / 2)).toBe(0)
  })

  test("falls back to the maximum for unknown widths", () => {
    for (const width of [0, -1, Number.NaN, Infinity]) {
      expect(getPlayerMaxPercent(width)).toBe(PLAYER_DESKTOP_SIZE_MAX)
    }
  })
})

describe("clampPlayerPercent", () => {
  test("clamps into [0, max]", () => {
    expect(clampPlayerPercent(80, chat * 2)).toBe(50)
    expect(clampPlayerPercent(30, chat * 2)).toBe(30)
    expect(clampPlayerPercent(-5, chat * 2)).toBe(0)
  })

  test("treats non-finite percents as the minimum", () => {
    expect(clampPlayerPercent(Number.NaN, chat * 2)).toBe(
      PLAYER_DESKTOP_SIZE_MIN
    )
    expect(clampPlayerPercent(Infinity, chat * 2)).toBe(PLAYER_DESKTOP_SIZE_MIN)
  })
})

describe("getPersistedPlayerPercent", () => {
  test("rounds and clamps to the persisted range", () => {
    expect(getPersistedPlayerPercent(33.6, chat * 2)).toBe(34)
    expect(getPersistedPlayerPercent(0.2, chat * 2)).toBe(
      PLAYER_DESKTOP_SIZE_MIN
    )
    expect(getPersistedPlayerPercent(70, chat * 2)).toBe(50)
  })

  test("floors the container maximum so a rounded value never exceeds it", () => {
    const width = chat / (1 - 0.507)

    expect(getPlayerMaxPercent(width)).toBeCloseTo(50.7, 6)
    expect(getPersistedPlayerPercent(50.7, width)).toBe(50)
  })

  test("returns null when the player cannot be persisted at the minimum size", () => {
    expect(getPersistedPlayerPercent(50, chat)).toBeNull()
    expect(getPersistedPlayerPercent(50, chat + 1)).toBeNull()
  })
})
