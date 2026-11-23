import { describe, expect, test } from "bun:test"

import {
  getHotkeyKeys,
  getTypedChannelLogin,
  resolveCommandPaletteTarget,
} from "@/lib/command-palette/command-palette"

describe("resolveCommandPaletteTarget", () => {
  const base = {
    playerViewActive: false,
    playerChatLogin: null,
    lastFocusedLogin: null,
    activeChannelLogin: "",
    visibleChannelLogins: [] as string[],
  }

  test("uses the player chat when the player is active", () => {
    expect(
      resolveCommandPaletteTarget({
        ...base,
        playerViewActive: true,
        playerChatLogin: "foo",
        lastFocusedLogin: "bar",
        visibleChannelLogins: ["bar"],
      })
    ).toBe("foo")
  })

  test("prefers the last focused pane when it is visible", () => {
    expect(
      resolveCommandPaletteTarget({
        ...base,
        lastFocusedLogin: "bar",
        activeChannelLogin: "foo",
        visibleChannelLogins: ["foo", "bar"],
      })
    ).toBe("bar")
  })

  test("ignores a last focused pane that is no longer visible", () => {
    expect(
      resolveCommandPaletteTarget({
        ...base,
        lastFocusedLogin: "gone",
        activeChannelLogin: "foo",
        visibleChannelLogins: ["foo", "bar"],
      })
    ).toBe("foo")
  })

  test("falls back to the first visible channel", () => {
    expect(
      resolveCommandPaletteTarget({
        ...base,
        activeChannelLogin: "gone",
        visibleChannelLogins: ["bar", "foo"],
      })
    ).toBe("bar")
  })

  test("returns null when nothing is visible", () => {
    expect(resolveCommandPaletteTarget(base)).toBeNull()
  })
})

describe("getTypedChannelLogin", () => {
  test("normalizes a valid unknown login", () => {
    expect(getTypedChannelLogin("  #SomeStreamer ", [])).toBe("somestreamer")
  })

  test("ignores logins that are already added", () => {
    expect(getTypedChannelLogin("Foo_Bar", ["foo_bar"])).toBeNull()
  })

  test("rejects text that cannot be a Twitch login", () => {
    expect(getTypedChannelLogin("", [])).toBeNull()
    expect(getTypedChannelLogin("ab", [])).toBeNull()
    expect(getTypedChannelLogin("reload emotes", [])).toBeNull()
    expect(getTypedChannelLogin("a".repeat(26), [])).toBeNull()
  })
})

describe("getHotkeyKeys", () => {
  test("splits the first binding for an action into keys", () => {
    expect(getHotkeyKeys("emotes.reload")).toEqual(["Alt", "R"])
    expect(getHotkeyKeys("dnd.toggle")).toEqual(["Alt", "Shift", "N"])
  })
})
