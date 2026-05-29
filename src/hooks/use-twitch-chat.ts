import * as React from "react"

import {
  clearBroadcasterProfileCache,
  clearChannelTwitchEmoteCache,
  clearRoomEmoteBundleCache,
  clearTwitchEmoteSessionCache,
  createEmptyComposerCatalog,
  fetchRoomEmoteBundle,
  getTwitchEmoteHydration,
  type ChannelProfileHint,
  type ComposerEmoteCatalog,
} from "@/lib/chat-emote-catalog"
import {
  clearThirdPartyEmoteCache,
  createEmptyEmoteCatalog,
  hydrateMessageEmotes,
  type ThirdPartyEmoteCatalog,
  type TwitchEmoteHydration,
} from "@/lib/chat-emotes"
import { normalizeChannelLogin } from "@/lib/twitch-channel"
import {
  createRecentMessagesStatusMessage,
  fetchRecentMessages,
  RECENT_MESSAGES_CONCURRENCY,
  RECENT_MESSAGES_ERROR_TEXT,
  RECENT_MESSAGES_UNAVAILABLE_TEXT,
} from "@/lib/recent-messages"
import {
  LIVE_MESSAGES_PER_CHANNEL_DEFAULT,
} from "@/lib/peepochat-config"
import {
  createLocalChatMessage,
  TwitchChatClient,
  type TwitchBadge,
  type TwitchChatConnectOptions,
  type TwitchChatMessage,
  type TwitchConnectionState,
  type TwitchSystemMessage,
} from "@/lib/twitch-chat"
/** Back off automatic emote reloads after a failed fetch (avoids 429 retry storms). */
const EMOTE_LOAD_RETRY_MS = 60_000

export type TwitchTimelineItem =
  | { kind: "chat"; message: TwitchChatMessage; isHistorical?: boolean }
  | { kind: "system"; message: TwitchSystemMessage; isHistorical?: boolean }

export type TwitchChatRoomState = {
  login: string
  roomId: string | null
  joined: boolean
  joining: boolean
  timeline: TwitchTimelineItem[]
}

export type TwitchChatEmoteLoadContext = {
  accessToken?: string
  clientId?: string
  userId?: string
  userLogin?: string
  userDisplayName?: string
  channelHints?: ChannelProfileHint[]
}

type PendingConnect = {
  resolve: () => void
  reject: (err: Error) => void
}

function createEmptyRoom(login: string): TwitchChatRoomState {
  return {
    login,
    roomId: null,
    joined: false,
    joining: true,
    timeline: [],
  }
}

