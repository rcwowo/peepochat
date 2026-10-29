import { normalizeChannelLogin } from "@/lib/twitch/channel/channel"

export const TWITCH_PLAYER_ORIGIN = "https://player.twitch.tv"

const PLAYER_PROXY_NAMESPACE = "twitch-embed-player-proxy"
const PLAYER_EMBED_NAMESPACE = "twitch-embed"
const PLAYER_UPDATE_STATE_EVENT = "UPDATE_STATE"
const PLAYER_SET_MUTED_COMMAND = 10

export function buildTwitchPlayerUrl(
  channelLogin: string,
  options: { muted?: boolean } = {},
  parentHostname = window.location.hostname
) {
  const channel = normalizeChannelLogin(channelLogin)
  const parent = parentHostname.trim()
  if (!channel || !parent) {
    return ""
  }

  const url = new URL(`${TWITCH_PLAYER_ORIGIN}/`)
  url.searchParams.set("channel", channel)
  url.searchParams.set("parent", parent)
  url.searchParams.set("autoplay", "true")
  url.searchParams.set("muted", options.muted ? "true" : "false")
  return url.toString()
}

export function sendTwitchPlayerMuted(
  target: Window | null | undefined,
  muted: boolean
) {
  target?.postMessage(
    {
      eventName: PLAYER_SET_MUTED_COMMAND,
      params: muted,
      namespace: PLAYER_PROXY_NAMESPACE,
    },
    TWITCH_PLAYER_ORIGIN
  )
}

export type TwitchPlayerMessage =
  { kind: "state"; muted: boolean | null } | { kind: "event"; name: string }

export function parseTwitchPlayerMessage(
  data: unknown
): TwitchPlayerMessage | null {
  if (!data || typeof data !== "object") {
    return null
  }

  const { namespace, eventName, params } = data as Record<string, unknown>
  if (
    namespace === PLAYER_PROXY_NAMESPACE &&
    eventName === PLAYER_UPDATE_STATE_EVENT
  ) {
    const muted =
      params && typeof params === "object"
        ? (params as Record<string, unknown>).muted
        : undefined
    return { kind: "state", muted: typeof muted === "boolean" ? muted : null }
  }

  if (namespace === PLAYER_EMBED_NAMESPACE && typeof eventName === "string") {
    return { kind: "event", name: eventName }
  }

  return null
}
