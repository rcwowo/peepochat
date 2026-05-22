import * as React from "react"

import {
  createEmptyEmoteCatalog,
  fetchThirdPartyEmoteCatalog,
  hydrateMessageEmotes,
  type ThirdPartyEmoteCatalog,
} from "@/lib/chat-emotes"
import {
  TwitchChatClient,
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
  const emoteCatalogLoadingRef = React.useRef(new Map<string, boolean>())
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
          message: hydrateMessageEmotes(message, catalog),
        }))
      )
    },
    [appendRoomTimeline]
  )

  const queuePendingRoomMessage = React.useCallback(
    (login: string, message: TwitchChatMessage) => {
      const roomId = message.roomId
      if (!roomId) {
        appendRoomTimeline(login, [
          {
            kind: "chat",
            message: hydrateMessageEmotes(message, null),
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
    [appendRoomTimeline]
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

      void fetchThirdPartyEmoteCatalog(roomId)
        .then((catalog) => {
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
                    message: hydrateMessageEmotes(entry.message, catalog),
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
    [appendLog, flushPendingRoomMessages]
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
      }

      if (roomId && !emoteCatalogsRef.current.has(roomId)) {
        queuePendingRoomMessage(login, message)
        return
      }

      const catalog = roomId
        ? (emoteCatalogsRef.current.get(roomId) ?? null)
        : null

      appendRoomTimeline(login, [
        { kind: "chat", message: hydrateMessageEmotes(message, catalog) },
      ])
    },
    [
      appendRoomTimeline,
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
          break
        }
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
        pendingRoomMessagesRef.current.clear()
        emoteCatalogsRef.current.clear()
        emoteCatalogLoadingRef.current.clear()
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

  return {
    connectionState,
    rooms,
    logs,
    syncChannels,
    getRoom,
    getTimeline,
    getRoomId,
  }
}
