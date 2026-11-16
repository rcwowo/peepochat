import { describe, expect, test } from "bun:test"

import { codePointRangeToUtf16Indices } from "@/lib/twitch/emotes/positions"

describe("codePointRangeToUtf16Indices", () => {
  test("returns identical indices for BMP-only text", () => {
    expect(codePointRangeToUtf16Indices("hello Kappa", 6, 10)).toEqual({
      start: 6,
      end: 10,
    })
  })

  test("shifts indices past a preceding astral emoji", () => {
    const text = "😀 Kappa"
    const range = codePointRangeToUtf16Indices(text, 2, 6)

    expect(range).toEqual({ start: 3, end: 7 })
    expect(text.slice(range!.start, range!.end + 1)).toBe("Kappa")
  })

  test("covers both code units when the range ends on an astral character", () => {
    const text = "Kappa 😀"
    const range = codePointRangeToUtf16Indices(text, 6, 6)

    expect(range).toEqual({ start: 6, end: 7 })
    expect(text.slice(range!.start, range!.end + 1)).toBe("😀")
  })

  test("handles multiple emoji before the emote", () => {
    const text = "👍👍👍 LUL"
    const range = codePointRangeToUtf16Indices(text, 4, 6)

    expect(text.slice(range!.start, range!.end + 1)).toBe("LUL")
  })

  test("clamps an end past the text to the last character", () => {
    expect(codePointRangeToUtf16Indices("abc", 1, 50)).toEqual({
      start: 1,
      end: 2,
    })
  })

  test("rejects negative starts, inverted ranges and out-of-bounds starts", () => {
    expect(codePointRangeToUtf16Indices("abc", -1, 1)).toBeNull()
    expect(codePointRangeToUtf16Indices("abc", 2, 1)).toBeNull()
    expect(codePointRangeToUtf16Indices("abc", 3, 4)).toBeNull()
    expect(codePointRangeToUtf16Indices("", 0, 0)).toBeNull()
  })
})
