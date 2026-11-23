import { HOTKEY_BINDINGS, type HotkeyActionId } from "@/lib/hotkeys/bindings"
import { formatHotkeyComboKeys } from "@/lib/hotkeys/labels"

export const ALT_HINTS_ATTRIBUTE = "data-alt-hints"

function isAltOnlyCombo(combo: (typeof HOTKEY_BINDINGS)[number]["combo"]) {
  return Boolean(combo.alt) && !combo.shift && !combo.ctrlOrMeta
}

function lastKey(keys: string[]) {
  return keys[keys.length - 1]
}

export function getAltHintKey(
  action: Exclude<HotkeyActionId, "sidebar.select">
): string | undefined {
  const binding = HOTKEY_BINDINGS.find(
    (candidate) =>
      candidate.action === action && isAltOnlyCombo(candidate.combo)
  )
  return binding ? lastKey(formatHotkeyComboKeys(binding.combo)) : undefined
}

export function getSidebarSlotHintKey(index: number): string | undefined {
  const binding = HOTKEY_BINDINGS.find(
    (candidate) =>
      candidate.action === "sidebar.select" &&
      candidate.index === index &&
      isAltOnlyCombo(candidate.combo)
  )
  return binding ? lastKey(formatHotkeyComboKeys(binding.combo)) : undefined
}

export function isAltHintTrigger(event: KeyboardEvent) {
  return (
    event.key === "Alt" &&
    event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  )
}

export function keepsAltHintsVisible(event: KeyboardEvent) {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return false
  }
  return event.key === "Alt" || /^Digit\d$/.test(event.code)
}
