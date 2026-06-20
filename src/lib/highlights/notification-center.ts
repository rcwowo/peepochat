import * as React from "react"

import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"

export const MAX_NOTIFICATIONS_PER_TAB = 100

export type PingNotification = {
  id: string
  channelLogin: string
  messageId: string
  userName: string
  displayName: string
  text: string
  receivedAt: string
  ruleId: string
  matchPattern: string
}

export type LiveNotification = {
  id: string
  channelLogin: string
  title: string
  gameName?: string
  wentLiveAt: string
}

type NotificationCenterStore = {
  pingNotifications: PingNotification[]
  liveNotifications: LiveNotification[]
  listeners: Set<() => void>
}

const store: NotificationCenterStore = {
  pingNotifications: [],
  liveNotifications: [],
  listeners: new Set(),
}

function notifyListeners() {
  for (const listener of store.listeners) {
    listener()
  }
}

function subscribe(onStoreChange: () => void) {
  store.listeners.add(onStoreChange)
  return () => {
    store.listeners.delete(onStoreChange)
  }
}

function capNotifications<T>(items: T[]): T[] {
  if (items.length <= MAX_NOTIFICATIONS_PER_TAB) {
    return items
  }
  return items.slice(0, MAX_NOTIFICATIONS_PER_TAB)
}

export function addPingNotification(
  notification: Omit<PingNotification, "id">
): boolean {
  const channelLogin = normalizeChannelLogin(notification.channelLogin)
  const id = `ping:${channelLogin}:${notification.messageId}`

  if (store.pingNotifications.some((entry) => entry.id === id)) {
    return false
  }

  store.pingNotifications = capNotifications([
    { ...notification, id, channelLogin },
    ...store.pingNotifications,
  ])
  notifyListeners()
  return true
}

export function addLiveNotification(
  notification: Omit<LiveNotification, "id">
): boolean {
  const channelLogin = normalizeChannelLogin(notification.channelLogin)
  const id = `live:${channelLogin}:${notification.wentLiveAt}`

  if (store.liveNotifications.some((entry) => entry.id === id)) {
    return false
  }

  store.liveNotifications = capNotifications([
    { ...notification, id, channelLogin },
    ...store.liveNotifications,
  ])
  notifyListeners()
  return true
}

export function dismissPingNotification(id: string) {
  const next = store.pingNotifications.filter((entry) => entry.id !== id)
  if (next.length === store.pingNotifications.length) {
    return
  }
  store.pingNotifications = next
  notifyListeners()
}

export function dismissLiveNotification(id: string) {
  const next = store.liveNotifications.filter((entry) => entry.id !== id)
  if (next.length === store.liveNotifications.length) {
    return
  }
  store.liveNotifications = next
  notifyListeners()
}

export function dismissAllPingNotifications() {
  if (store.pingNotifications.length === 0) {
    return
  }
  store.pingNotifications = []
  notifyListeners()
}

export function dismissAllLiveNotifications() {
  if (store.liveNotifications.length === 0) {
    return
  }
  store.liveNotifications = []
  notifyListeners()
}

export function formatLiveNotificationText(gameName: string, title: string) {
  const game = gameName.trim()
  const streamTitle = title.trim()

  if (game && streamTitle) {
    return `Playing ${game} — ${streamTitle}`
  }
  if (game) {
    return `Playing ${game}`
  }
  if (streamTitle) {
    return streamTitle
  }
  return "Live now"
}

function getPingNotifications() {
  return store.pingNotifications
}

function getLiveNotifications() {
  return store.liveNotifications
}

export function useNotificationCenter() {
  const pingNotifications = React.useSyncExternalStore(
    subscribe,
    getPingNotifications,
    getPingNotifications
  )
  const liveNotifications = React.useSyncExternalStore(
    subscribe,
    getLiveNotifications,
    getLiveNotifications
  )

  return React.useMemo(
    () => ({
      pingNotifications,
      liveNotifications,
      pingCount: pingNotifications.length,
      liveCount: liveNotifications.length,
      totalCount: pingNotifications.length + liveNotifications.length,
      dismissPing: dismissPingNotification,
      dismissLive: dismissLiveNotification,
      dismissAllPings: dismissAllPingNotifications,
      dismissAllLive: dismissAllLiveNotifications,
    }),
    [liveNotifications, pingNotifications]
  )
}
