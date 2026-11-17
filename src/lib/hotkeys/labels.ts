import type { HotkeyCombo } from "@/lib/hotkeys/bindings"
import { isApplePlatform } from "@/lib/hotkeys/platform"

type HotkeyLabelParts = {
  alt?: boolean
  shift?: boolean
  ctrlOrMeta?: boolean
  key: string
}

export function formatHotkeyKeys(parts: HotkeyLabelParts) {
  const apple = isApplePlatform()
  const tokens: string[] = []

  if (parts.ctrlOrMeta) {
    tokens.push(apple ? "⌘" : "Ctrl")
  }
  if (parts.alt) {
    tokens.push(apple ? "⌥" : "Alt")
  }
  if (parts.shift) {
    tokens.push(apple ? "⇧" : "Shift")
  }

  return [...tokens, parts.key]
}

export function formatHotkeyLabel(parts: HotkeyLabelParts) {
  const keys = formatHotkeyKeys(parts)
  return isApplePlatform() ? keys.join("") : keys.join("+")
}

function keyFromCode(code: string) {
  if (code.startsWith("Key") && code.length === 4) {
    return code.slice(3)
  }
  if (code.startsWith("Digit") && code.length === 6) {
    return code.slice(5)
  }
  if (code === "Period") {
    return "."
  }
  return code
}

function comboParts(combo: HotkeyCombo): HotkeyLabelParts {
  return {
    alt: combo.alt,
    shift: combo.shift,
    ctrlOrMeta: combo.ctrlOrMeta,
    key: keyFromCode(combo.code),
  }
}

export function formatHotkeyComboKeys(combo: HotkeyCombo) {
  return formatHotkeyKeys(comboParts(combo))
}

export function formatHotkeyCombo(combo: HotkeyCombo) {
  return formatHotkeyLabel(comboParts(combo))
}
