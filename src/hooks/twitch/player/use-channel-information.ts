import * as React from "react"

import {
  fetchChannelsByBroadcasterId,
  fetchTwitchUsersByLogin,
  type TwitchChannelInformation,
} from "@/lib/twitch/auth/api"
import { normalizeChannelLogin } from "@/lib/twitch/channel/channel"

const CHANNEL_INFO_POLL_INTERVAL_MS = 45_000
const channelInfoCache = new Map<string, TwitchChannelInformation>()

export function useChannelInformation({
  login,
  broadcasterId,
  enabled,
  accessToken,
  clientId,
}: {
  login: string
  broadcasterId: string | null
  enabled: boolean
  accessToken?: string
  clientId?: string
}) {
  const channelLogin = normalizeChannelLogin(login)
  const [snapshot, setSnapshot] = React.useState<{
    login: string
    info: TwitchChannelInformation | null
  }>(() => ({
    login: channelLogin,
    info: channelInfoCache.get(channelLogin) ?? null,
  }))
  const pollingActive = Boolean(
    enabled && channelLogin && accessToken && clientId
  )
  const info =
    snapshot.login === channelLogin
      ? snapshot.info
      : (channelInfoCache.get(channelLogin) ?? null)

  React.useEffect(() => {
    if (!pollingActive) {
      return
    }

    let cancelled = false

    const load = async () => {
      try {
        let id = broadcasterId?.trim() ?? ""
        if (!id) {
          const [user] = await fetchTwitchUsersByLogin(
            [channelLogin],
            accessToken!,
            clientId!
          )
          if (cancelled) return
          id = user?.id ?? ""
        }
        if (!id) {
          return
        }

        const [channel] = await fetchChannelsByBroadcasterId(
          [id],
          accessToken!,
          clientId!
        )
        if (!cancelled && channel) {
          channelInfoCache.set(channelLogin, channel)
          setSnapshot({ login: channelLogin, info: channel })
        }
      } catch {
        return
      }
    }

    void load()
    const interval = window.setInterval(() => {
      void load()
    }, CHANNEL_INFO_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [accessToken, broadcasterId, channelLogin, clientId, pollingActive])

  return pollingActive ? info : null
}
