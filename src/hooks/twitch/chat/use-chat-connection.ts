import * as React from "react"
import { toast } from "sonner"

import type {
  PendingConnect,
  PendingConnectionRecovery,
  PendingReadConnect,
} from "@/hooks/twitch/chat/types"
import { RECONNECT_TOAST_ID } from "@/hooks/twitch/chat/types"
import type { ChatEmotesApi } from "@/hooks/twitch/chat/use-chat-emotes"
import type { ChatSendApi } from "@/hooks/twitch/chat/use-chat-send"
import type { RecentMessagesApi } from "@/hooks/twitch/chat/use-recent-messages"
import type { RoomStore } from "@/hooks/twitch/chat/use-room-store"
import type { TimelineApi } from "@/hooks/twitch/chat/use-timeline"
import { useLazyRef } from "@/hooks/use-lazy-ref"
import { devChatLogger } from "@/lib/dev-logger"
import {
  buildSyncChannelsKey,
  createEmptySenderState,
  toSelfChatState,
  type SenderState,
} from "@/lib/twitch/chat-timeline"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import {
  TwitchChatClient,
  type TwitchChatConnectOptions,
  type TwitchChatMessage,
  type TwitchClearChatEvent,
  type TwitchClearMsgEvent,
  type TwitchConnectionState,
  type TwitchSystemMessage,
} from "@/lib/twitch/twitch-chat"
import type { TwitchSelfChatState } from "@/lib/twitch/twitch-chat-types"

export type ReadClientHandlers = {
  onMessage: (message: TwitchChatMessage) => void
  onClearMsg: (event: TwitchClearMsgEvent) => void
  onClearChat: (event: TwitchClearChatEvent) => void
  onSystem: (message: TwitchSystemMessage) => void
  loadRecentMessages: (login: string) => void
  ensureRoomEmotes: (login: string, roomId: string | null) => void
  isRoomEmotesSettled: (roomId: string) => boolean
}

export type SendClientHandlers = {
  onSystemNotice: (message: TwitchSystemMessage) => void
  onSelfStateChannel: (login: string) => void
  probeSendRestrictions: () => void
}

type UseChatConnectionOptions = {
  roomStore: RoomStore
  timeline: TimelineApi
  emotes: Pick<ChatEmotesApi, "clearEmotesForRoomIds" | "clearAllEmoteState">
  recentMessages: Pick<
    RecentMessagesApi,
    "clearHistoryForLogins" | "clearAllHistoryState"
  >
  send: Pick<ChatSendApi, "clearAllSendBlocks" | "resetRateLimiter">
  readHandlersRef: React.MutableRefObject<ReadClientHandlers>
  sendHandlersRef: React.MutableRefObject<SendClientHandlers>
  syncedChannelsRef: React.MutableRefObject<string[]>
  sendClientRef: React.MutableRefObject<TwitchChatClient | null>
  selfStatesRef: React.MutableRefObject<Map<string, TwitchSelfChatState>>
  appendLog: (text: string) => void
  onSelfStateChangedRef?: React.RefObject<
    ((state: TwitchSelfChatState) => void) | null
  >
}

