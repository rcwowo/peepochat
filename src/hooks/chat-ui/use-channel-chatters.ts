import * as React from "react"

import type { ChannelChatter } from "@/lib/chat/chatter-store"
import { usePeepochatChat } from "@/lib/peepochat/peepochat-context"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"

export function useChannelChatters(login: string): ChannelChatter[] {
  const { subscribeToChatters, getChatters } = usePeepochatChat()
  const normalized = normalizeChannelLogin(login)

  return React.useSyncExternalStore(
    (onStoreChange) => subscribeToChatters(normalized, onStoreChange),
    () => getChatters(normalized),
    () => getChatters(normalized)
  )
}

export function useChannelChattersLoading(login: string): boolean {
  const { subscribeToRecentMessagesLoading, isRecentMessagesLoading } =
    usePeepochatChat()
  const normalized = normalizeChannelLogin(login)

  return React.useSyncExternalStore(
    (onStoreChange) =>
      subscribeToRecentMessagesLoading(normalized, onStoreChange),
    () => isRecentMessagesLoading(normalized),
    () => isRecentMessagesLoading(normalized)
  )
}
