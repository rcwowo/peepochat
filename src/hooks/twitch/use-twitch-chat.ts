import * as React from "react"

import { devChatLogger, devFetchLogger } from "@/lib/dev-logger"
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
} from "@/lib/chat/chat-emote-catalog"
import {
  clearThirdPartyEmoteCache,
  createEmptyEmoteCatalog,
  hydrateMessageEmotes,
  type ThirdPartyEmoteCatalog,
  type TwitchEmoteHydration,
} from "@/lib/chat/chat-emotes"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import { clearTwitchEmoteIvrCache } from "@/lib/twitch/twitch-emote-ivr"
import {
  createRecentMessagesStatusMessage,
  fetchRecentMessages,
  RECENT_MESSAGES_CONCURRENCY,
  RECENT_MESSAGES_ERROR_TEXT,
  RECENT_MESSAGES_UNAVAILABLE_TEXT,
} from "@/lib/chat/recent-messages"
import {
  executeChatCommand,
  type ChatCommandResult,
} from "@/lib/chat/chat-commands"
import {
  LIVE_MESSAGES_PER_CHANNEL_DEFAULT,
  type TwitchAccount,
} from "@/lib/peepochat/peepochat-config"
import {
  createLocalChatMessage,
  TwitchChatClient,
  type TwitchBadge,
  type TwitchChatConnectOptions,
  type TwitchChatMessage,
  type TwitchConnectionState,
  type TwitchSystemMessage,
} from "@/lib/twitch/twitch-chat"
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

