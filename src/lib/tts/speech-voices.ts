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
