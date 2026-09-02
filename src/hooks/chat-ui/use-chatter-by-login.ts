import * as React from "react"

import type { ChannelChatter } from "@/lib/chat/chatter-store"
import { usePeepochatChat } from "@/lib/peepochat/peepochat-context"

function chatterAppearanceEqual(
  left: ChannelChatter | null,
  right: ChannelChatter | null
) {
  if (left === right) {
    return true
  }
  if (!left || !right) {
    return false
  }

  return (
    left.userId === right.userId &&
    left.login === right.login &&
    left.displayName === right.displayName &&
    left.color === right.color &&
    left.flags.isBroadcaster === right.flags.isBroadcaster &&
    left.flags.isModerator === right.flags.isModerator &&
    left.flags.isSubscriber === right.flags.isSubscriber &&
    left.flags.isVip === right.flags.isVip &&
    left.flags.isFirst === right.flags.isFirst &&
    left.flags.isAction === right.flags.isAction
  )
}

export function useChatterByLogin(
  channelLogin: string | undefined,
  login: string | undefined
): ChannelChatter | null {
  const { subscribeToChatters, getChatterByLogin } = usePeepochatChat()
  const snapshotRef = React.useRef<ChannelChatter | null>(null)

  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      if (!channelLogin || !login) {
        return () => {}
      }
      return subscribeToChatters(channelLogin, onStoreChange)
    },
    [channelLogin, login, subscribeToChatters]
  )

  const getSnapshot = React.useCallback(() => {
    if (!channelLogin || !login) {
      snapshotRef.current = null
      return null
    }

    const next = getChatterByLogin(channelLogin, login)
    if (chatterAppearanceEqual(snapshotRef.current, next)) {
      return snapshotRef.current
    }

    snapshotRef.current = next
    return next
  }, [channelLogin, getChatterByLogin, login])

  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
