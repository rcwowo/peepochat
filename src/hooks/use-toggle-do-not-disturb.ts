import * as React from "react"
import { toast } from "sonner"

import { usePeepochatSettings } from "@/lib/peepochat/peepochat-context"

export function useToggleDoNotDisturb() {
  const { config, updateConfig } = usePeepochatSettings()
  const enabled = config.highlights.doNotDisturbEnabled

  return React.useCallback(() => {
    const nextEnabled = !enabled
    updateConfig((current) => ({
      ...current,
      highlights: {
        ...current.highlights,
        doNotDisturbEnabled: nextEnabled,
      },
    }))
    toast(nextEnabled ? "Do not disturb is on" : "Do not disturb is off")
  }, [enabled, updateConfig])
}
