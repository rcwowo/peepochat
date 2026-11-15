import * as React from "react"

import type { TtsSpeechSegment } from "@/lib/tts/speech-text"
import type { SpeechAvailability } from "@/lib/tts/speech-voices"
import type { TtsUiPrefs } from "@/lib/tts/tts-ui-prefs"

export type TtsQueueItem = {
  id: string
  channel: string
  userName: string
  displayName: string
  color: string | null
  voiceProfileId: string
  voiceLabel: string
  segments: TtsSpeechSegment[]
  text: string
}

export type TtsSessionContextValue = {
  channelLogin: string | null
  availability: SpeechAvailability
  startTts: (login: string) => void
  stopTts: () => void
  ui: TtsUiPrefs
  setCollapsed: (collapsed: boolean) => void
  setSidebarWidth: (width: number) => void
}

export type TtsPlaybackContextValue = {
  queue: TtsQueueItem[]
  activeItemId: string | null
  playing: boolean
  queueEnabled: boolean
  setPlaying: (playing: boolean) => void
  togglePlaying: () => void
  setQueueEnabled: (enabled: boolean) => void
  skipCurrent: () => void
  clearQueue: () => void
  removeItem: (id: string) => void
}

export const TtsSessionContext =
  React.createContext<TtsSessionContextValue | null>(null)
export const TtsPlaybackContext =
  React.createContext<TtsPlaybackContextValue | null>(null)

export function useTtsSession() {
  const context = React.useContext(TtsSessionContext)
  if (!context) {
    throw new Error("useTtsSession must be used within a TtsProvider")
  }
  return context
}

export function useTtsPlayback() {
  const context = React.useContext(TtsPlaybackContext)
  if (!context) {
    throw new Error("useTtsPlayback must be used within a TtsProvider")
  }
  return context
}
