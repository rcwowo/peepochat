import type { HotkeyCombo } from "@/lib/hotkeys/bindings"

function isApplePlatform() {
  return (
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform)
  )
}

type HotkeyLabelParts = {
  alt?: boolean
  shift?: boolean
  ctrlOrMeta?: boolean
  key: string
}

export function formatHotkeyLabel(parts: HotkeyLabelParts) {
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

  if (apple) {
    return `${tokens.join("")}${parts.key}`
  }

  return [...tokens, parts.key].join("+")
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

export function formatHotkeyCombo(combo: HotkeyCombo) {
  return formatHotkeyLabel({
    alt: combo.alt,
    shift: combo.shift,
    ctrlOrMeta: combo.ctrlOrMeta,
    key: keyFromCode(combo.code),
  })
}
