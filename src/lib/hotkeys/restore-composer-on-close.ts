import * as React from "react"

import { HotkeyRegistryContext } from "@/lib/hotkeys/hotkey-registry.shared"
import { isOverlayElementOpen } from "@/lib/hotkeys/match"

const OPEN_OVERLAY_SLOTS = [
  "dialog-content",
  "sheet-content",
  "popover-content",
  "dropdown-menu-content",
  "dropdown-menu-sub-content",
  "select-content",
  "context-menu-content",
  "context-menu-sub-content",
] as const

function hasOtherOpenOverlay(closing: EventTarget | null) {
  const closingNode = closing instanceof Node ? closing : null

  for (const slot of OPEN_OVERLAY_SLOTS) {
    for (const element of document.querySelectorAll(`[data-slot="${slot}"]`)) {
      if (
        closingNode &&
        (element === closingNode || element.contains(closingNode))
      ) {
        continue
      }

      if (isOverlayElementOpen(element)) {
        return true
      }
    }
  }

  return false
}

export function useOverlayCloseAutoFocus(
  onCloseAutoFocus?: (event: Event) => void
) {
  const registry = React.useContext(HotkeyRegistryContext)

  return React.useCallback(
    (event: Event) => {
      onCloseAutoFocus?.(event)
      if (!registry) {
        return
      }
      if (hasOtherOpenOverlay(event.currentTarget ?? event.target)) {
        return
      }

      if (registry.restoreLastComposerFocus()) {
        event.preventDefault()
      }
    },
    [onCloseAutoFocus, registry]
  )
}
