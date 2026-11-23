import { afterEach, describe, expect, test } from "bun:test"

import { formatHotkeyCombo, formatHotkeyLabel } from "@/lib/hotkeys/labels"

function setPlatform(platform: string) {
  Object.defineProperty(navigator, "platform", {
    configurable: true,
    get: () => platform,
  })
}

afterEach(() => {
  delete (navigator as { platform?: string }).platform
})

describe("formatHotkeyLabel", () => {
  test("joins modifiers with + in a fixed order on non-Apple platforms", () => {
    setPlatform("Win32")

    expect(
      formatHotkeyLabel({ shift: true, alt: true, ctrlOrMeta: true, key: "K" })
    ).toBe("Ctrl+Alt+Shift+K")
    expect(formatHotkeyLabel({ key: "Esc" })).toBe("Esc")
  })

  test("uses concatenated symbols on Apple platforms", () => {
    for (const platform of ["MacIntel", "iPhone", "iPad"]) {
      setPlatform(platform)

      expect(
        formatHotkeyLabel({
          shift: true,
          alt: true,
          ctrlOrMeta: true,
          key: "K",
        })
      ).toBe("⌘⌥⇧K")
    }
  })

  test("treats Linux as non-Apple", () => {
    setPlatform("Linux x86_64")

    expect(formatHotkeyLabel({ alt: true, key: "S" })).toBe("Alt+S")
  })
})

describe("formatHotkeyCombo", () => {
  test("derives readable keys from key codes", () => {
    setPlatform("Win32")

    expect(formatHotkeyCombo({ alt: true, code: "KeyF" })).toBe("Alt+F")
    expect(formatHotkeyCombo({ alt: true, code: "Digit0" })).toBe("Alt+0")
    expect(formatHotkeyCombo({ alt: true, code: "Period" })).toBe("Alt+.")
    expect(formatHotkeyCombo({ ctrlOrMeta: true, code: "Enter" })).toBe(
      "Ctrl+Enter"
    )
    expect(formatHotkeyCombo({ code: "KeyboardX" })).toBe("KeyboardX")
  })

  test("formats for Apple platforms", () => {
    setPlatform("MacIntel")

    expect(formatHotkeyCombo({ alt: true, shift: true, code: "KeyN" })).toBe(
      "⌥⇧N"
    )
  })
})
