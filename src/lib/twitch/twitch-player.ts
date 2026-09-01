import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"

export function buildTwitchPlayerUrl(
  channelLogin: string,
  parentHostname = window.location.hostname
) {
  const channel = normalizeChannelLogin(channelLogin)
  const parent = parentHostname.trim()
  if (!channel || !parent) {
    return ""
  }

  const url = new URL("https://player.twitch.tv/")
  url.searchParams.set("channel", channel)
  url.searchParams.set("parent", parent)
  url.searchParams.set("autoplay", "true")
  return url.toString()
}
