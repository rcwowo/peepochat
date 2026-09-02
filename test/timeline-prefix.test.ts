import { describe, expect, test } from "bun:test"

import {
  getTimelineWindowShift,
  isTimelineAppend,
} from "../src/lib/chat/timeline-prefix"

function entry(id: string) {
  return { message: { id } }
}

describe("getTimelineWindowShift", () => {
  test("treats a suffix as an append", () => {
    const previous = [entry("a"), entry("b")]
    const next = [entry("a"), entry("b"), entry("c"), entry("d")]

    expect(getTimelineWindowShift(previous, next)).toEqual({
      dropped: 0,
      addedFrom: 2,
    })
    expect(isTimelineAppend(previous, next)).toBe(true)
  })

  test("detects a sliding window at the message cap", () => {
    const previous = [entry("a"), entry("b"), entry("c")]
    const next = [entry("b"), entry("c"), entry("d")]

    expect(getTimelineWindowShift(previous, next)).toEqual({
      dropped: 1,
      addedFrom: 2,
    })
    expect(isTimelineAppend(previous, next)).toBe(false)
  })

  test("detects dropping more than one message in a batch", () => {
    const previous = [entry("a"), entry("b"), entry("c"), entry("d")]
    const next = [entry("c"), entry("d"), entry("e"), entry("f")]

    expect(getTimelineWindowShift(previous, next)).toEqual({
      dropped: 2,
      addedFrom: 2,
    })
  })

  test("returns null when the sequences do not overlap", () => {
    expect(
      getTimelineWindowShift([entry("a"), entry("b")], [entry("c"), entry("d")])
    ).toBeNull()
  })
})
