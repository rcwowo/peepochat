import * as React from "react"

import type { TwitchChatRoomState } from "@/lib/twitch/twitch-chat-types"
import { usePeepochatChat } from "@/lib/peepochat/peepochat-context"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"

/**
 * Subscribes to a single channel's room state so panes re-render only when
 * that channel changes.
 */
export function useChannelRoom(login: string): TwitchChatRoomState | null {
  const { subscribeToRoom, getRoom } = usePeepochatChat()
  const normalized = normalizeChannelLogin(login)

  return React.useSyncExternalStore(
    (onStoreChange) => subscribeToRoom(normalized, onStoreChange),
    () => getRoom(normalized),
    () => getRoom(normalized)
  )
}
