import { describe, expect, test } from "bun:test"

import { normalizeChannelLogin } from "@/lib/twitch/channel/channel"

describe("normalizeChannelLogin", () => {
  test("trims, strips a single leading hash and lowercases", () => {
    expect(normalizeChannelLogin("  #Forsen ")).toBe("forsen")
    expect(normalizeChannelLogin("xQc")).toBe("xqc")
  })

  test("only strips one leading hash", () => {
    expect(normalizeChannelLogin("##chan")).toBe("#chan")
    expect(normalizeChannelLogin("chan#1")).toBe("chan#1")
  })

  test("returns an empty string for blank input", () => {
    expect(normalizeChannelLogin("   ")).toBe("")
    expect(normalizeChannelLogin("#")).toBe("")
  })
})
