import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { getReadableUsernameColor } from "@/lib/chat/presentation/username"

let previousBackground = ""

beforeAll(() => {
  previousBackground = document.body.style.backgroundColor
  document.body.style.backgroundColor = "#000000"
})

afterAll(() => {
  document.body.style.backgroundColor = previousBackground
})

function hexToRgb(hex: string) {
  const value = hex.replace("#", "")
  return [0, 2, 4].map((offset) =>
    Number.parseInt(value.slice(offset, offset + 2), 16)
  ) as [number, number, number]
}

function luminance([r, g, b]: [number, number, number]) {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
}

function contrastAgainstBlack(hex: string) {
  return (luminance(hexToRgb(hex)) + 0.05) / 0.05
}

describe("getReadableUsernameColor on a dark background", () => {
  test("passes through missing colors", () => {
    expect(getReadableUsernameColor(null)).toBeUndefined()
    expect(getReadableUsernameColor(undefined)).toBeUndefined()
  })

  test("keeps colors that already have enough contrast", () => {
    expect(getReadableUsernameColor("#FF7F50")).toBe("#FF7F50")
    expect(getReadableUsernameColor("rgb(255, 255, 255)")).toBe(
      "rgb(255, 255, 255)"
    )
  })

  test("lightens dark colors until they are readable", () => {
    const adjusted = getReadableUsernameColor("#0000FF")!
    expect(adjusted).toMatch(/^#[0-9a-f]{6}$/)
    expect(contrastAgainstBlack(adjusted)).toBeGreaterThanOrEqual(4.5)

    const [r, g, b] = hexToRgb(adjusted)
    expect(r).toBeGreaterThan(0)
    expect(g).toBeGreaterThan(0)
    expect(b).toBe(255)
  })

  test("treats shorthand hex and rgb() the same as full hex", () => {
    const full = getReadableUsernameColor("#000088")
    expect(getReadableUsernameColor("#008")).toBe(full!)
    expect(getReadableUsernameColor("rgb(0, 0, 136)")).toBe(full!)
  })

  test("returns unparseable colors unchanged", () => {
    expect(getReadableUsernameColor("hotpink")).toBe("hotpink")
    expect(getReadableUsernameColor("#12345")).toBe("#12345")
  })

  test("returns the same answer on repeated lookups", () => {
    const first = getReadableUsernameColor("#1E1E1E")
    expect(getReadableUsernameColor("#1E1E1E")).toBe(first!)
    expect(contrastAgainstBlack(first!)).toBeGreaterThanOrEqual(4.5)
  })
})
