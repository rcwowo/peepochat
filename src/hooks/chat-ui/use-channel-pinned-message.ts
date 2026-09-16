import * as React from "react"

import { usePeepochatChat } from "@/lib/peepochat/peepochat-context"
import { normalizeChannelLogin } from "@/lib/twitch/channel/channel"
import {
  pinnedMessagesEqual,
  type ChannelPinnedMessage,
} from "@/lib/twitch/chat/pins"

export function useChannelPinnedMessage(
  login: string
): ChannelPinnedMessage | null {
  const { subscribeToPinnedMessage, getPinnedMessage } = usePeepochatChat()
  const normalized = normalizeChannelLogin(login)
  const snapshotRef = React.useRef<ChannelPinnedMessage | null>(null)

  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      return subscribeToPinnedMessage(normalized, onStoreChange)
    },
    [normalized, subscribeToPinnedMessage]
  )

  const getSnapshot = React.useCallback(() => {
    const next = getPinnedMessage(normalized)
    if (pinnedMessagesEqual(snapshotRef.current, next)) {
      return snapshotRef.current
    }
    snapshotRef.current = next
    return next
  }, [getPinnedMessage, normalized])

  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
