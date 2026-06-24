import * as React from "react"

import {
  fetchLiveStreamsByLogin,
  type TwitchLiveStream,
} from "@/lib/twitch/twitch-api"

const LIVE_POLL_INTERVAL_MS = 45_000
const EMPTY_LIVE_LOGINS = new Set<string>()
const EMPTY_LIVE_STREAMS = new Map<string, TwitchLiveStream>()

function normalizeStreamLogin(login: string) {
  return login.trim().replace(/^#/, "").toLowerCase()
}

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
  onChannelWentLive?: (login: string, title: string, gameName: string) => void
}) {
  const [liveLogins, setLiveLogins] = React.useState<ReadonlySet<string>>(
    () => new Set()
  )
  const [liveStreamsByLogin, setLiveStreamsByLogin] = React.useState<
    ReadonlyMap<string, TwitchLiveStream>
  >(() => new Map())
  const liveLoginsRef = React.useRef(liveLogins)
  const initialPollDoneRef = React.useRef(false)

  const channelLoginsKey = channelLogins.join("\0")
  const onWentLiveRef = React.useRef(onChannelWentLive)
  const pollingActive =
    enabled && Boolean(accessToken) && Boolean(clientId) && channelLogins.length > 0

  React.useEffect(() => {
    liveLoginsRef.current = liveLogins
  }, [liveLogins])

  React.useEffect(() => {
    onWentLiveRef.current = onChannelWentLive
  }, [onChannelWentLive])

  React.useEffect(() => {
    if (!pollingActive) {
      initialPollDoneRef.current = false
      return
    }

    initialPollDoneRef.current = false
    let cancelled = false

    const poll = async () => {
      try {
        const streams = await fetchLiveStreamsByLogin(
          channelLogins,
          accessToken!,
          clientId!
        )
        if (cancelled) return

        const nextStreams = new Map<string, TwitchLiveStream>()
        for (const stream of streams) {
          nextStreams.set(stream.userLogin, stream)
        }

        const next = new Set(nextStreams.keys())
        const previous = liveLoginsRef.current

        if (onWentLiveRef.current && initialPollDoneRef.current) {
          for (const login of next) {
            if (!previous.has(login)) {
              const stream = nextStreams.get(login)
              onWentLiveRef.current(
                login,
                stream?.title ?? "Live now",
                stream?.gameName ?? ""
              )
            }
          }
        }
        initialPollDoneRef.current = true

        setLiveLogins(next)
        setLiveStreamsByLogin(nextStreams)
      } catch {
        if (!cancelled) {
          setLiveLogins(new Set())
          setLiveStreamsByLogin(new Map())
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
  }, [pollingActive, accessToken, clientId, channelLoginsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveLiveLogins = pollingActive ? liveLogins : EMPTY_LIVE_LOGINS
  const effectiveLiveStreams = pollingActive
    ? liveStreamsByLogin
    : EMPTY_LIVE_STREAMS

  const isLive = React.useCallback(
    (login: string) => effectiveLiveLogins.has(normalizeStreamLogin(login)),
    [effectiveLiveLogins]
  )

  const getLiveStream = React.useCallback(
    (login: string) =>
      effectiveLiveStreams.get(normalizeStreamLogin(login)) ?? null,
    [effectiveLiveStreams]
  )

  return { liveLogins: effectiveLiveLogins, isLive, getLiveStream }
}
