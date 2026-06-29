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

export function isDevLogEnabled(category: DevLogCategory): boolean {
  if (!IS_DEV) return false

  try {
    const stored = localStorage.getItem(STORAGE_KEYS[category])
    if (stored === null) return DEFAULTS[category]
    return stored === "1"
  } catch {
    return DEFAULTS[category]
  }
}

export function setDevLogEnabled(
  category: DevLogCategory,
  enabled: boolean
): void {
  if (!IS_DEV) return

  try {
    localStorage.setItem(STORAGE_KEYS[category], enabled ? "1" : "0")
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  } catch {
    // Ignore storage failures in dev tooling.
  }
}

export function getDevLogSettings(): Record<DevLogCategory, boolean> {
  return {
    chat: isDevLogEnabled("chat"),
    fetch: isDevLogEnabled("fetch"),
    irc: isDevLogEnabled("irc"),
  }
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
