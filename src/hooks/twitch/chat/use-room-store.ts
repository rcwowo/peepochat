import * as React from "react"

import { createEmptyRoom } from "@/lib/twitch/chat-timeline"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import type {
  TwitchChatRoomState,
  TwitchTimelineItem,
} from "@/lib/twitch/twitch-chat-types"

const EMPTY_ROOMS: Record<string, TwitchChatRoomState> = {}
const EMPTY_TIMELINE: TwitchTimelineItem[] = []

export function applyEnsureRooms(
  current: Record<string, TwitchChatRoomState>,
  channelLogins: string[]
): Record<string, TwitchChatRoomState> {
  let next: Record<string, TwitchChatRoomState> | null = null
  for (const login of channelLogins) {
    const existing = current[login]
    if (!existing) {
      next ??= { ...current }
      next[login] = createEmptyRoom(login)
      continue
    }

    const joining = !existing.joined
    if (existing.joining === joining) {
      continue
    }

    next ??= { ...current }
    next[login] = { ...existing, joining }
  }

  return next ?? current
}

export function applyRoomUpdate(
  current: Record<string, TwitchChatRoomState>,
  login: string,
  updater: (room: TwitchChatRoomState) => TwitchChatRoomState
): Record<string, TwitchChatRoomState> {
  const existing = current[login]
  const room = existing ?? createEmptyRoom(login)
  const nextRoom = updater(room)
  if (nextRoom === room && existing) {
    return current
  }

  return { ...current, [login]: nextRoom }
}

export function computeRoomIdsKey(
  rooms: Record<string, TwitchChatRoomState>
): string {
  return Object.keys(rooms)
    .sort()
    .map((login) => `${login}:${rooms[login]?.roomId?.trim() ?? ""}`)
    .join("|")
}

export function useRoomStore() {
  const roomsRef =
    React.useRef<Record<string, TwitchChatRoomState>>(EMPTY_ROOMS)

  const roomSubscribersRef = React.useRef<Map<string, Set<() => void>> | null>(
    null
  )
  if (roomSubscribersRef.current === null) {
    roomSubscribersRef.current = new Map()
  }

  const notifyRoomSubscribers = React.useCallback((login: string) => {
    const normalized = normalizeChannelLogin(login)
    const subscribers = roomSubscribersRef.current?.get(normalized)
    if (!subscribers) {
      return
    }

    for (const listener of subscribers) {
      listener()
    }
  }, [])

  const notifyChangedRoomSubscribers = React.useCallback(
    (
      current: Record<string, TwitchChatRoomState>,
      next: Record<string, TwitchChatRoomState>
    ) => {
      const logins = new Set([...Object.keys(current), ...Object.keys(next)])
      for (const login of logins) {
        if (current[login] !== next[login]) {
          notifyRoomSubscribers(login)
        }
      }
    },
    [notifyRoomSubscribers]
  )

  const lastNotifiedRoomsRef = React.useRef(EMPTY_ROOMS)
  const notifyScheduledRef = React.useRef(false)
  const roomIdListenersRef = React.useRef<Set<() => void> | null>(null)
  if (roomIdListenersRef.current === null) {
    roomIdListenersRef.current = new Set()
  }
  const roomIdsKeyRef = React.useRef("")

  const flushRoomSubscriberNotifications = React.useCallback(() => {
    notifyScheduledRef.current = false
    const current = lastNotifiedRoomsRef.current
    const next = roomsRef.current
    lastNotifiedRoomsRef.current = next
    notifyChangedRoomSubscribers(current, next)
  }, [notifyChangedRoomSubscribers])

  const scheduleRoomSubscriberNotifications = React.useCallback(() => {
    if (notifyScheduledRef.current) {
      return
    }
    notifyScheduledRef.current = true
    queueMicrotask(flushRoomSubscriberNotifications)
  }, [flushRoomSubscriberNotifications])

  const commitRooms = React.useCallback(
    (
      updater: (
        current: Record<string, TwitchChatRoomState>
      ) => Record<string, TwitchChatRoomState>
    ) => {
      const current = roomsRef.current
      const next = updater(current)
      if (next === current) {
        return
      }

      roomsRef.current = next
      scheduleRoomSubscriberNotifications()

      const nextRoomIdsKey = computeRoomIdsKey(next)
      if (nextRoomIdsKey !== roomIdsKeyRef.current) {
        roomIdsKeyRef.current = nextRoomIdsKey
        for (const listener of roomIdListenersRef.current!) {
          listener()
        }
      }
    },
    [scheduleRoomSubscriberNotifications]
  )

  const subscribeToRoom = React.useCallback(
    (login: string, listener: () => void) => {
      const normalized = normalizeChannelLogin(login)
      const subscribers = roomSubscribersRef.current!
      let set = subscribers.get(normalized)
      if (!set) {
        set = new Set()
        subscribers.set(normalized, set)
      }
      set.add(listener)
      return () => {
        set.delete(listener)
        if (set.size === 0) {
          subscribers.delete(normalized)
        }
      }
    },
    []
  )

  const subscribeToRoomIds = React.useCallback((listener: () => void) => {
    const listeners = roomIdListenersRef.current!
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const getRoomIdsKey = React.useCallback(() => {
    return roomIdsKeyRef.current
  }, [])

  const updateRoom = React.useCallback(
    (
      login: string,
      updater: (room: TwitchChatRoomState) => TwitchChatRoomState
    ) => {
      commitRooms((current) =>
        applyRoomUpdate(current, normalizeChannelLogin(login), updater)
      )
    },
    [commitRooms]
  )

  const ensureRooms = React.useCallback(
    (channelLogins: string[]) => {
      commitRooms((current) => applyEnsureRooms(current, channelLogins))
    },
    [commitRooms]
  )

  const removeRooms = React.useCallback(
    (removedLogins: string[]) => {
      if (removedLogins.length === 0) {
        return
      }

      commitRooms((current) => {
        let changed = false
        const next = { ...current }
        for (const login of removedLogins) {
          if (login in next) {
            delete next[login]
            changed = true
          }
        }
        return changed ? next : current
      })
    },
    [commitRooms]
  )

  const clearAllRooms = React.useCallback(() => {
    commitRooms((current) =>
      Object.keys(current).length === 0 ? current : EMPTY_ROOMS
    )
  }, [commitRooms])

  const getRoom = React.useCallback(
    (login: string): TwitchChatRoomState | null => {
      const normalized = normalizeChannelLogin(login)
      return roomsRef.current[normalized] ?? null
    },
    []
  )

  const getTimeline = React.useCallback(
    (login: string) => {
      return getRoom(login)?.timeline ?? EMPTY_TIMELINE
    },
    [getRoom]
  )

  const getRoomId = React.useCallback(
    (login: string): string | null => {
      return getRoom(login)?.roomId ?? null
    },
    [getRoom]
  )

  return {
    roomsRef,
    commitRooms,
    updateRoom,
    subscribeToRoom,
    subscribeToRoomIds,
    getRoomIdsKey,
    ensureRooms,
    removeRooms,
    clearAllRooms,
    getRoom,
    getTimeline,
    getRoomId,
  }
}

export type RoomStore = ReturnType<typeof useRoomStore>
