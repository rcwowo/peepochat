import {
  HOTKEY_BINDINGS,
  type HotkeyActionId,
  type HotkeyBinding,
  type HotkeyCombo,
} from "@/lib/hotkeys/bindings"

export type HotkeyMatch = {
  action: HotkeyActionId
  binding: HotkeyBinding
  index?: number
}

function comboMatches(event: KeyboardEvent, combo: HotkeyCombo) {
  const wantsCtrlOrMeta = Boolean(combo.ctrlOrMeta)
  const hasCtrlOrMeta = event.ctrlKey || event.metaKey
  if (wantsCtrlOrMeta !== hasCtrlOrMeta) {
    return false
  }

  if (Boolean(combo.alt) !== event.altKey) {
    return false
  }

  if (Boolean(combo.shift) !== event.shiftKey) {
    return false
  }

  return event.code === combo.code
}

export function matchHotkey(event: KeyboardEvent): HotkeyMatch | null {
  if (event.defaultPrevented || event.repeat || event.isComposing) {
    return null
  }

  for (const binding of HOTKEY_BINDINGS) {
    if (!comboMatches(event, binding.combo)) {
      continue
    }

    if (binding.action === "sidebar.select") {
      return {
        action: binding.action,
        binding,
        index: binding.index,
      }
    }

    return { action: binding.action, binding }
  }

  return null
}

export function isOverlayElementOpen(element: Element) {
  if (element.hasAttribute("data-closed")) {
    return false
  }

  const state = element.getAttribute("data-state")
  return state !== "closed"
}

function queryOpenOverlay(selector: string) {
  for (const element of document.querySelectorAll(selector)) {
    if (isOverlayElementOpen(element)) {
      return element
    }
  }

  return null
}

export function getOpenHotkeySurface(): string | null {
  const marked = queryOpenOverlay("[data-hotkey-surface]")
  const surface = marked?.getAttribute("data-hotkey-surface")
  if (surface) {
    return surface
  }

  if (queryOpenOverlay('[data-slot="sheet-content"]')) {
    return "sheet"
  }

  if (queryOpenOverlay('[data-slot="dialog-content"]')) {
    return "dialog"
  }

  return null
}

export function canRestoreComposerFocus() {
  const surface = getOpenHotkeySurface()
  return !surface || surface === "viewer-list"
}

export function isComposerActive() {
  return Boolean(
    document.activeElement instanceof HTMLElement &&
    document.activeElement.closest("[data-chat-composer]")
  )
}

export function getSearchPrefill() {
  const selection = window.getSelection()?.toString().trim() ?? ""
  if (
    selection.length > 0 &&
    selection.length <= 80 &&
    !selection.includes("\n")
  ) {
    return selection
  }

  return undefined
}
