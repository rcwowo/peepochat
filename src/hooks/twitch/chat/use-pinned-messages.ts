import * as React from "react"

import type { ChatEmotesApi } from "@/hooks/twitch/chat/use-chat-emotes"
import type { ChatterStoreApi } from "@/hooks/twitch/chat/use-chatter-store"
import type { RoomStore } from "@/hooks/twitch/chat/use-room-store"
import { canFetchPinnedChatMessages } from "@/lib/chat/moderation/permissions"
import type { TwitchAccount } from "@/lib/peepochat/peepochat-config"
import { normalizeChannelLogin } from "@/lib/twitch/channel/channel"
import {
  fetchPinnedChatMessage,
  fetchTwitchChatColor,
  TwitchApiError,
  type TwitchPinnedChatMessage,
} from "@/lib/twitch/auth/api"
import {
  channelPinnedMessageFromHelix,
  chatMessageFromPinnedHelix,
  findChatMessageInTimeline,
  isPinnedMessageExpired,
  pinnedMessagesEqual,
  type ChannelPinnedMessage,
} from "@/lib/twitch/chat/pins"

const PINNED_MESSAGE_POLL_INTERVAL_MS = 15_000
const PINNED_MESSAGE_POLL_STAGGER_MS = 400

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

type UsePinnedMessagesOptions = {
  account: TwitchAccount | null
  roomStore: RoomStore
  emotes: Pick<ChatEmotesApi, "emoteCatalogsRef" | "hydrateRoomMessage">
  chatterStore: Pick<ChatterStoreApi, "getChatterByLogin">
  syncedChannelsRef: React.RefObject<string[]>
  visibleChannelsRef: React.RefObject<string[]>
}

