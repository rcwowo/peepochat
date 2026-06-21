import * as React from "react"

import { removeChannelMessageHighlight } from "@/lib/highlights/channel-message-highlights"
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
  readAt: string | null
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

function isPingUnread(notification: PingNotification) {
  return notification.readAt === null
}

export function addPingNotification(
  notification: Omit<PingNotification, "id" | "readAt"> & {
    readAt?: string | null
  }
): boolean {
  const channelLogin = normalizeChannelLogin(notification.channelLogin)
  const id = `ping:${channelLogin}:${notification.messageId}`

  if (store.pingNotifications.some((entry) => entry.id === id)) {
    return false
  }

  store.pingNotifications = capNotifications([
    {
      ...notification,
      id,
      channelLogin,
      readAt: notification.readAt ?? null,
    },
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

export function markPingNotificationsReadForChannel(login: string) {
  markPingNotificationsReadForChannels([login])
}

export function markPingNotificationsReadForChannels(logins: string[]) {
  if (logins.length === 0) {
    return
  }

  const channelLogins = new Set(
    logins.map((login) => normalizeChannelLogin(login))
  )
  const readAt = new Date().toISOString()
  let changed = false

  const next = store.pingNotifications.map((notification) => {
    if (
      !channelLogins.has(notification.channelLogin) ||
      notification.readAt !== null
    ) {
      return notification
    }

    changed = true
    return { ...notification, readAt }
  })

  if (!changed) {
    return
  }

  store.pingNotifications = next
  notifyListeners()
}

export function dismissPingNotification(id: string) {
  const notification = store.pingNotifications.find((entry) => entry.id === id)
  const next = store.pingNotifications.filter((entry) => entry.id !== id)
  if (next.length === store.pingNotifications.length) {
    return null
  }
  store.pingNotifications = next
  notifyListeners()

  if (notification) {
    removeChannelMessageHighlight(
      notification.channelLogin,
      notification.messageId
    )
  }

  return notification ?? null
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

  for (const notification of store.pingNotifications) {
    removeChannelMessageHighlight(
      notification.channelLogin,
      notification.messageId
    )
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

function getPingUnreadCount() {
  return store.pingNotifications.filter(isPingUnread).length
}

function getTotalUnreadCount() {
  return getPingUnreadCount() + store.liveNotifications.length
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
  const pingUnreadCount = React.useSyncExternalStore(
    subscribe,
    getPingUnreadCount,
    getPingUnreadCount
  )
  const totalUnreadCount = React.useSyncExternalStore(
    subscribe,
    getTotalUnreadCount,
    getTotalUnreadCount
  )

  return React.useMemo(
    () => ({
      pingNotifications,
      liveNotifications,
      pingCount: pingUnreadCount,
      liveCount: liveNotifications.length,
      totalCount: totalUnreadCount,
      dismissPing: dismissPingNotification,
      dismissLive: dismissLiveNotification,
      dismissAllPings: dismissAllPingNotifications,
      dismissAllLive: dismissAllLiveNotifications,
      markPingNotificationsReadForChannel,
      markPingNotificationsReadForChannels,
    }),
    [liveNotifications, pingNotifications, pingUnreadCount, totalUnreadCount]
  )
}
