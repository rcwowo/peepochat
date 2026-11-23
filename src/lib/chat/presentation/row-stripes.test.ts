import { describe, expect, test } from "bun:test"

import {
  pruneRowStripes,
  reconcileStableRowStripes,
  updateStableRowStripes,
  type RowStripeCache,
} from "@/lib/chat/presentation/row-stripes"

type Entry = { message: { id: string } }

function entries(ids: string): Entry[] {
  return ids.split("").map((id) => ({ message: { id } }))
}

function stripes(map: Map<string, boolean>, ids: string) {
  return ids
    .split("")
    .map((id) => (map.get(id) ? "1" : "0"))
    .join("")
}

describe("reconcileStableRowStripes", () => {
  test("alternates from the top for a fresh timeline", () => {
    const map = reconcileStableRowStripes(new Map(), entries("abcde"))
    expect(stripes(map, "abcde")).toBe("01010")
  })

  test("keeps existing stripes when older rows are trimmed", () => {
    const map = reconcileStableRowStripes(new Map(), entries("abcde"))
    reconcileStableRowStripes(map, entries("cdefg"))
    expect(stripes(map, "cdefg")).toBe("01010")
    expect(map.has("a")).toBe(false)
    expect(map.has("b")).toBe(false)
  })

  test("extends stripes backwards when history is prepended", () => {
    const map = reconcileStableRowStripes(new Map(), entries("cd"))
    reconcileStableRowStripes(map, entries("xyzcd"))
    expect(stripes(map, "xyzcd")).toBe("10101")
  })

  test("fills new rows in the middle relative to their predecessor", () => {
    const map = reconcileStableRowStripes(new Map(), entries("ab"))
    reconcileStableRowStripes(map, entries("axb"))
    expect(stripes(map, "axb")).toBe("011")
  })
})

describe("pruneRowStripes", () => {
  test("drops stripes for rows that are no longer visible", () => {
    const map = reconcileStableRowStripes(new Map(), entries("abc"))
    pruneRowStripes(map, entries("b"))
    expect([...map.keys()]).toEqual(["b"])
  })
})

describe("updateStableRowStripes", () => {
  test("appends and trims incrementally without flipping existing rows", () => {
    const cache: RowStripeCache<Entry> = { timeline: null }
    const map = new Map<string, boolean>()

    updateStableRowStripes(cache, map, entries("abc"))
    expect(stripes(map, "abc")).toBe("010")

    updateStableRowStripes(cache, map, entries("abcd"))
    expect(stripes(map, "abcd")).toBe("0101")

    updateStableRowStripes(cache, map, entries("cdef"))
    expect(stripes(map, "cdef")).toBe("0101")
    expect([...map.keys()].sort()).toEqual(["c", "d", "e", "f"])
  })

  test("matches a full reconcile after each window shift", () => {
    const cache: RowStripeCache<Entry> = { timeline: null }
    const incremental = new Map<string, boolean>()
    const reconciled = new Map<string, boolean>()

    for (const window of ["abc", "abcde", "cdefg", "fghij", "ij"]) {
      updateStableRowStripes(cache, incremental, entries(window))
      reconcileStableRowStripes(reconciled, entries(window))
      expect(stripes(incremental, window)).toBe(stripes(reconciled, window))
      expect(incremental.size).toBe(window.length)
    }
  })

  test("falls back to reconciling when the timeline changes shape", () => {
    const cache: RowStripeCache<Entry> = { timeline: null }
    const map = new Map<string, boolean>()
    updateStableRowStripes(cache, map, entries("abcd"))
    updateStableRowStripes(cache, map, entries("acd"))

    expect(stripes(map, "acd")).toBe("001")
    expect(map.has("b")).toBe(false)
    expect(cache.timeline?.map((entry) => entry.message.id)).toEqual([
      "a",
      "c",
      "d",
    ])
  })
})
