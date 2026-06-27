const CHANNEL_SIDEBAR_VISIBLE_KEY = "peepochat::channel_sidebar_visible"

export function readChannelSidebarVisible(): boolean {
  if (typeof window === "undefined") {
    return true
  }

  const stored = window.localStorage.getItem(CHANNEL_SIDEBAR_VISIBLE_KEY)
  return stored !== "0"
}

export function writeChannelSidebarVisible(visible: boolean) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(CHANNEL_SIDEBAR_VISIBLE_KEY, visible ? "1" : "0")
}
