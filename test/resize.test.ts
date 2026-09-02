import { describe, expect, test } from "bun:test"

import { clampAdjacentSplitSizes } from "../src/lib/chat/chat-split-layout"
import {
  clampPlayerPercent,
  getPersistedPlayerPercent,
  getPlayerMaxPercent,
} from "../src/lib/player-resize"

describe("player resize bounds", () => {
  test("preserves the chat minimum width", () => {
    expect(getPlayerMaxPercent(340)).toBe(0)
    expect(getPlayerMaxPercent(680)).toBe(50)
    expect(getPlayerMaxPercent(34_000)).toBe(99)
  })

  test("clamps effective sizes without producing invalid numbers", () => {
    expect(clampPlayerPercent(70, 340)).toBe(0)
    expect(clampPlayerPercent(70, 680)).toBe(50)
    expect(clampPlayerPercent(Number.NaN, 680)).toBe(1)
  })

  test("never returns an invalid persisted preference", () => {
    expect(getPersistedPlayerPercent(0, 340)).toBeNull()
    expect(getPersistedPlayerPercent(0, 1_000)).toBe(1)
    expect(getPersistedPlayerPercent(100, 1_000)).toBe(66)
  })
})

describe("split resize bounds", () => {
  test("conserves the adjacent pair total", () => {
    const resized = clampAdjacentSplitSizes([20, 30, 50], 0)
    expect(resized[0]! + resized[1]!).toBe(50)
    expect(resized[2]).toBe(50)
  })

  test("clamps both adjacent panes to the minimum", () => {
    expect(clampAdjacentSplitSizes([49, 1], 0)).toEqual([48, 2])
    expect(clampAdjacentSplitSizes([1, 49], 0)).toEqual([2, 48])
  })

  test("ignores invalid divider indexes", () => {
    const sizes = [50, 50]
    expect(clampAdjacentSplitSizes(sizes, -1)).toBe(sizes)
    expect(clampAdjacentSplitSizes(sizes, 1)).toBe(sizes)
  })
})
