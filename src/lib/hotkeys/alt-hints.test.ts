import { afterEach, describe, expect, test } from "bun:test"

import {
  getAltHintKey,
  getSidebarSlotHintKey,
  isAltHintTrigger,
  keepsAltHintsVisible,
} from "@/lib/hotkeys/alt-hints"

function key(code: string, init: KeyboardEventInit = {}) {
  return new KeyboardEvent("keydown", { code, ...init })
}

afterEach(() => {
  delete (navigator as { platform?: string }).platform
})

describe("getAltHintKey", () => {
  test("returns the key for Alt-only bindings", () => {
    expect(getAltHintKey("search.open")).toBe("F")
    expect(getAltHintKey("command-palette.open")).toBe("K")
    expect(getAltHintKey("settings.open")).toBe(".")
    expect(getAltHintKey("notifications.open")).toBe("N")
  })

  test("returns undefined when an action has no Alt-only binding", () => {
    expect(getAltHintKey("dnd.toggle")).toBeUndefined()
  })
})

describe("getSidebarSlotHintKey", () => {
  test("maps slots to their digit keys", () => {
    expect(getSidebarSlotHintKey(0)).toBe("1")
    expect(getSidebarSlotHintKey(8)).toBe("9")
    expect(getSidebarSlotHintKey(9)).toBe("0")
    expect(getSidebarSlotHintKey(10)).toBeUndefined()
    expect(getSidebarSlotHintKey(-1)).toBeUndefined()
  })
})

describe("alt hint key handling", () => {
  test("only a bare Alt press triggers hints", () => {
    expect(isAltHintTrigger(key("AltLeft", { key: "Alt", altKey: true }))).toBe(
      true
    )
    expect(
      isAltHintTrigger(
        key("AltRight", { key: "Alt", altKey: true, ctrlKey: true })
      )
    ).toBe(false)
    expect(isAltHintTrigger(key("KeyF", { key: "f", altKey: true }))).toBe(
      false
    )
  })

  test("keeps hints while switching sidebar slots", () => {
    expect(keepsAltHintsVisible(key("Digit3", { altKey: true }))).toBe(true)
    expect(
      keepsAltHintsVisible(key("AltLeft", { key: "Alt", altKey: true }))
    ).toBe(true)
    expect(keepsAltHintsVisible(key("KeyS", { altKey: true }))).toBe(false)
    expect(
      keepsAltHintsVisible(key("Digit3", { altKey: true, ctrlKey: true }))
    ).toBe(false)
    expect(keepsAltHintsVisible(key("Digit3"))).toBe(false)
  })
})
