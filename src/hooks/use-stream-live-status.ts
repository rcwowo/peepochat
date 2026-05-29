import * as React from "react"

import { fetchLiveStreamsByLogin } from "@/lib/twitch-api"

const LIVE_POLL_INTERVAL_MS = 45_000

export function useStreamLiveStatus({
  channelLogins,
  enabled,
  accessToken,
  clientId,
  onChannelWentLive,
}: {
  channelLogins: string[]
  enabled: boolean
  accessToken?: string
  clientId?: string
  onChannelWentLive?: (login: string, title: string) => void
}) {
  const [liveLogins, setLiveLogins] = React.useState<ReadonlySet<string>>(
    () => new Set()
  )
  const liveLoginsRef = React.useRef(liveLogins)
  liveLoginsRef.current = liveLogins
  const initialPollDoneRef = React.useRef(false)

  const channelLoginsKey = channelLogins.join("\0")
  const onWentLiveRef = React.useRef(onChannelWentLive)
  onWentLiveRef.current = onChannelWentLive

  React.useEffect(() => {
    if (!enabled || !accessToken || !clientId || channelLogins.length === 0) {
      setLiveLogins(new Set())
      initialPollDoneRef.current = false
      return
    }

    initialPollDoneRef.current = false
    let cancelled = false

    const poll = async () => {
      try {
        const streams = await fetchLiveStreamsByLogin(
          channelLogins,
          accessToken,
          clientId
        )
        if (cancelled) return

        const next = new Set(streams.map((stream) => stream.userLogin))
        const previous = liveLoginsRef.current

        if (onWentLiveRef.current && initialPollDoneRef.current) {
          for (const login of next) {
            if (!previous.has(login)) {
              const stream = streams.find((s) => s.userLogin === login)
              onWentLiveRef.current(login, stream?.title ?? "Live now")
            }
          }
        }
        initialPollDoneRef.current = true

        setLiveLogins(next)
      } catch {
        if (!cancelled) {
          setLiveLogins(new Set())
        }
      }
    }

    void poll()
    const interval = window.setInterval(() => {
      void poll()
    }, LIVE_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [enabled, accessToken, clientId, channelLoginsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const isLive = React.useCallback(
    (login: string) => liveLogins.has(login.trim().replace(/^#/, "").toLowerCase()),
    [liveLogins]
  )

  return { liveLogins, isLive }
}
