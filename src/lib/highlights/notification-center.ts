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
  readAt: string | null
}

export type MissedPingNotification = {
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

type NotificationCenterStore = {
  pingNotifications: PingNotification[]
  liveNotifications: LiveNotification[]
  missedPingNotifications: MissedPingNotification[]
  dismissedMissedPingIds: Set<string>
  listeners: Set<() => void>
}

const store: NotificationCenterStore = {
  pingNotifications: [],
  liveNotifications: [],
  missedPingNotifications: [],
  dismissedMissedPingIds: new Set(),
  listeners: new Set(),
}

function pingNotificationId(channelLogin: string, messageId: string) {
  return `ping:${channelLogin}:${messageId}`
}

function missedPingNotificationId(channelLogin: string, messageId: string) {
  return `missed:${channelLogin}:${messageId}`
}

function compareReceivedAtDesc(
  left: { receivedAt: string },
  right: { receivedAt: string }
) {
  return Date.parse(right.receivedAt) - Date.parse(left.receivedAt)
}

function removeMissedPingForMessage(channelLogin: string, messageId: string) {
  const missedId = missedPingNotificationId(channelLogin, messageId)
  const next = store.missedPingNotifications.filter(
    (entry) => entry.id !== missedId
  )
  if (next.length === store.missedPingNotifications.length) {
    return
  }

  store.dismissedMissedPingIds.add(missedId)
  store.missedPingNotifications = next
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

function isLiveUnread(notification: LiveNotification) {
  return notification.readAt === null
}

function isMissedUnread(notification: MissedPingNotification) {
  return notification.readAt === null
}

function markNotificationsRead<T extends { readAt: string | null }>(
  items: T[],
  shouldMark: (item: T) => boolean
): T[] | null {
  const readAt = new Date().toISOString()
  let changed = false
  const next = items.map((item) => {
    if (item.readAt !== null || !shouldMark(item)) {
      return item
    }

    changed = true
    return { ...item, readAt }
  })

  return changed ? next : null
}

function markNotificationsUnread<T extends { readAt: string | null }>(
  items: T[],
  shouldUnmark: (item: T) => boolean
): T[] | null {
  let changed = false
  const next = items.map((item) => {
    if (item.readAt === null || !shouldUnmark(item)) {
      return item
    }

    changed = true
    return { ...item, readAt: null }
  })

  return changed ? next : null
}

export function addPingNotification(
  notification: Omit<PingNotification, "id" | "readAt"> & {
    readAt?: string | null
  }
): boolean {
  const channelLogin = normalizeChannelLogin(notification.channelLogin)
  const id = pingNotificationId(channelLogin, notification.messageId)

  if (store.pingNotifications.some((entry) => entry.id === id)) {
    return false
  }

  removeMissedPingForMessage(channelLogin, notification.messageId)

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
  notification: Omit<LiveNotification, "id" | "readAt"> & {
    readAt?: string | null
  }
): boolean {
  const channelLogin = normalizeChannelLogin(notification.channelLogin)
  const id = `live:${channelLogin}:${notification.wentLiveAt}`

  if (store.liveNotifications.some((entry) => entry.id === id)) {
    return false
  }

  store.liveNotifications = capNotifications([
    {
      ...notification,
      id,
      channelLogin,
      readAt: notification.readAt ?? null,
    },
    ...store.liveNotifications,
  ])
  notifyListeners()
  return true
}

export function markPingNotificationRead(id: string) {
  const next = markNotificationsRead(
    store.pingNotifications,
    (notification) => notification.id === id
  )
  if (!next) {
    return
  }

  store.pingNotifications = next
  notifyListeners()
}

export function markLiveNotificationRead(id: string) {
  const next = markNotificationsRead(
    store.liveNotifications,
    (notification) => notification.id === id
  )
  if (!next) {
    return
  }

  store.liveNotifications = next
  notifyListeners()
}

export function markPingNotificationUnread(id: string) {
  const next = markNotificationsUnread(
    store.pingNotifications,
    (notification) => notification.id === id
  )
  if (!next) {
    return
  }

  store.pingNotifications = next
  notifyListeners()
}

export function markLiveNotificationUnread(id: string) {
  const next = markNotificationsUnread(
    store.liveNotifications,
    (notification) => notification.id === id
  )
  if (!next) {
    return
  }

  store.liveNotifications = next
  notifyListeners()
}

export function markAllPingNotificationsRead() {
  const next = markNotificationsRead(store.pingNotifications, () => true)
  if (!next) {
    return
  }

  store.pingNotifications = next
  notifyListeners()
}

export function markAllLiveNotificationsRead() {
  const next = markNotificationsRead(store.liveNotifications, () => true)
  if (!next) {
    return
  }

  store.liveNotifications = next
  notifyListeners()
}

export function markMissedPingNotificationRead(id: string) {
  const next = markNotificationsRead(
    store.missedPingNotifications,
    (notification) => notification.id === id
  )
  if (!next) {
    return
  }

  store.missedPingNotifications = next
  notifyListeners()
}

export function markMissedPingNotificationUnread(id: string) {
  const next = markNotificationsUnread(
    store.missedPingNotifications,
    (notification) => notification.id === id
  )
  if (!next) {
    return
  }

  store.missedPingNotifications = next
  notifyListeners()
}

export function markAllMissedPingNotificationsRead() {
  const next = markNotificationsRead(store.missedPingNotifications, () => true)
  if (!next) {
    return
  }

  store.missedPingNotifications = next
  notifyListeners()
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
  const next = markNotificationsRead(store.pingNotifications, (notification) =>
    channelLogins.has(notification.channelLogin)
  )
  if (!next) {
    return
  }

  store.pingNotifications = next
  notifyListeners()
}

export function markLiveNotificationsReadForChannel(login: string) {
  markLiveNotificationsReadForChannels([login])
}

export function markLiveNotificationsReadForChannels(logins: string[]) {
  if (logins.length === 0) {
    return
  }

  const channelLogins = new Set(
    logins.map((login) => normalizeChannelLogin(login))
  )
  const next = markNotificationsRead(store.liveNotifications, (notification) =>
    channelLogins.has(notification.channelLogin)
  )
  if (!next) {
    return
  }

  store.liveNotifications = next
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

export function addMissedPingNotifications(
  notifications: Array<
    Omit<MissedPingNotification, "id" | "readAt"> & { readAt?: string | null }
  >
): number {
  if (notifications.length === 0) {
    return 0
  }

  const existingIds = new Set(
    store.missedPingNotifications.map((entry) => entry.id)
  )
  const liveIds = new Set(store.pingNotifications.map((entry) => entry.id))
  const added: MissedPingNotification[] = []

  for (const notification of notifications) {
    const channelLogin = normalizeChannelLogin(notification.channelLogin)
    const id = missedPingNotificationId(channelLogin, notification.messageId)
    const liveId = pingNotificationId(channelLogin, notification.messageId)

    if (
      existingIds.has(id) ||
      store.dismissedMissedPingIds.has(id) ||
      liveIds.has(liveId)
    ) {
      continue
    }

    existingIds.add(id)
    added.push({
      ...notification,
      id,
      channelLogin,
      readAt: notification.readAt ?? null,
    })
  }

  if (added.length === 0) {
    return 0
  }

  store.missedPingNotifications = capNotifications(
    [...added, ...store.missedPingNotifications].sort(compareReceivedAtDesc)
  )
  notifyListeners()
  return added.length
}

export function dismissMissedPingNotification(id: string) {
  const notification = store.missedPingNotifications.find(
    (entry) => entry.id === id
  )
  const next = store.missedPingNotifications.filter((entry) => entry.id !== id)
  if (next.length === store.missedPingNotifications.length) {
    return null
  }

  store.dismissedMissedPingIds.add(id)
  store.missedPingNotifications = next
  notifyListeners()

  if (notification) {
    removeChannelMessageHighlight(
      notification.channelLogin,
      notification.messageId
    )
  }

  return notification ?? null
}

export function dismissAllMissedPingNotifications() {
  if (store.missedPingNotifications.length === 0) {
    return
  }

  for (const notification of store.missedPingNotifications) {
    store.dismissedMissedPingIds.add(notification.id)
    removeChannelMessageHighlight(
      notification.channelLogin,
      notification.messageId
    )
  }

  store.missedPingNotifications = []
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

type NotificationCenterSnapshot = {
  pingNotifications: PingNotification[]
  liveNotifications: LiveNotification[]
  missedPingNotifications: MissedPingNotification[]
  pingCount: number
  liveCount: number
  missedCount: number
  totalCount: number
}

function buildSnapshot(): NotificationCenterSnapshot {
  const pingCount = store.pingNotifications.filter(isPingUnread).length
  const liveCount = store.liveNotifications.filter(isLiveUnread).length
  const missedCount =
    store.missedPingNotifications.filter(isMissedUnread).length

  return {
    pingNotifications: store.pingNotifications,
    liveNotifications: store.liveNotifications,
    missedPingNotifications: store.missedPingNotifications,
    pingCount,
    liveCount,
    missedCount,
    totalCount: pingCount + liveCount,
  }
}

let snapshot = buildSnapshot()

function notifyListeners() {
  snapshot = buildSnapshot()
  for (const listener of store.listeners) {
    listener()
  }
}

function getSnapshot() {
  return snapshot
}

function getTotalUnreadCount() {
  return snapshot.totalCount
}

const notificationCenterActions = {
  dismissPing: dismissPingNotification,
  dismissLive: dismissLiveNotification,
  dismissAllPings: dismissAllPingNotifications,
  dismissAllLive: dismissAllLiveNotifications,
  markPingRead: markPingNotificationRead,
  markLiveRead: markLiveNotificationRead,
  markPingUnread: markPingNotificationUnread,
  markLiveUnread: markLiveNotificationUnread,
  markMissedRead: markMissedPingNotificationRead,
  markMissedUnread: markMissedPingNotificationUnread,
  markAllPingsRead: markAllPingNotificationsRead,
  markAllLiveRead: markAllLiveNotificationsRead,
  markAllMissedRead: markAllMissedPingNotificationsRead,
  markPingNotificationsReadForChannel,
  markPingNotificationsReadForChannels,
  markLiveNotificationsReadForChannel,
  markLiveNotificationsReadForChannels,
  dismissAllMissed: dismissAllMissedPingNotifications,
  dismissMissed: dismissMissedPingNotification,
}

export function useNotificationCenter() {
  const current = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot
  )

  return React.useMemo(
    () => ({
      ...current,
      ...notificationCenterActions,
    }),
    [current]
  )
}

export function useNotificationUnreadCount() {
  return React.useSyncExternalStore(
    subscribe,
    getTotalUnreadCount,
    getTotalUnreadCount
  )
}