export function usePinnedMessages({
  account,
  roomStore,
  emotes,
  chatterStore,
  syncedChannelsRef,
  visibleChannelsRef,
}: UsePinnedMessagesOptions) {
  const { roomsRef, subscribeToRoom, subscribeToRoomIds, getRoomIdsKey } =
    roomStore
  const { emoteCatalogsRef, hydrateRoomMessage } = emotes
  const accountRef = React.useRef(account)
  const chatterStoreRef = React.useRef(chatterStore)
  const hydrateRoomMessageRef = React.useRef(hydrateRoomMessage)
  const pinsRef = React.useRef(new Map<string, ChannelPinnedMessage | null>())
  const subscribersRef = React.useRef(new Map<string, Set<() => void>>())
  const forbiddenRef = React.useRef(new Set<string>())
  const requestIdsRef = React.useRef(new Map<string, number>())
  const expiryTimersRef = React.useRef(
    new Map<string, ReturnType<typeof setTimeout>>()
  )
  const roomWatchesRef = React.useRef(new Map<string, () => void>())
  const pollInFlightRef = React.useRef(false)
  const pollQueuedRef = React.useRef(false)
  const colorFetchesRef = React.useRef(new Set<string>())

  const roomIdsKey = React.useSyncExternalStore(
    subscribeToRoomIds,
    getRoomIdsKey,
    getRoomIdsKey
  )

  React.useLayoutEffect(() => {
    accountRef.current = account
  }, [account])

  React.useLayoutEffect(() => {
    chatterStoreRef.current = chatterStore
  }, [chatterStore])

  React.useLayoutEffect(() => {
    hydrateRoomMessageRef.current = hydrateRoomMessage
  }, [hydrateRoomMessage])

  const notifyPinSubscribers = React.useCallback((login: string) => {
    const listeners = subscribersRef.current.get(login)
    if (!listeners) {
      return
    }
    for (const listener of listeners) {
      listener()
    }
  }, [])

  const clearExpiryTimer = React.useCallback((login: string) => {
    const timer = expiryTimersRef.current.get(login)
    if (timer) {
      clearTimeout(timer)
      expiryTimersRef.current.delete(login)
    }
  }, [])

  const stopRoomWatch = React.useCallback((login: string) => {
    const unsubscribe = roomWatchesRef.current.get(login)
    if (!unsubscribe) {
      return
    }
    unsubscribe()
    roomWatchesRef.current.delete(login)
  }, [])

  const setPin = React.useCallback(
    (login: string, next: ChannelPinnedMessage | null) => {
      const current = pinsRef.current.get(login) ?? null
      if (pinnedMessagesEqual(current, next)) {
        return
      }

      if (next) {
        pinsRef.current.set(login, next)
      } else {
        stopRoomWatch(login)
        pinsRef.current.delete(login)
      }

      clearExpiryTimer(login)
      if (next?.endsAt) {
        const remaining = Date.parse(next.endsAt) - Date.now()
        if (Number.isFinite(remaining) && remaining > 0) {
          expiryTimersRef.current.set(
            login,
            setTimeout(() => {
              expiryTimersRef.current.delete(login)
              const latest = pinsRef.current.get(login)
              if (latest && latest.message.id === next.message.id) {
                stopRoomWatch(login)
                pinsRef.current.delete(login)
                notifyPinSubscribers(login)
              }
            }, remaining)
          )
        }
      }

      notifyPinSubscribers(login)
    },
    [clearExpiryTimer, notifyPinSubscribers, stopRoomWatch]
  )

  const syncPinFromTimeline = React.useCallback(
    (login: string) => {
      const current = pinsRef.current.get(login)
      if (!current) {
        return
      }

      const room = roomsRef.current[login]
      const timelineMessage = findChatMessageInTimeline(
        room?.timeline ?? [],
        current.message.id
      )
      if (timelineMessage) {
        setPin(login, {
          ...current,
          message: timelineMessage,
          fromTimeline: true,
        })
        return
      }

      if (current.fromTimeline) {
        return
      }

      const roomId = room?.roomId ?? current.message.roomId
      const catalog = roomId
        ? (emoteCatalogsRef.current.get(roomId) ?? null)
        : null
      const hydrated = hydrateRoomMessageRef.current(current.message, catalog)
      if (hydrated !== current.message) {
        setPin(login, { ...current, message: hydrated })
      }
    },
    [emoteCatalogsRef, roomsRef, setPin]
  )

  const ensureRoomWatch = React.useCallback(
    (login: string) => {
      if (roomWatchesRef.current.has(login)) {
        return
      }

      const unsubscribe = subscribeToRoom(login, () => {
        syncPinFromTimeline(login)
      })
      roomWatchesRef.current.set(login, unsubscribe)
    },
    [subscribeToRoom, syncPinFromTimeline]
  )

  const clearPin = React.useCallback(
    (login: string) => {
      stopRoomWatch(login)
      clearExpiryTimer(login)
      if (pinsRef.current.has(login)) {
        pinsRef.current.delete(login)
        notifyPinSubscribers(login)
      }
    },
    [clearExpiryTimer, notifyPinSubscribers, stopRoomWatch]
  )

  const clearAllPins = React.useCallback(() => {
    const logins = [...pinsRef.current.keys(), ...roomWatchesRef.current.keys()]
    for (const login of new Set(logins)) {
      stopRoomWatch(login)
      clearExpiryTimer(login)
    }
    const hadPins = pinsRef.current.size > 0
    pinsRef.current.clear()
    forbiddenRef.current.clear()
    colorFetchesRef.current.clear()
    if (hadPins) {
      for (const login of logins) {
        notifyPinSubscribers(login)
      }
    }
  }, [clearExpiryTimer, notifyPinSubscribers, stopRoomWatch])

  const resolvePinnedMessage = React.useCallback(
    async (
      login: string,
      helixPin: TwitchPinnedChatMessage,
      currentAccount: TwitchAccount
    ): Promise<ChannelPinnedMessage> => {
      const room = roomsRef.current[login]
      const roomId = room?.roomId ?? helixPin.broadcasterId
      const timelineMessage = findChatMessageInTimeline(
        room?.timeline ?? [],
        helixPin.messageId
      )
      if (timelineMessage) {
        return channelPinnedMessageFromHelix({
          pin: helixPin,
          message: timelineMessage,
          fromTimeline: true,
        })
      }

      const chatter = chatterStoreRef.current.getChatterByLogin(
        login,
        helixPin.senderUserLogin
      )
      let color = chatter?.color ?? null
      const colorKey = `${login}:${helixPin.messageId}:${helixPin.senderUserId}`
      if (
        !color &&
        helixPin.senderUserId &&
        !colorFetchesRef.current.has(colorKey)
      ) {
        colorFetchesRef.current.add(colorKey)
        color = await fetchTwitchChatColor({
          userId: helixPin.senderUserId,
          accessToken: currentAccount.accessToken,
          clientId: currentAccount.clientId,
        })
        if (!color) {
          colorFetchesRef.current.delete(colorKey)
        }
      }

      const constructed = chatMessageFromPinnedHelix({
        pin: helixPin,
        channelLogin: login,
        roomId,
        chatter,
        color,
      })
      const catalog = roomId
        ? (emoteCatalogsRef.current.get(roomId) ?? null)
        : null

      return channelPinnedMessageFromHelix({
        pin: helixPin,
        message: hydrateRoomMessageRef.current(constructed, catalog),
        fromTimeline: false,
      })
    },
    [emoteCatalogsRef, roomsRef]
  )

  const loadPinnedMessage = React.useCallback(
    async (login: string) => {
      const currentAccount = accountRef.current
      const normalized = normalizeChannelLogin(login)
      const roomId = roomsRef.current[normalized]?.roomId?.trim() ?? ""
      if (!currentAccount || !normalized || !roomId) {
        return
      }
      if (!syncedChannelsRef.current.includes(normalized)) {
        clearPin(normalized)
        return
      }
      if (forbiddenRef.current.has(normalized)) {
        return
      }
      if (
        !canFetchPinnedChatMessages({
          account: currentAccount,
          broadcasterId: roomId,
        })
      ) {
        clearPin(normalized)
        return
      }

      const requestId = (requestIdsRef.current.get(normalized) ?? 0) + 1
      requestIdsRef.current.set(normalized, requestId)

      try {
        const helixPin = await fetchPinnedChatMessage({
          broadcasterId: roomId,
          moderatorId: currentAccount.id,
          accessToken: currentAccount.accessToken,
          clientId: currentAccount.clientId,
        })

        if (requestIdsRef.current.get(normalized) !== requestId) {
          return
        }

        if (!helixPin || isPinnedMessageExpired({ endsAt: helixPin.endsAt })) {
          clearPin(normalized)
          return
        }

        const next = await resolvePinnedMessage(
          normalized,
          helixPin,
          currentAccount
        )
        if (requestIdsRef.current.get(normalized) !== requestId) {
          return
        }
        if (isPinnedMessageExpired(next)) {
          clearPin(normalized)
          return
        }

        ensureRoomWatch(normalized)
        setPin(normalized, next)
      } catch (error) {
        if (requestIdsRef.current.get(normalized) !== requestId) {
          return
        }
        if (error instanceof TwitchApiError && error.status === 403) {
          forbiddenRef.current.add(normalized)
          clearPin(normalized)
        }
      }
    },
    [
      clearPin,
      ensureRoomWatch,
      resolvePinnedMessage,
      roomsRef,
      setPin,
      syncedChannelsRef,
    ]
  )

  const refreshVisiblePinnedMessages = React.useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) {
      return
    }
    if (pollInFlightRef.current) {
      pollQueuedRef.current = true
      return
    }

    const currentAccount = accountRef.current
    if (!currentAccount) {
      clearAllPins()
      return
    }

    pollInFlightRef.current = true
    try {
      const visible = visibleChannelsRef.current ?? []
      let refreshed = false
      for (const login of visible) {
        const normalized = normalizeChannelLogin(login)
        if (!normalized) {
          continue
        }
        if (refreshed) {
          await sleep(PINNED_MESSAGE_POLL_STAGGER_MS)
        }
        refreshed = true
        await loadPinnedMessage(normalized)
      }
    } finally {
      pollInFlightRef.current = false
      if (pollQueuedRef.current) {
        pollQueuedRef.current = false
        void refreshVisiblePinnedMessages()
      }
    }
  }, [clearAllPins, loadPinnedMessage, visibleChannelsRef])

  React.useEffect(() => {
    if (!account) {
      clearAllPins()
      return
    }

    void refreshVisiblePinnedMessages()
  }, [account, clearAllPins, refreshVisiblePinnedMessages, roomIdsKey])

  React.useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshVisiblePinnedMessages()
    }, PINNED_MESSAGE_POLL_INTERVAL_MS)
    const onVisibilityChange = () => {
      if (!document.hidden) {
        void refreshVisiblePinnedMessages()
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [refreshVisiblePinnedMessages])

  React.useEffect(() => {
    return () => {
      clearAllPins()
    }
  }, [clearAllPins])

  const notifyVisibleChannelsChanged = React.useCallback(() => {
    void refreshVisiblePinnedMessages()
  }, [refreshVisiblePinnedMessages])

  const notifyRoomReady = React.useCallback(
    (login: string) => {
      void loadPinnedMessage(login)
    },
    [loadPinnedMessage]
  )

  const notifySelfStateChanged = React.useCallback(() => {
    forbiddenRef.current.clear()
    void refreshVisiblePinnedMessages()
  }, [refreshVisiblePinnedMessages])

  const notifyChannelsChanged = React.useCallback(() => {
    const synced = new Set(syncedChannelsRef.current)
    for (const login of [...pinsRef.current.keys()]) {
      if (!synced.has(login)) {
        clearPin(login)
      }
    }
    void refreshVisiblePinnedMessages()
  }, [clearPin, refreshVisiblePinnedMessages, syncedChannelsRef])

  const subscribe = React.useCallback((login: string, listener: () => void) => {
    const normalized = normalizeChannelLogin(login)
    let listeners = subscribersRef.current.get(normalized)
    if (!listeners) {
      listeners = new Set()
      subscribersRef.current.set(normalized, listeners)
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) {
        subscribersRef.current.delete(normalized)
      }
    }
  }, [])

  const getPinnedMessage = React.useCallback((login: string) => {
    return pinsRef.current.get(normalizeChannelLogin(login)) ?? null
  }, [])

  return {
    subscribe,
    getPinnedMessage,
    notifyVisibleChannelsChanged,
    notifyRoomReady,
    notifySelfStateChanged,
    notifyChannelsChanged,
  }
}
