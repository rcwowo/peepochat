import * as React from "react"

import type { PingMatchRange } from "@/lib/highlights/highlight-rules"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"

const MAX_HIGHLIGHTS_PER_CHANNEL = 250

export type ChannelMessageHighlight = {
  messageId: string
  ruleId: string
  matchPattern: string
  matchRange: PingMatchRange | null
}

type ChannelHighlightStore = {
  byChannel: Map<string, Map<string, ChannelMessageHighlight>>
  listeners: Map<string, Set<() => void>>
}

const store: ChannelHighlightStore = {
  byChannel: new Map(),
  listeners: new Map(),
}

const emptyMap: ReadonlyMap<string, ChannelMessageHighlight> = new Map()

function getChannelMap(login: string): ReadonlyMap<string, ChannelMessageHighlight> {
  return store.byChannel.get(login) ?? emptyMap
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
  highlight: ChannelMessageHighlight
): boolean {
  const normalized = normalizeChannelLogin(login)
  const current = store.byChannel.get(normalized)
  if (current?.has(highlight.messageId)) {
    return false
  }

  const next = new Map(current ?? [])
  next.set(highlight.messageId, highlight)

  if (next.size > MAX_HIGHLIGHTS_PER_CHANNEL) {
    const overflow = next.size - MAX_HIGHLIGHTS_PER_CHANNEL
    const iterator = next.keys()
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

export function removeChannelMessageHighlight(login: string, messageId: string) {
  const normalized = normalizeChannelLogin(login)
  const current = store.byChannel.get(normalized)
  if (!current?.has(messageId)) {
    return
  }

  const next = new Map(current)
  next.delete(messageId)
  if (next.size === 0) {
    store.byChannel.delete(normalized)
  } else {
    store.byChannel.set(normalized, next)
  }
  notifyChannel(normalized)
}

export function useChannelMessageHighlights(
  channelLogin: string
): ReadonlyMap<string, ChannelMessageHighlight> {
  const login = normalizeChannelLogin(channelLogin)

  return React.useSyncExternalStore(
    (onStoreChange) => subscribeChannel(login, onStoreChange),
    () => getChannelMap(login),
    () => getChannelMap(login)
  )
}
