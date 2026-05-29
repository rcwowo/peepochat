import * as React from "react"

import { normalizeChannelLogin } from "@/lib/twitch-channel"

const MAX_HIGHLIGHTS_PER_CHANNEL = 250

type ChannelHighlightStore = {
  byChannel: Map<string, ReadonlySet<string>>
  listeners: Map<string, Set<() => void>>
}

const store: ChannelHighlightStore = {
  byChannel: new Map(),
  listeners: new Map(),
}

const emptySet: ReadonlySet<string> = new Set()

function getChannelSet(login: string): ReadonlySet<string> {
  return store.byChannel.get(login) ?? emptySet
}

function subscribeChannel(login: string, onStoreChange: () => void) {
  let channelListeners = store.listeners.get(login)
  if (!channelListeners) {
    channelListeners = new Set()
    store.listeners.set(login, channelListeners)
  }
  channelListeners.add(onStoreChange)

  return () => {
    channelListeners?.delete(onStoreChange)
    if (channelListeners?.size === 0) {
      store.listeners.delete(login)
    }
  }
}

function notifyChannel(login: string) {
  const channelListeners = store.listeners.get(login)
  if (!channelListeners) return
  for (const listener of channelListeners) {
    listener()
  }
}

export function addChannelMessageHighlight(
  login: string,
  messageId: string
): boolean {
  const normalized = normalizeChannelLogin(login)
  const current = store.byChannel.get(normalized)
  if (current?.has(messageId)) {
    return false
  }

  const next = new Set(current ?? [])
  next.add(messageId)

  if (next.size > MAX_HIGHLIGHTS_PER_CHANNEL) {
    const overflow = next.size - MAX_HIGHLIGHTS_PER_CHANNEL
    const iterator = next.values()
    for (let index = 0; index < overflow; index += 1) {
      const oldest = iterator.next().value
      if (oldest !== undefined) {
        next.delete(oldest)
      }
    }
  }

  store.byChannel.set(normalized, next)
  notifyChannel(normalized)
  return true
}

export function clearChannelMessageHighlights(login: string) {
  const normalized = normalizeChannelLogin(login)
  if (!store.byChannel.has(normalized)) {
    return
  }
  store.byChannel.delete(normalized)
  notifyChannel(normalized)
}

export function useChannelHighlightedMessageIds(
  channelLogin: string
): ReadonlySet<string> {
  const login = normalizeChannelLogin(channelLogin)

  return React.useSyncExternalStore(
    (onStoreChange) => subscribeChannel(login, onStoreChange),
    () => getChannelSet(login),
    () => getChannelSet(login)
  )
}
