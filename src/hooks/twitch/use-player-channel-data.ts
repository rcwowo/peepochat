import * as React from "react"

import type { TwitchAccount } from "@/lib/peepochat/peepochat-config"
import {
  fetchChannelsByBroadcasterId,
  fetchLiveStreamsByLogin,
  fetchTwitchUsersByLogin,
  type TwitchChannelInformation,
  type TwitchLiveStream,
  type TwitchUser,
} from "@/lib/twitch/twitch-api"

const PLAYER_STREAM_POLL_INTERVAL_MS = 45_000

export function usePlayerChannelData(
  channelLogin: string,
  account: TwitchAccount | null
) {
  const [user, setUser] = React.useState<TwitchUser | null>(null)
  const [channel, setChannel] = React.useState<TwitchChannelInformation | null>(
    null
  )
  const [stream, setStream] = React.useState<TwitchLiveStream | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    if (!account) {
      return
    }

    let cancelled = false

    const loadProfile = async () => {
      try {
        const [nextUser] = await fetchTwitchUsersByLogin(
          [channelLogin],
          account.accessToken,
          account.clientId
        )
        if (cancelled) return

        setUser(nextUser ?? null)
        if (!nextUser) {
          setError(true)
          return
        }

        const [nextChannel] = await fetchChannelsByBroadcasterId(
          [nextUser.id],
          account.accessToken,
          account.clientId
        )
        if (cancelled) return
        setChannel(nextChannel ?? null)
      } catch {
        if (!cancelled) {
          setError(true)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    const loadStream = async () => {
      try {
        const [nextStream] = await fetchLiveStreamsByLogin(
          [channelLogin],
          account.accessToken,
          account.clientId
        )
        if (!cancelled) {
          setStream(nextStream ?? null)
        }
      } catch {
        if (!cancelled) {
          setError(true)
        }
      }
    }

    void loadProfile()
    void loadStream()
    const interval = window.setInterval(
      () => void loadStream(),
      PLAYER_STREAM_POLL_INTERVAL_MS
    )

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [account, channelLogin])

  return { user, channel, stream, loading, error }
}
