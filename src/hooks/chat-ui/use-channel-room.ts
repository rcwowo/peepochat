import * as React from "react"

import type { TwitchChatRoomState } from "@/lib/twitch/twitch-chat-types"
import { usePeepochatChat } from "@/lib/peepochat/peepochat-context"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"

const WARM_UPDATE_MS = 500

export function useChannelRoom(
  login: string,
  active = true,
  keepWarm = false
): TwitchChatRoomState | null {
  const { subscribeToRoom, getRoom } = usePeepochatChat()
  const normalized = normalizeChannelLogin(login)
  const listening = active || keepWarm
  const activeRef = React.useRef(active)

  React.useLayoutEffect(() => {
    activeRef.current = active
  }, [active])

  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      if (!listening) {
        return () => undefined
      }

      let updateTimer: number | null = null
      const handleStoreChange = () => {
        if (activeRef.current) {
          onStoreChange()
          return
        }
        if (updateTimer === null) {
          updateTimer = window.setTimeout(() => {
            updateTimer = null
            onStoreChange()
          }, WARM_UPDATE_MS)
        }
      }

      const unsubscribe = subscribeToRoom(normalized, handleStoreChange)
      return () => {
        if (updateTimer !== null) {
          window.clearTimeout(updateTimer)
        }
        unsubscribe()
      }
    },
    [listening, normalized, subscribeToRoom]
  )
  const getSnapshot = React.useCallback(
    () => getRoom(normalized),
    [getRoom, normalized]
  )

  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
