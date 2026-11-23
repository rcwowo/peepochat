import * as React from "react"

import {
  ALT_HINTS_ATTRIBUTE,
  isAltHintTrigger,
  keepsAltHintsVisible,
} from "@/lib/hotkeys/alt-hints"
import { getOpenHotkeySurface } from "@/lib/hotkeys/match"

const SHOW_DELAY_MS = 300

export function useAltHints(enabled: boolean) {
  React.useEffect(() => {
    if (!enabled) {
      return
    }

    const root = document.documentElement
    let showTimer: number | null = null

    const cancelShow = () => {
      if (showTimer !== null) {
        window.clearTimeout(showTimer)
        showTimer = null
      }
    }

    const hide = () => {
      cancelShow()
      root.removeAttribute(ALT_HINTS_ATTRIBUTE)
    }

    const show = () => {
      showTimer = null
      if (getOpenHotkeySurface()) {
        return
      }
      root.setAttribute(ALT_HINTS_ATTRIBUTE, "")
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!keepsAltHintsVisible(event)) {
        hide()
        return
      }
      if (
        event.repeat ||
        !isAltHintTrigger(event) ||
        showTimer !== null ||
        root.hasAttribute(ALT_HINTS_ATTRIBUTE)
      ) {
        return
      }
      showTimer = window.setTimeout(show, SHOW_DELAY_MS)
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt" || !event.altKey) {
        hide()
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        hide()
      }
    }

    window.addEventListener("keydown", onKeyDown, true)
    window.addEventListener("keyup", onKeyUp, true)
    window.addEventListener("blur", hide)
    window.addEventListener("pointerdown", hide, true)
    window.addEventListener("click", hide, true)
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      window.removeEventListener("keydown", onKeyDown, true)
      window.removeEventListener("keyup", onKeyUp, true)
      window.removeEventListener("blur", hide)
      window.removeEventListener("pointerdown", hide, true)
      window.removeEventListener("click", hide, true)
      document.removeEventListener("visibilitychange", onVisibilityChange)
      hide()
    }
  }, [enabled])
}