export function useChatConnection({
  roomStore,
  timeline,
  emotes,
  recentMessages,
  send,
  readHandlersRef,
  sendHandlersRef,
  syncedChannelsRef,
  sendClientRef,
  selfStatesRef,
  appendLog,
  onSelfStateChangedRef,
}: UseChatConnectionOptions) {
  const {
    commitRooms,
    updateRoom,
    ensureRooms,
    removeRooms,
    clearAllRooms,
    roomsRef,
  } = roomStore
  const { flushPendingForLogins, flushAllPending } = timeline
  const { clearEmotesForRoomIds, clearAllEmoteState } = emotes
  const { clearHistoryForLogins, clearAllHistoryState } = recentMessages
  const { clearAllSendBlocks, resetRateLimiter } = send

  const readClientRef = React.useRef<TwitchChatClient | null>(null)
  const pendingConnectRef = React.useRef<PendingReadConnect | null>(null)
  const pendingSendConnectRef = React.useRef<PendingConnect | null>(null)
  const sendConnectKeyRef = React.useRef("")
  const readJoinedChannelsRef = useLazyRef(() => new Set<string>())
  const connectionRecoveryRef = React.useRef<PendingConnectionRecovery | null>(
    null
  )
  const connectionRecoveryIdRef = React.useRef(0)
  const wasFullySyncedRef = React.useRef(false)
  const pendingSyncPromiseRef = React.useRef<{
    key: string
    promise: Promise<void>
  } | null>(null)
  const hasAnnouncedConnectedRef = React.useRef(false)

  const senderStateRef = React.useRef<SenderState>(createEmptySenderState())
  const [selfStates, setSelfStates] = React.useState<
    Record<string, TwitchSelfChatState>
  >({})

  const [connectionState, setConnectionState] =
    React.useState<TwitchConnectionState>({
      connected: false,
      connecting: false,
      lastError: null,
    })
  const [sendConnectionState, setSendConnectionState] =
    React.useState<TwitchConnectionState>({
      connected: false,
      connecting: false,
      lastError: null,
    })

  const updateSelfState = React.useCallback(
    (state: TwitchSelfChatState) => {
      selfStatesRef.current.set(state.channel, state)
      setSelfStates((current) => ({
        ...current,
        [state.channel]: state,
      }))
      senderStateRef.current = {
        color: state.color,
        badges: state.badges,
        displayName: state.displayName || null,
        isBroadcaster: state.isBroadcaster,
        isModerator: state.isModerator,
        isSubscriber: state.isSubscriber,
        isVip: state.isVip,
      }
      onSelfStateChangedRef?.current?.(state)
    },
    [onSelfStateChangedRef, selfStatesRef, senderStateRef]
  )

  const getSelfChatState = React.useCallback(
    (login: string): TwitchSelfChatState | null => {
      const normalized = normalizeChannelLogin(login)
      return selfStates[normalized] ?? null
    },
    [selfStates]
  )

  const isReadConnectionSynced = React.useCallback(() => {
    const expected = syncedChannelsRef.current
    return (
      expected.length > 0 &&
      Boolean(readClientRef.current?.isConnected) &&
      expected.every((login) => readJoinedChannelsRef.current.has(login))
    )
  }, [readClientRef, readJoinedChannelsRef, syncedChannelsRef])

  const isConnectionFullySynced = React.useCallback(() => {
    const sendConnectionExpected = sendConnectKeyRef.current.length > 0
    return (
      isReadConnectionSynced() &&
      (!sendConnectionExpected || Boolean(sendClientRef.current?.isConnected))
    )
  }, [isReadConnectionSynced, sendClientRef])

  const finishConnectionRecovery = React.useCallback(() => {
    const recovery = connectionRecoveryRef.current
    if (!recovery) {
      return
    }

    connectionRecoveryRef.current = null
    recovery.resolve()
    toast.success("Reconnected.", {
      id: RECONNECT_TOAST_ID,
      duration: 4_000,
    })
  }, [])

  const markConnectionSyncedIfReady = React.useCallback(() => {
    if (!isConnectionFullySynced()) {
      return
    }

    wasFullySyncedRef.current = true
    finishConnectionRecovery()
  }, [finishConnectionRecovery, isConnectionFullySynced])

  const beginConnectionRecovery = React.useCallback(() => {
    if (
      !wasFullySyncedRef.current ||
      syncedChannelsRef.current.length === 0 ||
      connectionRecoveryRef.current
    ) {
      return
    }

    let resolveRecovery!: () => void
    const promise = new Promise<void>((resolve) => {
      resolveRecovery = resolve
    })
    const recovery = {
      id: connectionRecoveryIdRef.current + 1,
      promise,
      resolve: resolveRecovery,
    }

    connectionRecoveryIdRef.current = recovery.id
    connectionRecoveryRef.current = recovery

    toast.loading(
      "It looks like you've lost connection. Trying to reconnect...",
      {
        id: RECONNECT_TOAST_ID,
        duration: Infinity,
      }
    )
  }, [syncedChannelsRef])

  const handleReadConnectionLost = React.useCallback(
    (reason: string) => {
      beginConnectionRecovery()
      setConnectionState((prev) => ({
        ...prev,
        connected: false,
        connecting: true,
        lastError: reason,
      }))
    },
    [beginConnectionRecovery]
  )

  const handleSendConnectionLost = React.useCallback(
    (reason: string) => {
      beginConnectionRecovery()
      setSendConnectionState((prev) => ({
        ...prev,
        connected: false,
        connecting: true,
        lastError: reason,
      }))
    },
    [beginConnectionRecovery]
  )

  const completePendingReadSyncIfReady = React.useCallback(() => {
    const pending = pendingConnectRef.current
    if (!pending || !readClientRef.current?.isConnected) {
      return
    }

    if (
      pending.expectedChannels.some(
        (login) => !readJoinedChannelsRef.current.has(login)
      )
    ) {
      return
    }

    pendingConnectRef.current = null
    pending.resolve()
  }, [pendingConnectRef, readClientRef, readJoinedChannelsRef])

  const resolveConnectionRecovery = React.useCallback(() => {
    const recovery = connectionRecoveryRef.current
    if (!recovery) {
      return
    }

    connectionRecoveryRef.current = null
    recovery.resolve()
    toast.dismiss(RECONNECT_TOAST_ID)
  }, [])

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const handleOffline = () => {
      readClientRef.current?.forceReconnect("Browser went offline")
      sendClientRef.current?.forceReconnect("Browser went offline")
    }

    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("offline", handleOffline)
    }
  }, [sendClientRef])

  const getReadClient = React.useCallback(() => {
    if (readClientRef.current) return readClientRef.current

    const client = new TwitchChatClient((event) => {
      const handlers = readHandlersRef.current
      switch (event.type) {
        case "connection-lost":
          handleReadConnectionLost(event.reason)
          break
        case "connected":
          setConnectionState((prev) => ({
            ...prev,
            connected: true,
            connecting: false,
            lastError: null,
          }))
          if (!hasAnnouncedConnectedRef.current) {
            hasAnnouncedConnectedRef.current = true
          }
          completePendingReadSyncIfReady()
          markConnectionSyncedIfReady()
          break
        case "disconnected":
          readJoinedChannelsRef.current.clear()
          senderStateRef.current = createEmptySenderState()
          selfStatesRef.current.clear()
          setSelfStates({})
          setConnectionState((prev) => ({
            ...prev,
            connected: false,
            connecting: connectionRecoveryRef.current ? true : false,
            lastError: event.reason,
          }))
          commitRooms((current) => {
            const next = { ...current }
            const syncedChannels = new Set(syncedChannelsRef.current)
            for (const login of Object.keys(next)) {
              next[login] = {
                ...next[login],
                joined: false,
                joining: syncedChannels.has(login),
              }
            }
            return next
          })
          pendingConnectRef.current?.reject(
            new Error(event.reason ?? "Disconnected")
          )
          pendingConnectRef.current = null
          break
        case "channel-joined":
          readJoinedChannelsRef.current.add(event.channel)
          updateRoom(event.channel, (room) => ({
            ...room,
            joined: true,
            joining: false,
          }))
          handlers.loadRecentMessages(event.channel)
          completePendingReadSyncIfReady()
          markConnectionSyncedIfReady()
          break
        case "channel-parted":
          readJoinedChannelsRef.current.delete(event.channel)
          updateRoom(event.channel, (room) => ({
            ...room,
            joined: false,
            joining: false,
          }))
          break
        case "room-state": {
          const login = normalizeChannelLogin(event.state.channel)
          readJoinedChannelsRef.current.add(login)
          updateRoom(login, (room) => ({
            ...room,
            roomId: event.state.roomId,
            joined: true,
            joining: false,
          }))
          if (
            event.state.roomId &&
            !handlers.isRoomEmotesSettled(event.state.roomId)
          ) {
            handlers.ensureRoomEmotes(login, event.state.roomId)
          }
          handlers.loadRecentMessages(login)
          completePendingReadSyncIfReady()
          markConnectionSyncedIfReady()
          break
        }
        case "self-state":
          updateSelfState(toSelfChatState(event.state))
          break
        case "message":
          handlers.onMessage(event.message)
          break
        case "clear-msg":
          handlers.onClearMsg(event.event)
          break
        case "clear-chat":
          handlers.onClearChat(event.event)
          break
        case "system":
          handlers.onSystem(event.message)
          break
        case "log":
          appendLog(event.text)
          break
        case "error":
          appendLog(event.text)
          setConnectionState((prev) => ({
            ...prev,
            lastError: event.text,
          }))
          pendingConnectRef.current?.reject(new Error(event.text))
          pendingConnectRef.current = null
          break
      }
    }, "read")

    readClientRef.current = client
    return client
  }, [
    appendLog,
    commitRooms,
    completePendingReadSyncIfReady,
    connectionRecoveryRef,
    handleReadConnectionLost,
    hasAnnouncedConnectedRef,
    markConnectionSyncedIfReady,
    pendingConnectRef,
    readClientRef,
    readHandlersRef,
    readJoinedChannelsRef,
    selfStatesRef,
    senderStateRef,
    syncedChannelsRef,
    updateRoom,
    updateSelfState,
  ])

  const getSendClient = React.useCallback(() => {
    if (sendClientRef.current) return sendClientRef.current

    const client = new TwitchChatClient((event) => {
      const handlers = sendHandlersRef.current
      switch (event.type) {
        case "connection-lost":
          handleSendConnectionLost(event.reason)
          break
        case "connected":
          setSendConnectionState((prev) => ({
            ...prev,
            connected: true,
            connecting: false,
            lastError: null,
          }))
          pendingSendConnectRef.current?.resolve()
          pendingSendConnectRef.current = null
          handlers.probeSendRestrictions()
          markConnectionSyncedIfReady()
          break
        case "disconnected":
          setSendConnectionState((prev) => ({
            ...prev,
            connected: false,
            connecting: connectionRecoveryRef.current ? true : false,
            lastError: event.reason,
          }))
          pendingSendConnectRef.current?.reject(
            new Error(event.reason ?? "Send connection lost")
          )
          pendingSendConnectRef.current = null
          break
        case "self-state":
          updateSelfState(toSelfChatState(event.state))
          {
            const login = normalizeChannelLogin(event.state.channel)
            handlers.onSelfStateChannel(login)
          }
          break
        case "system":
          handlers.onSystemNotice(event.message)
          break
        case "log":
          appendLog(event.text)
          break
        case "error":
          appendLog(event.text)
          setSendConnectionState((prev) => ({
            ...prev,
            lastError: event.text,
          }))
          pendingSendConnectRef.current?.reject(new Error(event.text))
          pendingSendConnectRef.current = null
          break
      }
    }, "send")

    sendClientRef.current = client
    return client
  }, [
    appendLog,
    handleSendConnectionLost,
    markConnectionSyncedIfReady,
    sendClientRef,
    sendHandlersRef,
    updateSelfState,
  ])

  React.useEffect(() => {
    const readClient = readClientRef
    const sendClient = sendClientRef
    return () => {
      // React Strict Mode remounts immediately in dev; closing here interrupts
      // the in-flight Twitch IRC handshake before the remounted hook reuses it.
      if (import.meta.env.DEV) {
        return
      }

      readClient.current?.close()
      readClient.current = null
      sendClient.current?.close()
      sendClient.current = null
    }
  }, [readClientRef, sendClientRef])

  const pruneRemovedChannelState = React.useCallback(
    (removedLogins: string[]) => {
      if (removedLogins.length === 0) {
        return
      }

      flushPendingForLogins(removedLogins)

      const roomIds: string[] = []
      for (const login of removedLogins) {
        readJoinedChannelsRef.current.delete(login)
        selfStatesRef.current.delete(login)

        const roomId = roomsRef.current[login]?.roomId
        if (roomId) {
          roomIds.push(roomId)
        }
      }

      clearHistoryForLogins(removedLogins)
      clearEmotesForRoomIds(roomIds)

      setSelfStates((current) => {
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

      removeRooms(removedLogins)
    },
    [
      clearEmotesForRoomIds,
      clearHistoryForLogins,
      flushPendingForLogins,
      readJoinedChannelsRef,
      removeRooms,
      roomsRef,
      selfStatesRef,
    ]
  )

  const syncSendConnection = React.useCallback(
    (options: TwitchChatConnectOptions = {}): Promise<void> => {
      const token = options.accessToken?.trim()
      const nick = options.nick?.trim()
      const hasAuth = Boolean(token && nick)
      const connectKey = `${token ?? ""}\u0001${nick ?? ""}`

      if (!hasAuth || syncedChannelsRef.current.length === 0) {
        sendConnectKeyRef.current = ""
        sendClientRef.current?.close()
        sendClientRef.current = null
        setSendConnectionState({
          connected: false,
          connecting: false,
          lastError: null,
        })
        return Promise.resolve()
      }

      if (
        sendClientRef.current?.isConnected &&
        sendConnectKeyRef.current === connectKey
      ) {
        sendHandlersRef.current.probeSendRestrictions()
        return Promise.resolve()
      }

      if (sendClientRef.current) {
        sendClientRef.current.close()
        sendClientRef.current = null
      }

      sendConnectKeyRef.current = connectKey

      setSendConnectionState((prev) => ({
        ...prev,
        connecting: !prev.connected,
        lastError: null,
      }))

      return new Promise<void>((resolve, reject) => {
        pendingSendConnectRef.current = { resolve, reject }
        getSendClient().openSendSession(options)
      }).catch((error) => {
        devChatLogger.warn("send:connect-failed", error)
        return undefined
      })
    },
    [
      getSendClient,
      sendClientRef,
      sendConnectKeyRef,
      sendHandlersRef,
      syncedChannelsRef,
    ]
  )

  const syncChannels = React.useCallback(
    (
      channelLogins: string[],
      options: TwitchChatConnectOptions = {}
    ): Promise<void> => {
      const normalized = [
        ...new Set(
          channelLogins.flatMap((login) => {
            const value = normalizeChannelLogin(login)
            return value ? [value] : []
          })
        ),
      ]
      const syncKey = buildSyncChannelsKey(normalized)

      const previous = syncedChannelsRef.current
      const unchanged =
        previous.length === normalized.length &&
        previous.every((login, index) => login === normalized[index])

      syncedChannelsRef.current = normalized

      if (unchanged && normalized.length > 0 && isReadConnectionSynced()) {
        completePendingReadSyncIfReady()
        return syncSendConnection(options).then(() => {
          markConnectionSyncedIfReady()
        })
      }

      const inFlight = pendingSyncPromiseRef.current
      if (inFlight && inFlight.key === syncKey) {
        void syncSendConnection(options)
        return inFlight.promise
      }

      if (normalized.length === 0) {
        flushAllPending()

        pendingSyncPromiseRef.current = null
        pendingConnectRef.current?.resolve()
        pendingConnectRef.current = null
        pendingSendConnectRef.current?.resolve()
        pendingSendConnectRef.current = null
        readJoinedChannelsRef.current.clear()
        wasFullySyncedRef.current = false
        resolveConnectionRecovery()
        readClientRef.current?.close()
        readClientRef.current = null
        sendClientRef.current?.close()
        sendClientRef.current = null
        resetRateLimiter()
        clearAllSendBlocks()
        hasAnnouncedConnectedRef.current = false
        clearAllEmoteState()
        selfStatesRef.current.clear()
        setSelfStates({})
        clearAllHistoryState()
        setConnectionState({
          connected: false,
          connecting: false,
          lastError: null,
        })
        setSendConnectionState({
          connected: false,
          connecting: false,
          lastError: null,
        })
        clearAllRooms()
        return Promise.resolve()
      }

      const removedLogins = previous.filter(
        (login) => !normalized.includes(login)
      )
      pruneRemovedChannelState(removedLogins)

      ensureRooms(normalized)

      for (const login of normalized) {
        readHandlersRef.current.loadRecentMessages(login)
      }

      if (pendingConnectRef.current) {
        pendingConnectRef.current.resolve()
        pendingConnectRef.current = null
      }

      setConnectionState((prev) => ({
        ...prev,
        connecting: !prev.connected,
        lastError: null,
      }))

      const readSyncPromise = new Promise<void>((resolve, reject) => {
        pendingConnectRef.current = {
          key: syncKey,
          expectedChannels: normalized,
          resolve,
          reject,
        }
        getReadClient().setChannels(normalized, {})
      })
      completePendingReadSyncIfReady()

      const promise = readSyncPromise.then(() =>
        syncSendConnection(options).then(() => {
          markConnectionSyncedIfReady()
        })
      )

      pendingSyncPromiseRef.current = { key: syncKey, promise }
      void promise
        .finally(() => {
          if (pendingSyncPromiseRef.current?.promise === promise) {
            pendingSyncPromiseRef.current = null
          }
        })
        .catch(() => undefined)

      return promise
    },
    [
      clearAllEmoteState,
      clearAllHistoryState,
      clearAllRooms,
      clearAllSendBlocks,
      completePendingReadSyncIfReady,
      ensureRooms,
      flushAllPending,
      getReadClient,
      hasAnnouncedConnectedRef,
      isReadConnectionSynced,
      markConnectionSyncedIfReady,
      pendingConnectRef,
      pendingSendConnectRef,
      pendingSyncPromiseRef,
      pruneRemovedChannelState,
      readClientRef,
      readHandlersRef,
      readJoinedChannelsRef,
      resetRateLimiter,
      resolveConnectionRecovery,
      selfStatesRef,
      sendClientRef,
      syncedChannelsRef,
      syncSendConnection,
      wasFullySyncedRef,
    ]
  )

  return {
    connectionState,
    sendConnectionState,
    syncedChannelsRef,
    sendClientRef,
    selfStatesRef,
    senderStateRef,
    getSendClient,
    getReadClient,
    syncChannels,
    updateSelfState,
    getSelfChatState,
  }
}

export type ChatConnectionApi = ReturnType<typeof useChatConnection>
