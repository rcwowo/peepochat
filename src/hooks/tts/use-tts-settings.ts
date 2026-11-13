import * as React from "react"

import { usePeepochatSettings } from "@/lib/peepochat/peepochat-context"
import type { TtsConfig } from "@/lib/tts/tts-config"

export function useTtsSettings() {
  const { config, updateConfig } = usePeepochatSettings()

  const updateTts = React.useCallback(
    (updater: Partial<TtsConfig> | ((current: TtsConfig) => TtsConfig)) => {
      updateConfig((current) => {
        const nextTts =
          typeof updater === "function"
            ? updater(current.tts)
            : { ...current.tts, ...updater }
        return nextTts === current.tts ? current : { ...current, tts: nextTts }
      })
    },
    [updateConfig]
  )

  return { tts: config.tts, updateTts }
}
