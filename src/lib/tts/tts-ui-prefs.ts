const TTS_CHANNEL_STORAGE_KEY = "peepochat::tts-channel"
const TTS_UI_STORAGE_KEY = "peepochat::tts-ui"

export const TTS_SIDEBAR_MIN_WIDTH = 260
export const TTS_SIDEBAR_MAX_WIDTH = 520
export const TTS_SIDEBAR_DEFAULT_WIDTH = 320

export type TtsUiPrefs = {
  collapsed: boolean
  width: number
  floating: { x: number; y: number } | null
}

const DEFAULT_UI_PREFS: TtsUiPrefs = {
  collapsed: false,
  width: TTS_SIDEBAR_DEFAULT_WIDTH,
  floating: null,
}

function clampWidth(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return TTS_SIDEBAR_DEFAULT_WIDTH
  }
  return Math.round(
    Math.min(TTS_SIDEBAR_MAX_WIDTH, Math.max(TTS_SIDEBAR_MIN_WIDTH, value))
  )
}

function parseFloating(value: unknown): TtsUiPrefs["floating"] {
  if (!value || typeof value !== "object") {
    return null
  }
  const { x, y } = value as { x?: unknown; y?: unknown }
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    return null
  }
  return { x, y }
}

export function loadTtsUiPrefs(): TtsUiPrefs {
  try {
    const raw = window.localStorage.getItem(TTS_UI_STORAGE_KEY)
    if (!raw) {
      return DEFAULT_UI_PREFS
    }
    const parsed = JSON.parse(raw) as Partial<Record<keyof TtsUiPrefs, unknown>>
    return {
      collapsed: parsed.collapsed === true,
      width: clampWidth(parsed.width),
      floating: parseFloating(parsed.floating),
    }
  } catch {
    return DEFAULT_UI_PREFS
  }
}

export function saveTtsUiPrefs(prefs: TtsUiPrefs) {
  try {
    window.localStorage.setItem(TTS_UI_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    return
  }
}

export function clampTtsSidebarWidth(value: number): number {
  return clampWidth(value)
}

export function loadStoredTtsChannel(): string | null {
  try {
    return window.localStorage.getItem(TTS_CHANNEL_STORAGE_KEY) || null
  } catch {
    return null
  }
}

export function saveStoredTtsChannel(login: string | null) {
  try {
    if (login) {
      window.localStorage.setItem(TTS_CHANNEL_STORAGE_KEY, login)
    } else {
      window.localStorage.removeItem(TTS_CHANNEL_STORAGE_KEY)
    }
  } catch {
    return
  }
}
