export type BrowserVoice = {
  name: string
  lang: string
  localService: boolean
}

export function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  )
}

export function listBrowserVoices(): BrowserVoice[] {
  if (!isSpeechSynthesisSupported()) {
    return []
  }

  return window.speechSynthesis
    .getVoices()
    .map((voice) => ({
      name: voice.name,
      lang: voice.lang,
      localService: voice.localService,
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
}

export type BrowserVoicesSnapshot = {
  voices: BrowserVoice[]
  settled: boolean
}

export type SpeechAvailability = "checking" | "available" | "unavailable"

const VOICE_SETTLE_TIMEOUT_MS = 3000

let voicesSnapshot: BrowserVoicesSnapshot | null = null
let voiceStoreStarted = false
const voiceListeners = new Set<() => void>()

function sameVoices(left: BrowserVoice[], right: BrowserVoice[]) {
  return (
    left.length === right.length &&
    left.every(
      (voice, index) =>
        voice.name === right[index]?.name &&
        voice.lang === right[index]?.lang &&
        voice.localService === right[index]?.localService
    )
  )
}

function refreshBrowserVoices(settle: boolean) {
  const voices = listBrowserVoices()
  const previous = getBrowserVoicesSnapshot()
  const settled = previous.settled || settle || voices.length > 0

  if (previous.settled === settled && sameVoices(previous.voices, voices)) {
    return
  }

  voicesSnapshot = { voices, settled }
  for (const listener of voiceListeners) {
    listener()
  }
}

function startBrowserVoiceStore() {
  if (voiceStoreStarted || !isSpeechSynthesisSupported()) {
    return
  }
  voiceStoreStarted = true
  window.speechSynthesis.addEventListener("voiceschanged", () =>
    refreshBrowserVoices(false)
  )
  window.setTimeout(() => refreshBrowserVoices(true), VOICE_SETTLE_TIMEOUT_MS)
  refreshBrowserVoices(false)
}

export function getBrowserVoicesSnapshot(): BrowserVoicesSnapshot {
  if (!voicesSnapshot) {
    const voices = listBrowserVoices()
    voicesSnapshot = {
      voices,
      settled: !isSpeechSynthesisSupported() || voices.length > 0,
    }
  }
  return voicesSnapshot
}

export function subscribeBrowserVoices(listener: () => void) {
  voiceListeners.add(listener)
  startBrowserVoiceStore()
  return () => {
    voiceListeners.delete(listener)
  }
}

export function getSpeechAvailability(
  snapshot: BrowserVoicesSnapshot
): SpeechAvailability {
  if (snapshot.voices.length > 0) {
    return "available"
  }
  return snapshot.settled ? "unavailable" : "checking"
}

export function findSynthVoice(name: string): SpeechSynthesisVoice | null {
  if (!name || !isSpeechSynthesisSupported()) {
    return null
  }
  return (
    window.speechSynthesis.getVoices().find((voice) => voice.name === name) ??
    null
  )
}

export function configRateToSpeechRate(value: number): number {
  if (value >= 0) {
    return 1 + (value / 100) * 2
  }
  return Math.max(0.1, 1 + (value / 100) * 0.9)
}

export function configPitchToSpeechPitch(value: number): number {
  return Math.max(0, Math.min(2, 1 + value / 100))
}

export function configVolumeToSpeechVolume(value: number): number {
  if (value >= 0) {
    return 1
  }
  return Math.max(0, (100 + value) / 100)
}

export function createProfileUtterance(
  text: string,
  profile: { voice: string; rate: number; pitch: number; volume: number }
): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(text)
  const voice = findSynthVoice(profile.voice)
  if (voice) {
    utterance.voice = voice
    utterance.lang = voice.lang
  }
  utterance.rate = configRateToSpeechRate(profile.rate)
  utterance.pitch = configPitchToSpeechPitch(profile.pitch)
  utterance.volume = configVolumeToSpeechVolume(profile.volume)
  return utterance
}
