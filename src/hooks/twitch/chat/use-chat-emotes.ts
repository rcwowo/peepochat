import * as React from "react"

import { EMOTE_LOAD_RETRY_MS } from "@/hooks/twitch/chat/types"
import type { RoomStore } from "@/hooks/twitch/chat/use-room-store"
import { useLazyRef } from "@/hooks/use-lazy-ref"
import { devFetchLogger } from "@/lib/dev-logger"
import {
  clearBroadcasterProfileCache,
  clearChannelTwitchEmoteCache,
  clearRoomEmoteBundleCache,
  clearTwitchEmoteSessionCache,
  createEmptyComposerCatalog,
  fetchRoomEmoteBundle,
  getTwitchEmoteHydration,
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
import type { TwitchChatMessage } from "@/lib/twitch/twitch-chat"
import type { TwitchChatEmoteLoadContext } from "@/lib/twitch/twitch-chat-types"

type UseChatEmotesOptions = {
  roomStore: RoomStore
  appendLog: (text: string) => void
}

export function useChatEmotes({ roomStore, appendLog }: UseChatEmotesOptions) {
  const { commitRooms, roomsRef, getRoomId } = roomStore

  const emoteCatalogsRef = useLazyRef(
    () => new Map<string, ThirdPartyEmoteCatalog>()
  )
  const composerCatalogsRef = useLazyRef(
    () => new Map<string, ComposerEmoteCatalog>()
  )
  const [composerCatalogs, setComposerCatalogs] = React.useState<
    Record<string, ComposerEmoteCatalog>
  >({})
  const [composerCatalogLoading, setComposerCatalogLoading] = React.useState<
    Record<string, boolean>
  >({})
  const roomEmotesLoadingRef = useLazyRef(() => new Map<string, boolean>())
  const roomEmotesSettledRef = useLazyRef(() => new Set<string>())
  const roomEmotesFailedAtRef = useLazyRef(() => new Map<string, number>())
  const composerCatalogLoadingRef = useLazyRef(() => new Map<string, boolean>())
  const composerCatalogLoadedRef = useLazyRef(() => new Set<string>())
  const emoteLoadContextRef = React.useRef<TwitchChatEmoteLoadContext>({})
  const emoteCatalogGenerationRef = React.useRef(0)

  const getTwitchHydration = React.useCallback(
    (roomId: string | null): TwitchEmoteHydration | null => {
      if (!roomId) {
        return null
      }

      const catalog = composerCatalogsRef.current.get(roomId)
      return catalog ? getTwitchEmoteHydration(catalog) : null
    },
    [composerCatalogsRef]
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

      commitRooms((current) => {
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
    [commitRooms, emoteCatalogsRef, getTwitchHydration]
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
      composerCatalogLoadedRef,
      composerCatalogLoadingRef,
      composerCatalogsRef,
      emoteCatalogGenerationRef,
      emoteLoadContextRef,
      emoteCatalogsRef,
      rehydrateRoomTimeline,
      roomEmotesFailedAtRef,
      roomEmotesLoadingRef,
      roomEmotesSettledRef,
    ]
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
    [
      composerCatalogLoadedRef,
      composerCatalogLoadingRef,
      composerCatalogsRef,
      emoteCatalogGenerationRef,
      emoteLoadContextRef,
      ensureRoomEmotes,
      roomEmotesFailedAtRef,
      roomEmotesLoadingRef,
      roomEmotesSettledRef,
      roomsRef,
    ]
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
  }, [rehydrateRoomTimeline, roomsRef])

  const refreshEmotes = React.useCallback(
    async (login: string): Promise<boolean> => {
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
        setComposerCatalogs((current) => ({
          ...current,
          [roomId]: bundle.composer,
        }))
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
    },
    [
      composerCatalogLoadedRef,
      composerCatalogLoadingRef,
      composerCatalogsRef,
      emoteCatalogGenerationRef,
      emoteLoadContextRef,
      emoteCatalogsRef,
      rehydrateRoomTimeline,
      roomEmotesFailedAtRef,
      roomEmotesLoadingRef,
      roomEmotesSettledRef,
      roomsRef,
    ]
  )

  const clearEmotesForRoomIds = React.useCallback(
    (roomIds: string[]) => {
      for (const roomId of roomIds) {
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
    },
    [
      composerCatalogLoadedRef,
      composerCatalogLoadingRef,
      composerCatalogsRef,
      emoteCatalogsRef,
      roomEmotesFailedAtRef,
      roomEmotesLoadingRef,
      roomEmotesSettledRef,
    ]
  )

  const clearAllEmoteState = React.useCallback(() => {
    emoteCatalogGenerationRef.current += 1
    clearThirdPartyEmoteCache()
    clearTwitchEmoteSessionCache()
    clearBroadcasterProfileCache()
    clearTwitchEmoteIvrCache()
    clearRoomEmoteBundleCache()
    emoteCatalogsRef.current.clear()
    composerCatalogsRef.current.clear()
    setComposerCatalogs({})
    composerCatalogLoadedRef.current.clear()
    roomEmotesLoadingRef.current.clear()
    roomEmotesSettledRef.current.clear()
    roomEmotesFailedAtRef.current.clear()
    composerCatalogLoadingRef.current.clear()
    setComposerCatalogLoading({})
  }, [
    composerCatalogLoadedRef,
    composerCatalogLoadingRef,
    composerCatalogsRef,
    emoteCatalogGenerationRef,
    emoteCatalogsRef,
    roomEmotesFailedAtRef,
    roomEmotesLoadingRef,
    roomEmotesSettledRef,
  ])

  const getCatalogForRoom = React.useCallback(
    (roomId: string | null) => {
      return roomId ? (emoteCatalogsRef.current.get(roomId) ?? null) : null
    },
    [emoteCatalogsRef]
  )

  const isRoomEmotesSettled = React.useCallback(
    (roomId: string) => roomEmotesSettledRef.current.has(roomId),
    [roomEmotesSettledRef]
  )

  return {
    emoteCatalogsRef,
    emoteLoadContextRef,
    emoteCatalogGenerationRef,
    roomEmotesSettledRef,
    getTwitchHydration,
    hydrateRoomMessage,
    ensureRoomEmotes,
    setEmoteLoadContext,
    getComposerEmoteCatalog,
    ensureComposerEmotes,
    isComposerEmotesLoading,
    rehydrateAllRoomTimelines,
    refreshEmotes,
    clearEmotesForRoomIds,
    clearAllEmoteState,
    getCatalogForRoom,
    isRoomEmotesSettled,
  }
}

export type ChatEmotesApi = ReturnType<typeof useChatEmotes>
