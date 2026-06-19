import { getCustomSoundObjectUrl } from "@/lib/highlights/custom-sounds"

export const DEFAULT_ALERT_SOUND_URL = "/sounds/ping.opus"

const audioCache = new Map<string, HTMLAudioElement>()

function getAudioElement(url: string): HTMLAudioElement {
  const cached = audioCache.get(url)
  if (cached) {
    return cached
  }

  const audio = new Audio(url)
  audio.preload = "auto"
  audioCache.set(url, audio)
  return audio
}

export async function resolveAlertSoundUrl(
  customId: string | null | undefined
): Promise<string> {
  if (!customId) {
    return DEFAULT_ALERT_SOUND_URL
  }

  const customUrl = await getCustomSoundObjectUrl(customId)
  return customUrl ?? DEFAULT_ALERT_SOUND_URL
}

export async function playAlertSound(
  options: {
    useDefaultSounds: boolean
    customId: string | null | undefined
  }
) {
  if (typeof window === "undefined") {
    return
  }

  try {
    const customId = options.useDefaultSounds ? null : options.customId
    const url = await resolveAlertSoundUrl(customId)
    const audio = getAudioElement(url)
    audio.currentTime = 0
    await audio.play()
  } catch {
    // Autoplay restrictions or missing files should not break chat.
  }
}

export function preloadAlertSound(customId: string | null | undefined) {
  void resolveAlertSoundUrl(customId).then((url) => {
    getAudioElement(url)
  })
}
