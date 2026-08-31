import * as React from "react"

import { HotkeyRegistryContext } from "@/lib/hotkeys/hotkey-registry.shared"

export function useHotkeyRegistry() {
  const value = React.useContext(HotkeyRegistryContext)
  if (!value) {
    throw new Error(
      "useHotkeyRegistry must be used within HotkeyRegistryProvider"
    )
  }
  return value
}
