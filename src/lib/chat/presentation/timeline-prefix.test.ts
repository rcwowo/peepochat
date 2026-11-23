import { describe, expect, test } from "bun:test"

import {
  getTimelineWindowShift,
  isTimelineAppend,
  isTimelinePrefix,
} from "@/lib/chat/presentation/timeline-prefix"

function entries(ids: string) {
  return ids.split("").map((id) => ({ message: { id } }))
}

describe("isTimelinePrefix / isTimelineAppend", () => {
  test("compares by message id, not object identity", () => {
    expect(isTimelinePrefix(entries("ab"), entries("abc"))).toBe(true)
    expect(isTimelinePrefix(entries("ab"), entries("ab"))).toBe(true)
    expect(isTimelinePrefix(entries(""), entries("a"))).toBe(true)
    expect(isTimelinePrefix(entries("ab"), entries("ax"))).toBe(false)
    expect(isTimelinePrefix(entries("abc"), entries("ab"))).toBe(false)
  })

  test("append requires at least one new entry", () => {
    expect(isTimelineAppend(entries("ab"), entries("abc"))).toBe(true)
    expect(isTimelineAppend(entries("ab"), entries("ab"))).toBe(false)
    expect(isTimelineAppend(entries("ab"), entries("xbc"))).toBe(false)
  })
})

describe("getTimelineWindowShift", () => {
  test.each([
    ["", "abc", { dropped: 0, addedFrom: 0 }],
    ["", "", { dropped: 0, addedFrom: 0 }],
    ["abc", "abc", { dropped: 0, addedFrom: 3 }],
    ["abc", "abcde", { dropped: 0, addedFrom: 3 }],
    ["abcd", "cdef", { dropped: 2, addedFrom: 2 }],
    ["abc", "bc", { dropped: 1, addedFrom: 2 }],
    ["abc", "cxyz", { dropped: 2, addedFrom: 1 }],
  ])("%p -> %p is a window shift", (previous, next, expected) => {
    expect(getTimelineWindowShift(entries(previous), entries(next))).toEqual(
      expected
    )
  })

  test.each([
    ["abc", ""],
    ["abc", "xyz"],
    ["abc", "ax"],
    ["abc", "bxc"],
    ["abcd", "bc"],
    ["abc", "dab"],
  ])("%p -> %p is not a window shift", (previous, next) => {
    expect(getTimelineWindowShift(entries(previous), entries(next))).toBeNull()
  })
})
