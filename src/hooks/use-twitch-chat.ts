import * as React from "react"

import {
  createEmptyComposerCatalog,
  fetchComposerEmoteCatalog,
  getTwitchEmoteHydration,
  type ChannelProfileHint,
  type ComposerEmoteCatalog,
} from "@/lib/chat-emote-catalog"
import {
  buildThirdPartyEmoteCatalog,
  clearThirdPartyEmoteCache,
  createEmptyEmoteCatalog,
  getThirdPartyEmoteSets,
  hydrateMessageEmotes,
  type ThirdPartyEmoteCatalog,
  type TwitchEmoteHydration,
} from "@/lib/chat-emotes"
import {
  createLocalChatMessage,
  TwitchChatClient,
  type TwitchBadge,
  type TwitchChatConnectOptions,
  type TwitchChatMessage,
  type TwitchConnectionState,
  type TwitchSystemMessage,
} from "@/lib/twitch-chat"

const MESSAGE_LIMIT = 60

export type TwitchTimelineItem =
  | { kind: "chat"; message: TwitchChatMessage }
  | { kind: "system"; message: TwitchSystemMessage }

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

function normalizeChannelLogin(channel: string) {
  return channel.trim().replace(/^#/, "").toLowerCase()
}

export function useTwitchChat() {
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
  const emoteCatalogLoadingRef = React.useRef(new Map<string, boolean>())
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

  const appendRoomTimeline = React.useCallback(
    (login: string, items: TwitchTimelineItem[]) => {
      if (items.length === 0) return

      updateRoom(login, (room) => ({
        ...room,
        timeline: [...room.timeline, ...items].slice(-MESSAGE_LIMIT),
      }))
    },
    [updateRoom]
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

      appendRoomTimeline(
        login,
        pending.map((message) => ({
          kind: "chat" as const,
          message: hydrateRoomMessage(message, catalog),
        }))
      )
    },
    [appendRoomTimeline, hydrateRoomMessage]
  )

  const queuePendingRoomMessage = React.useCallback(
    (login: string, message: TwitchChatMessage) => {
      const roomId = message.roomId
      if (!roomId) {
        appendRoomTimeline(login, [
          {
            kind: "chat",
            message: hydrateRoomMessage(message, null),
          },
        ])
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
    [appendRoomTimeline, hydrateRoomMessage]
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

  const maybeLoadThirdPartyEmotes = React.useCallback(
    (login: string, roomId: string | null) => {
      if (!roomId || emoteCatalogsRef.current.has(roomId)) {
        return
      }

      if (emoteCatalogLoadingRef.current.get(roomId)) {
        return
      }

      emoteCatalogLoadingRef.current.set(roomId, true)
      const generation = emoteCatalogGenerationRef.current

      void getThirdPartyEmoteSets(roomId)
        .then((sets) => {
          const catalog = buildThirdPartyEmoteCatalog(sets)
          if (generation !== emoteCatalogGenerationRef.current) {
            return
          }

          emoteCatalogsRef.current.set(roomId, catalog)
          emoteCatalogLoadingRef.current.delete(roomId)

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
                    message: hydrateRoomMessage(entry.message, catalog),
                  }
                }),
              },
            }
          })

          flushPendingRoomMessages(login, roomId, true)
          appendLog(`Loaded ${catalog.size} third-party emotes for #${login}`)
        })
        .catch(() => {
          if (generation !== emoteCatalogGenerationRef.current) {
            return
          }

          emoteCatalogsRef.current.set(roomId, createEmptyEmoteCatalog())
          emoteCatalogLoadingRef.current.delete(roomId)
          flushPendingRoomMessages(login, roomId, false)
          appendLog(`Third-party emotes could not be loaded for #${login}.`)
        })
    },
    [appendLog, flushPendingRoomMessages, hydrateRoomMessage]
  )

  const maybeLoadComposerEmotes = React.useCallback(
    (login: string, roomId: string | null) => {
      if (!roomId || composerCatalogLoadedRef.current.has(roomId)) {
        return
      }

      if (composerCatalogLoadingRef.current.get(roomId)) {
        return
      }

      composerCatalogLoadingRef.current.set(roomId, true)
      const generation = emoteCatalogGenerationRef.current
      const context = emoteLoadContextRef.current

      void fetchComposerEmoteCatalog({
        roomId,
        channelLogin: login,
        accessToken: context.accessToken,
        clientId: context.clientId,
        userId: context.userId,
        channelHints: context.channelHints,
      })
        .then((catalog) => {
          if (generation !== emoteCatalogGenerationRef.current) {
            return
          }

          composerCatalogLoadedRef.current.add(roomId)
          composerCatalogsRef.current.set(roomId, catalog)
          setComposerCatalogs((current) => ({ ...current, [roomId]: catalog }))
          composerCatalogLoadingRef.current.delete(roomId)
          rehydrateRoomTimeline(login, roomId)
          appendLog(
            `Loaded ${catalog.byCode.size} emotes for composer in #${login}`
          )
        })
        .catch(() => {
          if (generation !== emoteCatalogGenerationRef.current) {
            return
          }

          composerCatalogLoadingRef.current.delete(roomId)
          appendLog(`Composer emotes could not be loaded for #${login}.`)
        })
    },
    [appendLog, rehydrateRoomTimeline]
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
        maybeLoadThirdPartyEmotes(login, roomId)
        maybeLoadComposerEmotes(login, roomId)
      }

      if (roomId && !emoteCatalogsRef.current.has(roomId)) {
        queuePendingRoomMessage(login, message)
        return
      }

      const catalog = roomId
        ? (emoteCatalogsRef.current.get(roomId) ?? null)
        : null

      appendRoomTimeline(login, [
        { kind: "chat", message: hydrateRoomMessage(message, catalog) },
      ])
    },
    [
      appendRoomTimeline,
      hydrateRoomMessage,
      maybeLoadComposerEmotes,
      maybeLoadThirdPartyEmotes,
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
        appendRoomSystemMessage(login, message)
        return
      }

      setRooms((current) => {
        const next = { ...current }
        for (const channelLogin of Object.keys(next)) {
          next[channelLogin] = {
            ...next[channelLogin],
            timeline: [
              ...next[channelLogin].timeline,
              { kind: "system" as const, message },
            ].slice(-MESSAGE_LIMIT),
          }
        }
        return next
      })
    },
    [appendRoomSystemMessage, updateRoom]
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
          maybeLoadThirdPartyEmotes(login, event.state.roomId)
          maybeLoadComposerEmotes(login, event.state.roomId)
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
    maybeLoadComposerEmotes,
    maybeLoadThirdPartyEmotes,
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
      syncedChannelsRef.current = normalized

      if (normalized.length === 0) {
        clientRef.current?.close()
        hasAnnouncedConnectedRef.current = false
        emoteCatalogGenerationRef.current += 1
        clearThirdPartyEmoteCache()
        pendingRoomMessagesRef.current.clear()
        emoteCatalogsRef.current.clear()
        composerCatalogsRef.current.clear()
        setComposerCatalogs({})
        composerCatalogLoadedRef.current.clear()
        emoteCatalogLoadingRef.current.clear()
        composerCatalogLoadingRef.current.clear()
        setConnectionState({
          connected: false,
          connecting: false,
          lastError: null,
        })
        setRooms({})
        return Promise.resolve()
      }

      ensureRooms(normalized)

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
    [ensureRooms, getClient]
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
      const changed =
        prev.accessToken !== context.accessToken ||
        prev.clientId !== context.clientId ||
        prev.userId !== context.userId ||
        prev.channelHints !== context.channelHints

      emoteLoadContextRef.current = context

      if (!changed) {
        return
      }

      emoteCatalogGenerationRef.current += 1
      setComposerCatalogs({})
      composerCatalogsRef.current.clear()
      composerCatalogLoadedRef.current.clear()
      composerCatalogLoadingRef.current.clear()

      for (const room of Object.values(rooms)) {
        if (room.roomId) {
          maybeLoadComposerEmotes(room.login, room.roomId)
        }
      }
    },
    [maybeLoadComposerEmotes, rooms]
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
      maybeLoadComposerEmotes(login, roomId)
    },
    [maybeLoadComposerEmotes]
  )

  const sendMessage = React.useCallback(
    (login: string, message: string): boolean => {
      const normalized = normalizeChannelLogin(login)
      const text = message.replace(/\r?\n/g, " ").trim()
      if (!text) return false

      const sent = getClient().sendMessage(normalized, text)
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
    getComposerEmoteCatalog,
    ensureComposerEmotes,
    sendMessage,
  }
}
