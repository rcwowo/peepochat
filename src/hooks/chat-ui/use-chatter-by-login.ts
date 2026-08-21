import * as React from "react"

import type { ChannelChatter } from "@/lib/chat/chatter-store"
import { usePeepochatChat } from "@/lib/peepochat/peepochat-context"

export function useChatterByLogin(
  channelLogin: string | undefined,
  login: string | undefined
): ChannelChatter | null {
  const { subscribeToChatters, getChatterByLogin } = usePeepochatChat()

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
      return null
    }
    return getChatterByLogin(channelLogin, login)
  }, [channelLogin, getChatterByLogin, login])

  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