export type TwitchSelfChatState = {
  channel: string
  roomId: string | null
  displayName: string
  color: string | null
  badges: TwitchBadge[]
  isBroadcaster: boolean
  isModerator: boolean
  isSubscriber: boolean
  isVip: boolean
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

export const SYNC_CHANNELS_SUPERSEDED_MESSAGE = "Channel list updated"

export function isSyncChannelsSupersededError(error: unknown): boolean {
  return (
    error instanceof Error && error.message === SYNC_CHANNELS_SUPERSEDED_MESSAGE
  )
}

function buildSyncChannelsKey(
  channelLogins: string[],
  options: TwitchChatConnectOptions
): string {
  return [
    channelLogins.join("\0"),
    options.accessToken ?? "",
    options.nick ?? "",
  ].join("\u0001")
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
}) {
  const onChatMessageRef = options?.onChatMessageRef
  const clientRef = React.useRef<TwitchChatClient | null>(null)
  const pendingConnectRef = React.useRef<PendingConnect | null>(null)
  const pendingSyncPromiseRef = React.useRef<{
    key: string
    promise: Promise<void>
  } | null>(null)
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
    isBroadcaster: boolean
    isModerator: boolean
    isSubscriber: boolean
    isVip: boolean
  }>({
    color: null,
    badges: [],
    displayName: null,
    isBroadcaster: false,
    isModerator: false,
    isSubscriber: false,
    isVip: false,
  })
  const selfStatesRef = React.useRef(new Map<string, TwitchSelfChatState>())
  const [selfStates, setSelfStates] = React.useState<Record<string, TwitchSelfChatState>>({})
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
        const nextHistorical = [...historical]
        const nextLive = [...live]

        for (const item of items) {
          if (item.isHistorical) {
            continue
          }

          const historicalIndex = nextHistorical.findIndex(
            (entry) => entry.message.id === item.message.id
          )
          if (historicalIndex !== -1) {
            devChatLogger.debugLazy(() => [
              "timeline:promote-historical",
              {
                login,
                id: item.message.id,
                kind: item.kind,
              },
            ])
            nextHistorical.splice(historicalIndex, 1)
            nextLive.push(item)
            continue
          }

          if (knownIds.has(item.message.id)) {
            devChatLogger.debugLazy(() => [
              "timeline:skip-dedup",
              {
                login,
                id: item.message.id,
                kind: item.kind,
              },
            ])
            continue
          }

          knownIds.add(item.message.id)
          nextLive.push(item)
        }

        devChatLogger.debugLazy(() => [
          "timeline:append-live",
          {
            login,
            added: nextLive.length - live.length,
            total: nextHistorical.length + nextLive.length,
          },
        ])

        return {
          ...room,
          timeline: trimTimeline([...nextHistorical, ...nextLive]),
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
            devChatLogger.debugLazy(() => [
              "timeline:skip-historical-dedup",
              {
                login,
                id: item.message.id,
                kind: item.kind,
              },
            ])
            continue
          }

          knownIds.add(item.message.id)
          nextHistorical.push({ ...item, isHistorical: true })
        }

        devChatLogger.debugLazy(() => [
          "timeline:prepend-historical",
          {
            login,
            added: nextHistorical.length - historical.length,
            total: nextHistorical.length + live.length,
          },
        ])

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

  const rehydrateRoomTimeline = React.useCallback(
    (login: string, roomId: string) => {
      const thirdPartyCatalog = emoteCatalogsRef.current.get(roomId) ?? null
      const twitchHydration = getTwitchHydration(roomId)
      const normalizedLogin = normalizeChannelLogin(login)

      if (!thirdPartyCatalog && !twitchHydration) {
        return
      }

      setRooms((current) => {
        const room = current[login]
        if (!room) return current

        let changed = false
        const timeline = room.timeline.map((entry) => {
          if (entry.kind !== "chat") return entry

          const messageChannel = normalizeChannelLogin(entry.message.channel)
          if (messageChannel !== normalizedLogin) {
            return entry
          }

          const messageRoomId = entry.message.roomId
          if (messageRoomId !== null && messageRoomId !== roomId) {
            return entry
          }

          const message =
            messageRoomId === null
              ? { ...entry.message, roomId }
              : entry.message

          const hydrated = hydrateMessageEmotes(
            message,
            thirdPartyCatalog,
            twitchHydration
          )
          if (message === entry.message && hydrated === entry.message) {
            return entry
          }

          changed = true
          return { ...entry, message: hydrated }
        })

        if (!changed) {
          return current
        }

        return {
          ...current,
          [login]: { ...room, timeline },
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

      devFetchLogger.debugLazy(() => ["emotes:start", { login, roomId }])

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
          devFetchLogger.debugLazy(() => [
            "emotes:success",
            {
              login,
              roomId,
              emoteCount: bundle.composer.byCode.size,
            },
          ])
          appendLog(
            `Loaded ${bundle.composer.byCode.size} emotes for #${login}`
          )
        })
        .catch(() => {
          if (generation !== emoteCatalogGenerationRef.current) {
            return
          }

          roomEmotesFailedAtRef.current.set(roomId, Date.now())
          devFetchLogger.warn("emotes:error", { login, roomId })
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
      rehydrateRoomTimeline,
    ]
  )

  const routeMessageToRoom = React.useCallback(
    (message: TwitchChatMessage) => {
      const login = normalizeChannelLogin(message.channel)
      if (!syncedChannelsRef.current.includes(login)) {
        return
      }

      const roomId = message.roomId

      if (roomId) {
        updateRoom(login, (room) => ({
          ...room,
          roomId: room.roomId ?? roomId,
        }))
        ensureRoomEmotes(login, roomId)
      }

      const catalog = roomId
        ? (emoteCatalogsRef.current.get(roomId) ?? null)
        : null

      const hydrated = hydrateRoomMessage(message, catalog)
      devChatLogger.debugLazy(() => [
        "route:message",
        {
          login,
          id: message.id,
          roomId,
          user: message.displayName,
          text: message.text.slice(0, 120),
        },
      ])
      appendRoomTimeline(login, [{ kind: "chat", message: hydrated }])
      onChatMessageRef?.current?.(hydrated)
    },
    [
      appendRoomTimeline,
      ensureRoomEmotes,
      hydrateRoomMessage,
      onChatMessageRef,
      updateRoom,
    ]
  )

  const routeSystemMessage = React.useCallback(
    (message: TwitchSystemMessage) => {
      const login = message.channel
        ? normalizeChannelLogin(message.channel)
        : null

      if (login && !syncedChannelsRef.current.includes(login)) {
        return
      }

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
              userId: null,
              userName: message.actor?.userName ?? "system",
              displayName: message.actor?.displayName ?? "System",
              text: message.details,
              color: message.actor?.color ?? null,
              receivedAt: message.receivedAt,
              badges: [],
              badgeInfo: [],
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
        devChatLogger.debugLazy(() => [
          "route:system",
          {
            login,
            id: message.id,
            event: message.event,
            msgId: message.msgId,
            text: message.text.slice(0, 120),
          },
        ])
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

          devFetchLogger.debugLazy(() => [
            "recent-messages:start",
            { channel: normalized },
          ])

          try {
            const outcome = await fetchRecentMessages(normalized)

            if (!shouldApplyRecentMessagesFetch(normalized, generation)) {
              devFetchLogger.debugLazy(() => [
                "recent-messages:stale",
                { channel: normalized },
              ])
              return
            }

            devFetchLogger.debugLazy(() => [
              "recent-messages:outcome",
              {
                channel: normalized,
                status: outcome.status,
                messageCount:
                  outcome.status === "success" ? outcome.messages.length : 0,
                error:
                  outcome.status === "error" ? outcome.message : undefined,
              },
            ])

            switch (outcome.status) {
              case "success": {
                historyLoadedRef.current.add(normalized)

                if (outcome.messages.length === 0) {
                  return
                }

                const roomId =
                  outcome.messages.find((message) => message.roomId)?.roomId ??
                  roomsRef.current[normalized]?.roomId ??
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
                  outcome.messages.map((message) => {
                    const resolvedMessage =
                      roomId && !message.roomId
                        ? { ...message, roomId }
                        : message

                    return {
                      kind: "chat" as const,
                      message: hydrateRoomMessage(resolvedMessage, catalog),
                      isHistorical: true,
                    }
                  })
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
            isBroadcaster: false,
            isModerator: false,
            isSubscriber: false,
            isVip: false,
          }
          selfStatesRef.current.clear()
          setSelfStates({})
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
          selfStatesRef.current.set(event.state.channel, event.state)
          setSelfStates((current) => ({
            ...current,
            [event.state.channel]: event.state,
          }))
          senderStateRef.current = {
            color: event.state.color,
            badges: event.state.badges,
            displayName: event.state.displayName || null,
            isBroadcaster: event.state.isBroadcaster,
            isModerator: event.state.isModerator,
            isSubscriber: event.state.isSubscriber,
            isVip: event.state.isVip,
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
      // React Strict Mode remounts immediately in dev; closing here interrupts
      // the in-flight Twitch IRC handshake before the remounted hook reuses it.
      if (import.meta.env.DEV) {
        return
      }

      clientRef.current?.close()
      clientRef.current = null
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

  const pruneRemovedChannelState = React.useCallback((removedLogins: string[]) => {
    if (removedLogins.length === 0) {
      return
    }

    const removed = new Set(removedLogins)

    for (const login of removedLogins) {
      historyLoadedRef.current.delete(login)
      historyLoadingRef.current.delete(login)
      historyErrorNotifiedRef.current.delete(login)
      recentMessagesQueuedRef.current.delete(login)
      selfStatesRef.current.delete(login)

      const roomId = roomsRef.current[login]?.roomId
      if (!roomId) {
        continue
      }

      emoteCatalogsRef.current.delete(roomId)
      composerCatalogsRef.current.delete(roomId)
      composerCatalogLoadedRef.current.delete(roomId)
      composerCatalogLoadingRef.current.delete(roomId)
      roomEmotesLoadingRef.current.delete(roomId)
      roomEmotesSettledRef.current.delete(roomId)
      roomEmotesFailedAtRef.current.delete(roomId)
      setComposerCatalogs((current) => {
        if (!current[roomId]) {
          return current
        }
        const next = { ...current }
        delete next[roomId]
        return next
      })
      setComposerCatalogLoading((current) => {
        if (!current[roomId]) {
          return current
        }
        const next = { ...current }
        delete next[roomId]
        return next
      })
    }

    if (recentMessagesQueueRef.current.length > 0) {
      recentMessagesQueueRef.current = recentMessagesQueueRef.current.filter(
        (login) => !removed.has(login)
      )
    }

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

    setRooms((current) => {
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
  }, [])

  const syncChannels = React.useCallback(
    (
      channelLogins: string[],
      options: TwitchChatConnectOptions = {}
    ): Promise<void> => {
      const normalized = [
        ...new Set(channelLogins.map(normalizeChannelLogin).filter(Boolean)),
      ]
      const syncKey = buildSyncChannelsKey(normalized, options)

      const previous = syncedChannelsRef.current
      const unchanged =
        previous.length === normalized.length &&
        previous.every((login, index) => login === normalized[index])

      syncedChannelsRef.current = normalized

      if (unchanged && normalized.length > 0 && clientRef.current?.isConnected) {
        return Promise.resolve()
      }

      const inFlight = pendingSyncPromiseRef.current
      if (inFlight && inFlight.key === syncKey) {
        return inFlight.promise
      }

      if (normalized.length === 0) {
        pendingSyncPromiseRef.current = null
        clientRef.current?.close()
        hasAnnouncedConnectedRef.current = false
        emoteCatalogGenerationRef.current += 1
        clearThirdPartyEmoteCache()
        clearTwitchEmoteSessionCache()
        clearBroadcasterProfileCache()
        clearTwitchEmoteIvrCache()
        selfStatesRef.current.clear()
        setSelfStates({})
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

      const removedLogins = previous.filter((login) => !normalized.includes(login))
      pruneRemovedChannelState(removedLogins)

      ensureRooms(normalized)

      for (const login of normalized) {
        loadRecentMessages(login)
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

      const promise = new Promise<void>((resolve, reject) => {
        pendingConnectRef.current = { resolve, reject }
        getClient().setChannels(normalized, options)
      })

      pendingSyncPromiseRef.current = { key: syncKey, promise }
      void promise.finally(() => {
        if (pendingSyncPromiseRef.current?.promise === promise) {
          pendingSyncPromiseRef.current = null
        }
      })

      return promise
    },
    [
      clearRecentMessagesQueue,
      ensureRooms,
      getClient,
      loadRecentMessages,
      pruneRemovedChannelState,
    ]
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

  const getSelfChatState = React.useCallback(
    (login: string): TwitchSelfChatState | null => {
      const normalized = normalizeChannelLogin(login)
      return selfStates[normalized] ?? null
    },
    [selfStates]
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
      clearTwitchEmoteIvrCache()
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

  const rehydrateAllRoomTimelines = React.useCallback(() => {
    for (const [login, room] of Object.entries(roomsRef.current)) {
      if (room.roomId) {
        rehydrateRoomTimeline(login, room.roomId)
      }
    }
  }, [rehydrateRoomTimeline])

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
  }, [rehydrateRoomTimeline])

  const sendLocalChatMessage = React.useCallback(
    (
      login: string,
      message: string,
      reply: import("@/lib/twitch/twitch-chat").TwitchChatReply | null,
      options: { isAction?: boolean } = {}
    ): boolean => {
      const normalized = normalizeChannelLogin(login)
      const text = message.replace(/\r?\n/g, " ").trim()
      if (!text) return false

      const sent = getClient().sendMessage(normalized, text, {
        replyParentMessageId: reply?.parentMessageId ?? null,
        isAction: options.isAction ?? false,
      })
      if (!sent) return false

      const { userId, userLogin, userDisplayName } = emoteLoadContextRef.current
      if (userLogin) {
        const sender =
          selfStatesRef.current.get(normalized) ?? senderStateRef.current
        const room = roomsRef.current[normalized]

        routeMessageToRoom(
          createLocalChatMessage({
            channel: normalized,
            roomId: room?.roomId ?? null,
            userId: userId ?? null,
            text,
            userName: userLogin.toLowerCase(),
            displayName:
              sender.displayName ?? userDisplayName ?? userLogin,
            color: sender.color,
            badges: sender.badges,
            isModerator: sender.isModerator,
            isSubscriber: sender.isSubscriber,
            isAction: options.isAction ?? false,
            reply,
          })
        )
      }

      return true
    },
    [getClient, routeMessageToRoom]
  )

  const sendMessage = React.useCallback(
    (
      login: string,
      message: string,
      reply: import("@/lib/twitch/twitch-chat").TwitchChatReply | null = null
    ): boolean => sendLocalChatMessage(login, message, reply),
    [sendLocalChatMessage]
  )

  const sendActionMessage = React.useCallback(
    (
      login: string,
      message: string,
      reply: import("@/lib/twitch/twitch-chat").TwitchChatReply | null = null
    ): boolean =>
      sendLocalChatMessage(login, message, reply, { isAction: true }),
    [sendLocalChatMessage]
  )

  const runChatCommand = React.useCallback(
    async (
      login: string,
      input: string,
      account: TwitchAccount | null
    ): Promise<ChatCommandResult> => {
      const normalized = normalizeChannelLogin(login)
      const room = roomsRef.current[normalized]
      const result = await executeChatCommand(input, {
        account,
        channelLogin: normalized,
        broadcasterId: room?.roomId ?? null,
        selfState: selfStatesRef.current.get(normalized) ?? null,
      })

      if (result.handled && result.kind === "feedback") {
        appendRoomSystemMessage(
          normalized,
          {
            ...createRecentMessagesStatusMessage(normalized, result.message),
            level: result.level ?? "info",
          }
        )
      }

      return result
    },
    [appendRoomSystemMessage]
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
    getSelfChatState,
    refreshEmotes,
    rehydrateAllRoomTimelines,
    sendMessage,
    sendActionMessage,
    runChatCommand,
  }
}