export function useTwitchChat(options?: {
  onChatMessageRef?: React.RefObject<((message: TwitchChatMessage) => void) | null>
  onChatMessagesRef?: React.RefObject<
    ((messages: TwitchChatMessage[]) => void) | null
  >
}) {
  const onChatMessageRef = options?.onChatMessageRef
  const onChatMessagesRef = options?.onChatMessagesRef
  const clientRef = React.useRef<TwitchChatClient | null>(null)
  const pendingConnectRef = React.useRef<PendingConnect | null>(null)
  const pendingRoomMessagesRef = React.useRef(
    new Map<string, Map<string, TwitchChatMessage[]>>()
  )
  const emoteCatalogsRef = React.useRef(new Map<string, ThirdPartyEmoteCatalog>())
  const composerCatalogsRef = React.useRef(new Map<string, ComposerEmoteCatalog>())
  const [composerCatalogs, setComposerCatalogs] = React.useState<
    Record<string, ComposerEmoteCatalog>
  >({})
  const [composerCatalogLoading, setComposerCatalogLoading] = React.useState<
    Record<string, boolean>
  >({})
  const roomEmotesLoadingRef = React.useRef(new Map<string, boolean>())
  const roomEmotesSettledRef = React.useRef(new Set<string>())
  const roomEmotesFailedAtRef = React.useRef(new Map<string, number>())
  const composerCatalogLoadingRef = React.useRef(new Map<string, boolean>())
  const composerCatalogLoadedRef = React.useRef(new Set<string>())
  const emoteLoadContextRef = React.useRef<TwitchChatEmoteLoadContext>({})
  const senderStateRef = React.useRef<{
    color: string | null
    badges: TwitchBadge[]
    displayName: string | null
    isModerator: boolean
    isSubscriber: boolean
  }>({
    color: null,
    badges: [],
    displayName: null,
    isModerator: false,
    isSubscriber: false,
  })
  const emoteCatalogGenerationRef = React.useRef(0)
  const hasAnnouncedConnectedRef = React.useRef(false)
  const syncedChannelsRef = React.useRef<string[]>([])
  const recentMessagesEnabledRef = React.useRef(true)
  const liveMessageLimitRef = React.useRef(LIVE_MESSAGES_PER_CHANNEL_DEFAULT)
  const historyLoadedRef = React.useRef(new Set<string>())
  const historyLoadingRef = React.useRef(new Set<string>())
  const historyErrorNotifiedRef = React.useRef(new Set<string>())
  const recentMessagesGenerationRef = React.useRef(0)
  const recentMessagesQueueRef = React.useRef<string[]>([])
  const recentMessagesQueuedRef = React.useRef(new Set<string>())
  const recentMessagesActiveRef = React.useRef(0)

  const [connectionState, setConnectionState] =
    React.useState<TwitchConnectionState>({
      connected: false,
      connecting: false,
      lastError: null,
    })
  const [rooms, setRooms] = React.useState<Record<string, TwitchChatRoomState>>(
    {}
  )
  const roomsRef = React.useRef(rooms)
  React.useEffect(() => {
    roomsRef.current = rooms
  }, [rooms])
  const [logs, setLogs] = React.useState<string[]>([])

  const appendLog = React.useCallback((text: string) => {
    setLogs((current) => [text, ...current].slice(0, 20))
  }, [])

  const updateRoom = React.useCallback(
    (
      login: string,
      updater: (room: TwitchChatRoomState) => TwitchChatRoomState
    ) => {
      setRooms((current) => {
        const existing = current[login] ?? createEmptyRoom(login)
        return { ...current, [login]: updater(existing) }
      })
    },
    []
  )

  const partitionTimeline = React.useCallback((timeline: TwitchTimelineItem[]) => {
    const historical: TwitchTimelineItem[] = []
    const live: TwitchTimelineItem[] = []

    for (const entry of timeline) {
      if (entry.isHistorical) {
        historical.push(entry)
      } else {
        live.push(entry)
      }
    }

    return { historical, live }
  }, [])

  const trimTimeline = React.useCallback((timeline: TwitchTimelineItem[]) => {
    return timeline.slice(-liveMessageLimitRef.current)
  }, [])

  const getTimelineMessageIds = React.useCallback(
    (timeline: TwitchTimelineItem[]) => {
      const ids = new Set<string>()
      for (const entry of timeline) {
        ids.add(entry.message.id)
      }
      return ids
    },
    []
  )

  const appendRoomTimeline = React.useCallback(
    (login: string, items: TwitchTimelineItem[]) => {
      if (items.length === 0) return

      updateRoom(login, (room) => {
        const { historical, live } = partitionTimeline(room.timeline)
        const knownIds = getTimelineMessageIds(room.timeline)
        const nextLive = [...live]

        for (const item of items) {
          if (item.isHistorical) {
            continue
          }

          if (knownIds.has(item.message.id)) {
            continue
          }

          knownIds.add(item.message.id)
          nextLive.push(item)
        }

        return {
          ...room,
          timeline: trimTimeline([...historical, ...nextLive]),
        }
      })
    },
    [getTimelineMessageIds, partitionTimeline, trimTimeline, updateRoom]
  )

  const prependHistoricalTimeline = React.useCallback(
    (login: string, items: TwitchTimelineItem[]) => {
      if (items.length === 0) return

      updateRoom(login, (room) => {
        const { historical, live } = partitionTimeline(room.timeline)
        const knownIds = getTimelineMessageIds(room.timeline)
        const nextHistorical = [...historical]

        for (const item of items) {
          if (knownIds.has(item.message.id)) {
            continue
          }

          knownIds.add(item.message.id)
          nextHistorical.push({ ...item, isHistorical: true })
        }

        return {
          ...room,
          timeline: trimTimeline([...nextHistorical, ...live]),
        }
      })
    },
    [getTimelineMessageIds, partitionTimeline, trimTimeline, updateRoom]
  )

  const clearHistoricalTimeline = React.useCallback(
    (login?: string) => {
      const clearRoom = (room: TwitchChatRoomState): TwitchChatRoomState => {
        const { live } = partitionTimeline(room.timeline)
        return { ...room, timeline: live }
      }

      if (login) {
        updateRoom(login, clearRoom)
        return
      }

      setRooms((current) => {
        const next = { ...current }
        for (const channelLogin of Object.keys(next)) {
          next[channelLogin] = clearRoom(next[channelLogin])
        }
        return next
      })
    },
    [partitionTimeline, updateRoom]
  )

  const appendRoomSystemMessage = React.useCallback(
    (login: string, message: TwitchSystemMessage) => {
      appendRoomTimeline(login, [{ kind: "system", message }])
    },
    [appendRoomTimeline]
  )

  const getTwitchHydration = React.useCallback(
    (roomId: string | null): TwitchEmoteHydration | null => {
      if (!roomId) {
        return null
      }

      const catalog = composerCatalogsRef.current.get(roomId)
      return catalog ? getTwitchEmoteHydration(catalog) : null
    },
    []
  )

  const hydrateRoomMessage = React.useCallback(
    (
      message: TwitchChatMessage,
      thirdPartyCatalog: ThirdPartyEmoteCatalog | null
    ) => {
      return hydrateMessageEmotes(
        message,
        thirdPartyCatalog,
        getTwitchHydration(message.roomId)
      )
    },
    [getTwitchHydration]
  )

  const flushPendingRoomMessages = React.useCallback(
    (login: string, roomId: string, useCatalog: boolean) => {
      const roomPending = pendingRoomMessagesRef.current.get(login)
      const pending = roomPending?.get(roomId)
      if (!pending || pending.length === 0) {
        return
      }

      roomPending?.delete(roomId)
      const catalog = useCatalog
        ? (emoteCatalogsRef.current.get(roomId) ?? null)
        : null

      const hydrated = pending.map((message) =>
        hydrateRoomMessage(message, catalog)
      )
      appendRoomTimeline(
        login,
        hydrated.map((message) => ({ kind: "chat" as const, message }))
      )
      onChatMessagesRef?.current?.(hydrated) ??
        hydrated.forEach((message) => onChatMessageRef?.current?.(message))
    },
    [
      appendRoomTimeline,
      hydrateRoomMessage,
      onChatMessageRef,
      onChatMessagesRef,
    ]
  )

  const queuePendingRoomMessage = React.useCallback(
    (login: string, message: TwitchChatMessage) => {
      const roomId = message.roomId
      if (!roomId) {
        const hydrated = hydrateRoomMessage(message, null)
        appendRoomTimeline(login, [{ kind: "chat", message: hydrated }])
        onChatMessageRef?.current?.(hydrated)
        return
      }

      const roomPending =
        pendingRoomMessagesRef.current.get(login) ??
        new Map<string, TwitchChatMessage[]>()
      const pending = roomPending.get(roomId) ?? []
      pending.push(message)
      roomPending.set(roomId, pending)
      pendingRoomMessagesRef.current.set(login, roomPending)
    },
    [appendRoomTimeline, hydrateRoomMessage, onChatMessageRef]
  )

  const rehydrateRoomTimeline = React.useCallback(
    (login: string, roomId: string) => {
      const thirdPartyCatalog = emoteCatalogsRef.current.get(roomId) ?? null
      const twitchHydration = getTwitchHydration(roomId)

      if (!thirdPartyCatalog && !twitchHydration) {
        return
      }

      setRooms((current) => {
        const room = current[login]
        if (!room) return current

        return {
          ...current,
          [login]: {
            ...room,
            timeline: room.timeline.map((entry) => {
              if (entry.kind !== "chat") return entry
              if (entry.message.roomId !== roomId) return entry

              return {
                ...entry,
                message: hydrateMessageEmotes(
                  entry.message,
                  thirdPartyCatalog,
                  twitchHydration
                ),
              }
            }),
          },
        }
      })
    },
    [getTwitchHydration]
  )

  /**
   * Loads third-party + Twitch emotes once per room. Hook refs guard React
   * re-entrancy; `fetchRoomEmoteBundle` dedupes in-flight network work.
   */
  const ensureRoomEmotes = React.useCallback(
    (login: string, roomId: string | null) => {
      if (!roomId) {
        return
      }

      if (roomEmotesSettledRef.current.has(roomId)) {
        return
      }

      if (roomEmotesLoadingRef.current.get(roomId)) {
        return
      }

      const failedAt = roomEmotesFailedAtRef.current.get(roomId)
      if (failedAt !== undefined) {
        if (Date.now() - failedAt < EMOTE_LOAD_RETRY_MS) {
          return
        }
        roomEmotesFailedAtRef.current.delete(roomId)
      }

      roomEmotesLoadingRef.current.set(roomId, true)
      composerCatalogLoadingRef.current.set(roomId, true)
      setComposerCatalogLoading((current) => ({ ...current, [roomId]: true }))

      const generation = emoteCatalogGenerationRef.current
      const context = emoteLoadContextRef.current

      void fetchRoomEmoteBundle({
        roomId,
        channelLogin: login,
        accessToken: context.accessToken,
        clientId: context.clientId,
        userId: context.userId,
        channelHints: context.channelHints,
      })
        .then((bundle) => {
          if (generation !== emoteCatalogGenerationRef.current) {
            return
          }

          roomEmotesFailedAtRef.current.delete(roomId)
          emoteCatalogsRef.current.set(roomId, bundle.thirdParty)
          composerCatalogLoadedRef.current.add(roomId)
          composerCatalogsRef.current.set(roomId, bundle.composer)
          roomEmotesSettledRef.current.add(roomId)
          setComposerCatalogs((current) => ({
            ...current,
            [roomId]: bundle.composer,
          }))
          rehydrateRoomTimeline(login, roomId)
          flushPendingRoomMessages(login, roomId, true)
          appendLog(
            `Loaded ${bundle.composer.byCode.size} emotes for #${login}`
          )
        })
        .catch(() => {
          if (generation !== emoteCatalogGenerationRef.current) {
            return
          }

          roomEmotesFailedAtRef.current.set(roomId, Date.now())
          appendLog(`Emotes could not be loaded for #${login}.`)
        })
        .finally(() => {
          roomEmotesLoadingRef.current.delete(roomId)
          composerCatalogLoadingRef.current.delete(roomId)

          if (generation !== emoteCatalogGenerationRef.current) {
            return
          }

          setComposerCatalogLoading((current) => {
            if (!current[roomId]) return current
            const next = { ...current }
            delete next[roomId]
            return next
          })
        })
    },
    [
      appendLog,
      flushPendingRoomMessages,
      rehydrateRoomTimeline,
    ]
  )

  const routeMessageToRoom = React.useCallback(
    (message: TwitchChatMessage) => {
      const login = normalizeChannelLogin(message.channel)
      const roomId = message.roomId

      if (roomId) {
        updateRoom(login, (room) => ({
          ...room,
          roomId: room.roomId ?? roomId,
        }))
      }

      if (roomId && !emoteCatalogsRef.current.has(roomId)) {
        ensureRoomEmotes(login, roomId)
        queuePendingRoomMessage(login, message)
        return
      }

      const catalog = roomId
        ? (emoteCatalogsRef.current.get(roomId) ?? null)
        : null

      const hydrated = hydrateRoomMessage(message, catalog)
      appendRoomTimeline(login, [{ kind: "chat", message: hydrated }])
      onChatMessageRef?.current?.(hydrated)
    },
    [
      appendRoomTimeline,
      ensureRoomEmotes,
      hydrateRoomMessage,
      onChatMessageRef,
      queuePendingRoomMessage,
      updateRoom,
    ]
  )

  const routeSystemMessage = React.useCallback(
    (message: TwitchSystemMessage) => {
      const login = message.channel
        ? normalizeChannelLogin(message.channel)
        : null

      if (login) {
        if (message.roomId) {
          updateRoom(login, (room) => ({
            ...room,
            roomId: room.roomId ?? message.roomId,
          }))
        }

        if (
          message.event === "subscription" &&
          message.details &&
          message.detailsEmotes &&
          message.detailsEmotes.length > 0
        ) {
          const roomId = message.roomId
          const thirdPartyCatalog = roomId
            ? (emoteCatalogsRef.current.get(roomId) ?? null)
            : null

          const hydrated = hydrateRoomMessage(
            {
              id: message.id,
              channel: login,
              roomId: message.roomId,
              userName: message.actor?.userName ?? "system",
              displayName: message.actor?.displayName ?? "System",
              text: message.details,
              color: message.actor?.color ?? null,
              receivedAt: message.receivedAt,
              badges: [],
              emotes: message.detailsEmotes,
              reply: null,
              flags: {
                isBroadcaster: false,
                isModerator: false,
                isSubscriber: false,
                isVip: false,
                isFirst: false,
                isAction: false,
              },
            },
            thirdPartyCatalog
          )

          message = { ...message, detailsEmotes: hydrated.emotes }
        }

        appendRoomSystemMessage(login, message)
        return
      }

      setRooms((current) => {
        const next = { ...current }
        for (const channelLogin of Object.keys(next)) {
          const room = next[channelLogin]
          const { historical, live } = partitionTimeline(room.timeline)
          next[channelLogin] = {
            ...room,
            timeline: trimTimeline([
              ...historical,
              ...live,
              { kind: "system" as const, message },
            ]),
          }
        }
        return next
      })
    },
    [
      appendRoomSystemMessage,
      hydrateRoomMessage,
      partitionTimeline,
      trimTimeline,
      updateRoom,
    ]
  )

  const shouldApplyRecentMessagesFetch = React.useCallback(
    (normalized: string, generation: number) => {
      return (
        recentMessagesEnabledRef.current &&
        syncedChannelsRef.current.includes(normalized) &&
        recentMessagesGenerationRef.current === generation
      )
    },
    []
  )

  const clearRecentMessagesQueue = React.useCallback(() => {
    recentMessagesQueueRef.current = []
    recentMessagesQueuedRef.current.clear()
    recentMessagesGenerationRef.current += 1
  }, [])

  const drainRecentMessagesQueue = React.useCallback(() => {
    const runNext = () => {
      while (
        recentMessagesActiveRef.current < RECENT_MESSAGES_CONCURRENCY &&
        recentMessagesQueueRef.current.length > 0
      ) {
        const normalized = recentMessagesQueueRef.current.shift()
        if (!normalized) {
          continue
        }

        recentMessagesActiveRef.current += 1
        const generation = recentMessagesGenerationRef.current

        void (async () => {
          if (!shouldApplyRecentMessagesFetch(normalized, generation)) {
            return
          }

          historyLoadingRef.current.add(normalized)

          try {
            const outcome = await fetchRecentMessages(normalized)

            if (!shouldApplyRecentMessagesFetch(normalized, generation)) {
              return
            }

            switch (outcome.status) {
              case "success": {
                historyLoadedRef.current.add(normalized)

                if (outcome.messages.length === 0) {
                  return
                }

                const roomId =
                  outcome.messages.find((message) => message.roomId)?.roomId ??
                  null

                if (roomId) {
                  updateRoom(normalized, (room) => ({
                    ...room,
                    roomId: room.roomId ?? roomId,
                  }))
                  if (!roomEmotesSettledRef.current.has(roomId)) {
                    ensureRoomEmotes(normalized, roomId)
                  }
                }

                const catalog = roomId
                  ? (emoteCatalogsRef.current.get(roomId) ?? null)
                  : null

                prependHistoricalTimeline(
                  normalized,
                  outcome.messages.map((message) => ({
                    kind: "chat" as const,
                    message: hydrateRoomMessage(message, catalog),
                    isHistorical: true,
                  }))
                )
                return
              }
              case "unavailable": {
                historyLoadedRef.current.add(normalized)
                appendRoomSystemMessage(
                  normalized,
                  createRecentMessagesStatusMessage(
                    normalized,
                    RECENT_MESSAGES_UNAVAILABLE_TEXT
                  )
                )
                return
              }
              case "error": {
                if (historyErrorNotifiedRef.current.has(normalized)) {
                  return
                }

                historyErrorNotifiedRef.current.add(normalized)
                appendRoomSystemMessage(
                  normalized,
                  createRecentMessagesStatusMessage(
                    normalized,
                    RECENT_MESSAGES_ERROR_TEXT
                  )
                )
              }
            }
          } finally {
            historyLoadingRef.current.delete(normalized)
            recentMessagesQueuedRef.current.delete(normalized)
            recentMessagesActiveRef.current -= 1
            runNext()
          }
        })()
      }
    }

    runNext()
  }, [
    appendRoomSystemMessage,
    hydrateRoomMessage,
    ensureRoomEmotes,
    prependHistoricalTimeline,
    shouldApplyRecentMessagesFetch,
    updateRoom,
  ])

  const loadRecentMessages = React.useCallback(
    (login: string) => {
      const normalized = normalizeChannelLogin(login)
      if (!recentMessagesEnabledRef.current) {
        return
      }

      if (
        historyLoadedRef.current.has(normalized) ||
        historyLoadingRef.current.has(normalized) ||
        recentMessagesQueuedRef.current.has(normalized)
      ) {
        return
      }

      recentMessagesQueuedRef.current.add(normalized)
      recentMessagesQueueRef.current.push(normalized)
      drainRecentMessagesQueue()
    },
    [drainRecentMessagesQueue]
  )

  const getClient = React.useCallback(() => {
    if (clientRef.current) return clientRef.current

    const client = new TwitchChatClient((event) => {
      switch (event.type) {
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
          pendingConnectRef.current?.resolve()
          pendingConnectRef.current = null
          break
        case "disconnected":
          senderStateRef.current = {
            color: null,
            badges: [],
            displayName: null,
            isModerator: false,
            isSubscriber: false,
          }
          setConnectionState((prev) => ({
            ...prev,
            connected: false,
            connecting: false,
            lastError: event.reason,
          }))
          setRooms((current) => {
            const next = { ...current }
            for (const login of Object.keys(next)) {
              next[login] = {
                ...next[login],
                joined: false,
                joining: syncedChannelsRef.current.includes(login),
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
          updateRoom(event.channel, (room) => ({
            ...room,
            joined: true,
            joining: false,
          }))
          loadRecentMessages(event.channel)
          break
        case "channel-parted":
          updateRoom(event.channel, (room) => ({
            ...room,
            joined: false,
            joining: false,
          }))
          break
        case "room-state": {
          const login = normalizeChannelLogin(event.state.channel)
          updateRoom(login, (room) => ({
            ...room,
            roomId: event.state.roomId,
            joined: true,
            joining: false,
          }))
          if (
            event.state.roomId &&
            !roomEmotesSettledRef.current.has(event.state.roomId)
          ) {
            ensureRoomEmotes(login, event.state.roomId)
          }
          loadRecentMessages(login)
          break
        }
        case "self-state":
          senderStateRef.current = {
            color: event.state.color,
            badges: event.state.badges,
            displayName: event.state.displayName || null,
            isModerator: event.state.isModerator,
            isSubscriber: event.state.isSubscriber,
          }
          break
        case "message":
          routeMessageToRoom(event.message)
          break
        case "system":
          routeSystemMessage(event.message)
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
    })

    clientRef.current = client
    return client
  }, [
    appendLog,
    loadRecentMessages,
    ensureRoomEmotes,
    routeMessageToRoom,
    routeSystemMessage,
    updateRoom,
  ])

  React.useEffect(() => {
    return () => {
      clientRef.current?.close()
    }
  }, [])

  const ensureRooms = React.useCallback((channelLogins: string[]) => {
    setRooms((current) => {
      const next = { ...current }
      for (const login of channelLogins) {
        if (!next[login]) {
          next[login] = createEmptyRoom(login)
        } else {
          next[login] = { ...next[login], joining: !next[login].joined }
        }
      }
      return next
    })
  }, [])

  const syncChannels = React.useCallback(
    (
      channelLogins: string[],
      options: TwitchChatConnectOptions = {}
    ): Promise<void> => {
      const normalized = [
        ...new Set(channelLogins.map(normalizeChannelLogin).filter(Boolean)),
      ]

      const previous = syncedChannelsRef.current
      const unchanged =
        previous.length === normalized.length &&
        previous.every((login, index) => login === normalized[index])

      syncedChannelsRef.current = normalized

      if (unchanged && normalized.length > 0 && clientRef.current?.isConnected) {
        return Promise.resolve()
      }

      if (normalized.length === 0) {
        clientRef.current?.close()
        hasAnnouncedConnectedRef.current = false
        emoteCatalogGenerationRef.current += 1
        clearThirdPartyEmoteCache()
        clearTwitchEmoteSessionCache()
        clearBroadcasterProfileCache()
        pendingRoomMessagesRef.current.clear()
        historyLoadedRef.current.clear()
        historyLoadingRef.current.clear()
        historyErrorNotifiedRef.current.clear()
        clearRecentMessagesQueue()
        emoteCatalogsRef.current.clear()
        composerCatalogsRef.current.clear()
        setComposerCatalogs({})
        composerCatalogLoadedRef.current.clear()
        roomEmotesLoadingRef.current.clear()
        roomEmotesSettledRef.current.clear()
        roomEmotesFailedAtRef.current.clear()
        composerCatalogLoadingRef.current.clear()
        clearRoomEmoteBundleCache()
        setConnectionState({
          connected: false,
          connecting: false,
          lastError: null,
        })
        setRooms({})
        return Promise.resolve()
      }

      ensureRooms(normalized)

      const activeHistory = historyLoadedRef.current
      for (const loadedLogin of activeHistory) {
        if (!normalized.includes(loadedLogin)) {
          activeHistory.delete(loadedLogin)
          historyErrorNotifiedRef.current.delete(loadedLogin)
        }
      }

      for (const login of normalized) {
        loadRecentMessages(login)
      }

      if (pendingConnectRef.current) {
        pendingConnectRef.current.reject(new Error("Channel list updated"))
        pendingConnectRef.current = null
      }

      setConnectionState((prev) => ({
        ...prev,
        connecting: !prev.connected,
        lastError: null,
      }))

      return new Promise<void>((resolve, reject) => {
        pendingConnectRef.current = { resolve, reject }
        getClient().setChannels(normalized, options)
      })
    },
    [clearRecentMessagesQueue, ensureRooms, getClient, loadRecentMessages]
  )

  const setLiveMessageLimit = React.useCallback(
    (limit: number) => {
      const previous = liveMessageLimitRef.current
      liveMessageLimitRef.current = limit
      if (limit >= previous) {
        return
      }

      setRooms((current) => {
        let changed = false
        const next: Record<string, TwitchChatRoomState> = { ...current }

        for (const [login, room] of Object.entries(current)) {
          const trimmed = trimTimeline(room.timeline)
          if (trimmed.length === room.timeline.length) {
            continue
          }

          changed = true
          next[login] = {
            ...room,
            timeline: trimmed,
          }
        }

        return changed ? next : current
      })
    },
    [trimTimeline]
  )

  const setRecentMessagesEnabled = React.useCallback(
    (enabled: boolean) => {
      const wasEnabled = recentMessagesEnabledRef.current
      recentMessagesEnabledRef.current = enabled

      if (!enabled) {
        historyLoadedRef.current.clear()
        historyLoadingRef.current.clear()
        historyErrorNotifiedRef.current.clear()
        clearRecentMessagesQueue()
        if (wasEnabled) {
          clearHistoricalTimeline()
        }
        return
      }

      if (!wasEnabled) {
        historyLoadedRef.current.clear()
        historyErrorNotifiedRef.current.clear()
        for (const login of syncedChannelsRef.current) {
          loadRecentMessages(login)
        }
      }
    },
    [clearHistoricalTimeline, clearRecentMessagesQueue, loadRecentMessages]
  )

  const getRoom = React.useCallback(
    (login: string): TwitchChatRoomState | null => {
      const normalized = normalizeChannelLogin(login)
      return rooms[normalized] ?? null
    },
    [rooms]
  )

  const getTimeline = React.useCallback(
    (login: string): TwitchTimelineItem[] => {
      return getRoom(login)?.timeline ?? []
    },
    [getRoom]
  )

  const getRoomId = React.useCallback(
    (login: string): string | null => {
      return getRoom(login)?.roomId ?? null
    },
    [getRoom]
  )

  const setEmoteLoadContext = React.useCallback(
    (context: TwitchChatEmoteLoadContext) => {
      const prev = emoteLoadContextRef.current
      const authChanged =
        prev.accessToken !== context.accessToken ||
        prev.clientId !== context.clientId ||
        prev.userId !== context.userId

      emoteLoadContextRef.current = context

      if (!authChanged) {
        return
      }

      clearTwitchEmoteSessionCache()
      clearBroadcasterProfileCache()
      clearRoomEmoteBundleCache()
      emoteCatalogGenerationRef.current += 1
      roomEmotesSettledRef.current.clear()
      roomEmotesFailedAtRef.current.clear()
      setComposerCatalogs({})
      composerCatalogsRef.current.clear()
      composerCatalogLoadedRef.current.clear()
      composerCatalogLoadingRef.current.clear()
      roomEmotesLoadingRef.current.clear()
      setComposerCatalogLoading({})

      for (const room of Object.values(roomsRef.current)) {
        if (room.roomId) {
          ensureRoomEmotes(room.login, room.roomId)
        }
      }
    },
    [ensureRoomEmotes]
  )

  const getComposerEmoteCatalog = React.useCallback(
    (login: string): ComposerEmoteCatalog => {
      const roomId = getRoomId(login)
      if (!roomId) {
        return createEmptyComposerCatalog()
      }

      return composerCatalogs[roomId] ?? createEmptyComposerCatalog()
    },
    [composerCatalogs, getRoomId]
  )

  const ensureComposerEmotes = React.useCallback(
    (login: string, roomId: string | null) => {
      ensureRoomEmotes(login, roomId)
    },
    [ensureRoomEmotes]
  )

  const isComposerEmotesLoading = React.useCallback(
    (login: string): boolean => {
      const roomId = getRoomId(login)
      if (!roomId) return false
      return Boolean(composerCatalogLoading[roomId])
    },
    [composerCatalogLoading, getRoomId]
  )

  const refreshEmotes = React.useCallback(async (login: string): Promise<boolean> => {
    const normalized = normalizeChannelLogin(login)
    const roomId = roomsRef.current[normalized]?.roomId ?? null
    if (!roomId) return false

    clearThirdPartyEmoteCache(roomId)
    clearChannelTwitchEmoteCache(roomId)
    clearRoomEmoteBundleCache(roomId)

    emoteCatalogsRef.current.delete(roomId)
    roomEmotesLoadingRef.current.delete(roomId)
    roomEmotesSettledRef.current.delete(roomId)
    roomEmotesFailedAtRef.current.delete(roomId)

    composerCatalogsRef.current.delete(roomId)
    composerCatalogLoadedRef.current.delete(roomId)
    composerCatalogLoadingRef.current.delete(roomId)
    setComposerCatalogLoading((current) => ({ ...current, [roomId]: true }))
    setComposerCatalogs((current) => {
      if (!current[roomId]) return current
      const next = { ...current }
      delete next[roomId]
      return next
    })

    const generation = emoteCatalogGenerationRef.current
    const context = emoteLoadContextRef.current

    roomEmotesLoadingRef.current.set(roomId, true)
    composerCatalogLoadingRef.current.set(roomId, true)

    try {
      const bundle = await fetchRoomEmoteBundle({
        roomId,
        channelLogin: normalized,
        accessToken: context.accessToken,
        clientId: context.clientId,
        userId: context.userId,
        channelHints: context.channelHints,
      })

      if (generation !== emoteCatalogGenerationRef.current) {
        return true
      }

      roomEmotesFailedAtRef.current.delete(roomId)
      emoteCatalogsRef.current.set(roomId, bundle.thirdParty)
      composerCatalogLoadedRef.current.add(roomId)
      composerCatalogsRef.current.set(roomId, bundle.composer)
      roomEmotesSettledRef.current.add(roomId)
      setComposerCatalogs((current) => ({ ...current, [roomId]: bundle.composer }))
      rehydrateRoomTimeline(normalized, roomId)
      flushPendingRoomMessages(normalized, roomId, true)
    } catch {
      if (generation === emoteCatalogGenerationRef.current) {
        const emptyThirdParty = createEmptyEmoteCatalog()
        const emptyComposer = createEmptyComposerCatalog()
        emoteCatalogsRef.current.set(roomId, emptyThirdParty)
        composerCatalogsRef.current.set(roomId, emptyComposer)
        composerCatalogLoadedRef.current.add(roomId)
        roomEmotesSettledRef.current.add(roomId)
        setComposerCatalogs((current) => ({
          ...current,
          [roomId]: emptyComposer,
        }))
        flushPendingRoomMessages(normalized, roomId, false)
      }
    } finally {
      roomEmotesLoadingRef.current.delete(roomId)
      composerCatalogLoadingRef.current.delete(roomId)

      if (generation === emoteCatalogGenerationRef.current) {
        setComposerCatalogLoading((current) => {
          if (!current[roomId]) return current
          const next = { ...current }
          delete next[roomId]
          return next
        })
      }
    }

    return true
  }, [flushPendingRoomMessages, rehydrateRoomTimeline])

  const sendMessage = React.useCallback(
    (
      login: string,
      message: string,
      reply: import("@/lib/twitch-chat").TwitchChatReply | null = null
    ): boolean => {
      const normalized = normalizeChannelLogin(login)
      const text = message.replace(/\r?\n/g, " ").trim()
      if (!text) return false

      const sent = getClient().sendMessage(normalized, text, {
        replyParentMessageId: reply?.parentMessageId ?? null,
      })
      if (!sent) return false

      const { userLogin, userDisplayName } = emoteLoadContextRef.current
      if (userLogin) {
        const sender = senderStateRef.current
        const room = roomsRef.current[normalized]

        routeMessageToRoom(
          createLocalChatMessage({
            channel: normalized,
            roomId: room?.roomId ?? null,
            text,
            userName: userLogin.toLowerCase(),
            displayName:
              sender.displayName ?? userDisplayName ?? userLogin,
            color: sender.color,
            badges: sender.badges,
            isModerator: sender.isModerator,
            isSubscriber: sender.isSubscriber,
            reply,
          })
        )
      }

      return true
    },
    [getClient, routeMessageToRoom]
  )

  return {
    connectionState,
    rooms,
    logs,
    syncChannels,
    getRoom,
    getTimeline,
    getRoomId,
    setEmoteLoadContext,
    setRecentMessagesEnabled,
    setLiveMessageLimit,
    getComposerEmoteCatalog,
    ensureComposerEmotes,
    isComposerEmotesLoading,
    refreshEmotes,
    sendMessage,
  }
}
