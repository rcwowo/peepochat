import * as React from "react"

import { IS_DEV } from "@/lib/dev/is-dev"

export type DevLogCategory = "chat" | "fetch" | "irc"

const STORAGE_KEYS: Record<DevLogCategory, string> = {
  chat: "peepochat:dev:chat",
  fetch: "peepochat:dev:fetch",
  irc: "peepochat:dev:irc",
}

const DEFAULTS: Record<DevLogCategory, boolean> = {
  chat: false,
  fetch: false,
  irc: false,
}

const CHANGE_EVENT = "peepochat:dev-log-settings"

export const DEV_LOG_CATEGORIES: DevLogCategory[] = ["chat", "fetch", "irc"]

export const DEV_LOG_META: Record<
  DevLogCategory,
  { title: string; description: string }
> = {
  chat: {
    title: "Chat events",
    description:
      "Parsed chat events, timeline updates, and connection lifecycle.",
  },
  fetch: {
    title: "HTTP requests",
    description: "Request and response metadata for API and asset fetches.",
  },
  irc: {
    title: "IRC lines",
    description: "Raw IRC lines and message kinds (PRIVMSG, JOIN, etc.).",
  },
}

let cachedSettings: Record<DevLogCategory, boolean> | null = null
let cacheListenersRegistered = false

function readCategoryFromStorage(category: DevLogCategory): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS[category])
    if (stored === null) return DEFAULTS[category]
    return stored === "1"
  } catch {
    return DEFAULTS[category]
  }
}

function refreshCacheFromStorage(): Record<DevLogCategory, boolean> {
  const next = { ...DEFAULTS }
  for (const category of DEV_LOG_CATEGORIES) {
    next[category] = readCategoryFromStorage(category)
  }
  cachedSettings = next
  return next
}

function ensureDevLogCache(): Record<DevLogCategory, boolean> {
  if (cachedSettings !== null) {
    return cachedSettings
  }

  if (typeof window === "undefined") {
    cachedSettings = { ...DEFAULTS }
    return cachedSettings
  }

  const settings = refreshCacheFromStorage()

  if (!cacheListenersRegistered) {
    cacheListenersRegistered = true
    window.addEventListener(CHANGE_EVENT, refreshCacheFromStorage)
    window.addEventListener("storage", (event) => {
      if (
        event.key === null ||
        (Object.values(STORAGE_KEYS) as string[]).includes(event.key)
      ) {
        refreshCacheFromStorage()
      }
    })
  }

  return settings
}

export function isDevLogEnabled(category: DevLogCategory): boolean {
  if (!IS_DEV) return false
  return ensureDevLogCache()[category]
}

export function setDevLogEnabled(
  category: DevLogCategory,
  enabled: boolean
): void {
  if (!IS_DEV) return

  try {
    localStorage.setItem(STORAGE_KEYS[category], enabled ? "1" : "0")
    ensureDevLogCache()[category] = enabled
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  } catch {
    // Ignore storage failures in dev tooling.
  }
}

export function getDevLogSettings(): Record<DevLogCategory, boolean> {
  if (!IS_DEV) {
    return { ...DEFAULTS }
  }
  return { ...ensureDevLogCache() }
}

export function useDevLogSettings() {
  const [settings, setSettings] = React.useState(getDevLogSettings)

  React.useEffect(() => {
    const sync = () => setSettings(getDevLogSettings())

    window.addEventListener(CHANGE_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  const setEnabled = React.useCallback(
    (category: DevLogCategory, enabled: boolean) => {
      setDevLogEnabled(category, enabled)
      setSettings(getDevLogSettings())
    },
    []
  )

  return { settings, setEnabled }
}
