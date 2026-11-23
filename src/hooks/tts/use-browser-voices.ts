import * as React from "react"

import {
  getBrowserVoicesSnapshot,
  getSpeechAvailability,
  subscribeBrowserVoices,
} from "@/lib/tts/speech-voices"

function useBrowserVoicesSnapshot() {
  return React.useSyncExternalStore(
    subscribeBrowserVoices,
    getBrowserVoicesSnapshot,
    getBrowserVoicesSnapshot
  )
}

export function useBrowserVoices() {
  const snapshot = useBrowserVoicesSnapshot()
  return { voices: snapshot.voices, loading: !snapshot.settled }
}

export function useSpeechAvailability() {
  return getSpeechAvailability(useBrowserVoicesSnapshot())
}
