import { getCustomSoundObjectUrl } from "@/lib/highlights/custom-sounds"

export type AlertSoundKind = "ping" | "live"

const DEFAULT_SOUND_URLS: Record<AlertSoundKind, string> = {
  ping: "/sounds/ping.opus",
  live: "/sounds/ping.opus",
}

export const DEFAULT_PING_SOUND_URL = DEFAULT_SOUND_URLS.ping
export const DEFAULT_LIVE_SOUND_URL = DEFAULT_SOUND_URLS.live

export function getDefaultAlertSoundUrl(kind: AlertSoundKind): string {
  return DEFAULT_SOUND_URLS[kind]
}

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
  customId: string | null | undefined,
  kind: AlertSoundKind
): Promise<string> {
  const fallback = DEFAULT_SOUND_URLS[kind]

  if (!customId) {
    return fallback
  }

  const customUrl = await getCustomSoundObjectUrl(customId)
  return customUrl ?? fallback
}

export async function playAlertSound(options: {
  useDefaultSounds: boolean
  customId: string | null | undefined
  kind: AlertSoundKind
}) {
  if (typeof window === "undefined") {
    return
  }

  try {
    const customId = options.useDefaultSounds ? null : options.customId
    const url = await resolveAlertSoundUrl(customId, options.kind)
    const audio = getAudioElement(url)
    audio.currentTime = 0
    await audio.play()
  } catch {
    // Autoplay restrictions or missing files should not break chat.
  }
}

export function preloadAlertSound(
  customId: string | null | undefined,
  kind: AlertSoundKind
) {
  void resolveAlertSoundUrl(customId, kind).then((url) => {
    getAudioElement(url)
  })
}
