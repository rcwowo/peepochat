export const MODERATION_TIMEOUT_PRESETS = [
  { label: "30s", seconds: 30 },
  { label: "1m", seconds: 60 },
  { label: "10m", seconds: 600 },
  { label: "1h", seconds: 3600 },
  { label: "12h", seconds: 43200 },
  { label: "1d", seconds: 86400 },
  { label: "7d", seconds: 604800 },
] as const

export const CHATLOGS_URL = "https://tv.supa.sh/logs"

export function twitchViewerCardUrl(
  channelLogin: string,
  username: string
): string {
  return `https://www.twitch.tv/popout/${encodeURIComponent(channelLogin)}/viewercard/${encodeURIComponent(username)}`
}

export function chatlogsUserUrl(
  channelLogin: string,
  username: string
): string {
  return `${CHATLOGS_URL}?c=${encodeURIComponent(channelLogin)}&u=${encodeURIComponent(username)}`
}

export function openExternalTool(url: string) {
  window.open(url, "_blank", "noopener,noreferrer")
}
