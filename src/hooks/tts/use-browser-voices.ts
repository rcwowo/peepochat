import * as React from "react"

import {
  isSpeechSynthesisSupported,
  listBrowserVoices,
  type BrowserVoice,
} from "@/lib/tts/speech-voices"

export function useBrowserVoices() {
  const [voices, setVoices] = React.useState<BrowserVoice[]>(() =>
    listBrowserVoices()
  )
  const [loading, setLoading] = React.useState(
    () => isSpeechSynthesisSupported() && voices.length === 0
  )

  React.useEffect(() => {
    if (!isSpeechSynthesisSupported()) {
      return
    }

    const synth = window.speechSynthesis
    const update = () => {
      const next = listBrowserVoices()
      setVoices(next)
      if (next.length > 0) {
        setLoading(false)
      }
    }

    update()
    synth.addEventListener("voiceschanged", update)
    const timeout = window.setTimeout(() => setLoading(false), 3000)

    return () => {
      synth.removeEventListener("voiceschanged", update)
      window.clearTimeout(timeout)
    }
  }, [])

  return { voices, loading }
}
