import { describe, expect, test } from "bun:test"

import { updateStableRowStripes } from "../src/lib/chat/chat-row-stripes"

function entry(id: string) {
  return { message: { id } }
}

describe("updateStableRowStripes", () => {
  test("appends stripes without rebuilding when messages are only added", () => {
    const cache = { timeline: null as ReturnType<typeof entry>[] | null }
    const stripes = new Map<string, boolean>()
    const first = [entry("a"), entry("b")]

    updateStableRowStripes(cache, stripes, first)
    expect(stripes.get("a")).toBe(false)
    expect(stripes.get("b")).toBe(true)

    const next = [entry("a"), entry("b"), entry("c")]
    updateStableRowStripes(cache, stripes, next)
    expect(stripes.get("c")).toBe(false)
    expect(stripes.size).toBe(3)
  })

  test("keeps existing stripes across a sliding window", () => {
    const cache = { timeline: null as ReturnType<typeof entry>[] | null }
    const stripes = new Map<string, boolean>()
    const first = [entry("a"), entry("b"), entry("c")]
    updateStableRowStripes(cache, stripes, first)

    const next = [entry("b"), entry("c"), entry("d")]
    updateStableRowStripes(cache, stripes, next)

    expect(stripes.has("a")).toBe(false)
    expect(stripes.get("b")).toBe(true)
    expect(stripes.get("c")).toBe(false)
    expect(stripes.get("d")).toBe(true)
  })
})
