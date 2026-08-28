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
  hydrateSystemMessageDetails,
  type ThirdPartyEmoteCatalog,
  type TwitchEmoteHydration,
} from "@/lib/chat/chat-emotes"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import { clearTwitchEmoteIvrCache } from "@/lib/twitch/twitch-emote-ivr"
import {
  clearCheermoteCache,
  DEFAULT_CHEERMOTE_CATALOG,
  type CheermoteCatalog,
} from "@/lib/twitch/twitch-cheermotes"
import type { TwitchChatMessage } from "@/lib/twitch/twitch-chat"
import type { TwitchChatEmoteLoadContext } from "@/lib/twitch/twitch-chat-types"

type UseChatEmotesOptions = {
  roomStore: RoomStore
  appendLog: (text: string) => void
  onRoomEmotesSettledRef?: React.RefObject<((roomId: string) => void) | null>
  onRoomsClearedRef?: React.RefObject<((roomIds: string[]) => void) | null>
}

export function useChatEmotes({
  roomStore,
  appendLog,
  onRoomEmotesSettledRef,
  onRoomsClearedRef,
}: UseChatEmotesOptions) {
  const { commitRooms, roomsRef, getRoomId } = roomStore

  const emoteCatalogsRef = useLazyRef(
    () => new Map<string, ThirdPartyEmoteCatalog>()
  )
  const composerCatalogsRef = useLazyRef(
    () => new Map<string, ComposerEmoteCatalog>()
  )
  const cheermoteCatalogsRef = useLazyRef(
    () => new Map<string, CheermoteCatalog>()
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
  const roomEmotesRetryTimeoutRef = useLazyRef(() => new Map<string, number>())
  const composerCatalogLoadingRef = useLazyRef(() => new Map<string, boolean>())
  const composerCatalogLoadedRef = useLazyRef(() => new Set<string>())
  const emoteLoadContextRef = React.useRef<TwitchChatEmoteLoadContext>({})
  const emoteCatalogGenerationRef = React.useRef(0)
  const ensureRoomEmotesRef = React.useRef<
    (login: string, roomId: string | null) => void
  >(() => {})

  const clearRoomEmoteRetry = React.useCallback(
    (roomId: string) => {
      const timeoutId = roomEmotesRetryTimeoutRef.current.get(roomId)
      if (timeoutId === undefined) {
        return
      }
      window.clearTimeout(timeoutId)
      roomEmotesRetryTimeoutRef.current.delete(roomId)
    },
    [roomEmotesRetryTimeoutRef]
  )

  const clearAllRoomEmoteRetries = React.useCallback(() => {
    for (const timeoutId of roomEmotesRetryTimeoutRef.current.values()) {
      window.clearTimeout(timeoutId)
    }
    roomEmotesRetryTimeoutRef.current.clear()
  }, [roomEmotesRetryTimeoutRef])

  const scheduleRoomEmoteRetry = React.useCallback(
    (login: string, roomId: string, generation: number) => {
      clearRoomEmoteRetry(roomId)
      const timeoutId = window.setTimeout(() => {
        roomEmotesRetryTimeoutRef.current.delete(roomId)
        if (generation !== emoteCatalogGenerationRef.current) {
          return
        }
        roomEmotesFailedAtRef.current.delete(roomId)
        ensureRoomEmotesRef.current(login, roomId)
      }, EMOTE_LOAD_RETRY_MS)
      roomEmotesRetryTimeoutRef.current.set(roomId, timeoutId)
    },
    [
      clearRoomEmoteRetry,
      emoteCatalogGenerationRef,
      roomEmotesFailedAtRef,
      roomEmotesRetryTimeoutRef,
    ]
  )

  React.useEffect(() => {
    const timeouts = roomEmotesRetryTimeoutRef.current
    return () => {
      for (const timeoutId of timeouts.values()) {
        window.clearTimeout(timeoutId)
      }
      timeouts.clear()
    }
  }, [roomEmotesRetryTimeoutRef])

  const getTwitchHydration = React.useCallback(
    (roomId: string | null): TwitchEmoteHydration | null => {
      if (!roomId) {
        return null
      }

      const catalog = composerCatalogsRef.current.get(roomId)
      const cheermotes =
        cheermoteCatalogsRef.current.get(roomId) ?? DEFAULT_CHEERMOTE_CATALOG

      if (!catalog) {
        return getTwitchEmoteHydration(createEmptyComposerCatalog(), cheermotes)
      }

      return getTwitchEmoteHydration(catalog, cheermotes)
    },
    [cheermoteCatalogsRef, composerCatalogsRef]
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
          if (entry.kind === "system") {
            const messageChannel = entry.message.channel
              ? normalizeChannelLogin(entry.message.channel)
              : null
            if (messageChannel !== normalizedLogin) {
              return entry
            }

            const messageRoomId = entry.message.roomId
            if (messageRoomId !== null && messageRoomId !== roomId) {
              return entry
            }

            if (!entry.message.details) {
              return entry
            }

            const message =
              messageRoomId === null
                ? { ...entry.message, roomId }
                : entry.message
            const hydrated = hydrateSystemMessageDetails(
              message,
              thirdPartyCatalog,
              twitchHydration
            )
            if (message === entry.message && hydrated === entry.message) {
              return entry
            }
            changed = true
            return { ...entry, message: hydrated }
          }

          if (
            entry.kind !== "chat" &&
            entry.kind !== "automod" &&
            entry.kind !== "suspicious"
          ) {
            return entry
          }

          const messageChannel = normalizeChannelLogin(entry.message.channel)
          if (messageChannel !== normalizedLogin) {
            return entry
          }

          const messageRoomId = entry.message.roomId
          if (messageRoomId !== null && messageRoomId !== roomId) {
            return entry
          }

          if (entry.kind === "chat") {
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
          }

          if (entry.kind === "automod") {
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

      clearRoomEmoteRetry(roomId)

      roomEmotesLoadingRef.current.set(roomId, true)
      composerCatalogLoadingRef.current.set(roomId, true)
      setComposerCatalogLoading((current) => ({ ...current, [roomId]: true }))

      devFetchLogger.debugLazy(() => ["emotes:start", { login, roomId }])

      const generation = emoteCatalogGenerationRef.current
      const context = emoteLoadContextRef.current
      let appliedPartial = false

      const applyBundle = (bundle: {
        thirdParty: ThirdPartyEmoteCatalog
        composer: ComposerEmoteCatalog
        cheermotes: CheermoteCatalog
      }) => {
        if (generation !== emoteCatalogGenerationRef.current) {
          return
        }

        roomEmotesFailedAtRef.current.delete(roomId)
        emoteCatalogsRef.current.set(roomId, bundle.thirdParty)
        cheermoteCatalogsRef.current.set(roomId, bundle.cheermotes)
        composerCatalogLoadedRef.current.add(roomId)
        composerCatalogsRef.current.set(roomId, bundle.composer)
        setComposerCatalogs((current) => ({
          ...current,
          [roomId]: bundle.composer,
        }))
        rehydrateRoomTimeline(login, roomId)
      }

      const clearComposerLoading = () => {
        if (generation !== emoteCatalogGenerationRef.current) {
          return
        }

        setComposerCatalogLoading((current) => {
          if (!current[roomId]) return current
          const next = { ...current }
          delete next[roomId]
          return next
        })
      }

      void fetchRoomEmoteBundle(
        {
          roomId,
          channelLogin: login,
          accessToken: context.accessToken,
          clientId: context.clientId,
          userId: context.userId,
          channelHints: context.channelHints,
        },
        (partialBundle) => {
          applyBundle(partialBundle)

          if (!appliedPartial) {
            appliedPartial = true
            clearComposerLoading()
          }
        }
      )
        .then((bundle) => {
          if (generation !== emoteCatalogGenerationRef.current) {
            return
          }

          applyBundle(bundle)
          roomEmotesSettledRef.current.add(roomId)
          onRoomEmotesSettledRef?.current?.(roomId)
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

          if (!appliedPartial) {
            const emptyThirdParty = createEmptyEmoteCatalog()
            const emptyComposer = createEmptyComposerCatalog()
            emoteCatalogsRef.current.set(roomId, emptyThirdParty)
            composerCatalogsRef.current.set(roomId, emptyComposer)
            composerCatalogLoadedRef.current.add(roomId)
            setComposerCatalogs((current) => ({
              ...current,
              [roomId]: emptyComposer,
            }))
          }

          scheduleRoomEmoteRetry(login, roomId, generation)
          devFetchLogger.warn("emotes:error", { login, roomId })
          appendLog(`Emotes could not be loaded for #${login}.`)
        })
        .finally(() => {
          roomEmotesLoadingRef.current.delete(roomId)
          composerCatalogLoadingRef.current.delete(roomId)
          clearComposerLoading()
        })
    },
    [
      appendLog,
      cheermoteCatalogsRef,
      composerCatalogLoadedRef,
      composerCatalogLoadingRef,
      composerCatalogsRef,
      emoteCatalogGenerationRef,
      emoteLoadContextRef,
      emoteCatalogsRef,
      onRoomEmotesSettledRef,
      rehydrateRoomTimeline,
      roomEmotesFailedAtRef,
      roomEmotesLoadingRef,
      roomEmotesSettledRef,
      scheduleRoomEmoteRetry,
      clearRoomEmoteRetry,
    ]
  )

  React.useLayoutEffect(() => {
    ensureRoomEmotesRef.current = ensureRoomEmotes
  }, [ensureRoomEmotes])

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
      clearCheermoteCache()
      emoteCatalogGenerationRef.current += 1
      clearAllRoomEmoteRetries()
      roomEmotesSettledRef.current.clear()
      roomEmotesFailedAtRef.current.clear()
      setComposerCatalogs({})
      composerCatalogsRef.current.clear()
      cheermoteCatalogsRef.current.clear()
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
      cheermoteCatalogsRef,
      composerCatalogLoadedRef,
      composerCatalogLoadingRef,
      composerCatalogsRef,
      emoteCatalogGenerationRef,
      emoteLoadContextRef,
      ensureRoomEmotes,
      clearAllRoomEmoteRetries,
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

      clearRoomEmoteRetry(roomId)

      clearThirdPartyEmoteCache(roomId)
      clearChannelTwitchEmoteCache(roomId)
      clearRoomEmoteBundleCache(roomId)
      clearCheermoteCache(roomId)

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
      let appliedPartial = false

      roomEmotesLoadingRef.current.set(roomId, true)
      composerCatalogLoadingRef.current.set(roomId, true)

      const applyBundle = (bundle: {
        thirdParty: ThirdPartyEmoteCatalog
        composer: ComposerEmoteCatalog
        cheermotes: CheermoteCatalog
      }) => {
        if (generation !== emoteCatalogGenerationRef.current) {
          return
        }

        roomEmotesFailedAtRef.current.delete(roomId)
        emoteCatalogsRef.current.set(roomId, bundle.thirdParty)
        cheermoteCatalogsRef.current.set(roomId, bundle.cheermotes)
        composerCatalogLoadedRef.current.add(roomId)
        composerCatalogsRef.current.set(roomId, bundle.composer)
        setComposerCatalogs((current) => ({
          ...current,
          [roomId]: bundle.composer,
        }))
        rehydrateRoomTimeline(normalized, roomId)
      }

      const clearComposerLoading = () => {
        if (generation !== emoteCatalogGenerationRef.current) {
          return
        }

        setComposerCatalogLoading((current) => {
          if (!current[roomId]) return current
          const next = { ...current }
          delete next[roomId]
          return next
        })
      }

      try {
        const bundle = await fetchRoomEmoteBundle(
          {
            roomId,
            channelLogin: normalized,
            accessToken: context.accessToken,
            clientId: context.clientId,
            userId: context.userId,
            channelHints: context.channelHints,
          },
          (partialBundle) => {
            applyBundle(partialBundle)

            if (!appliedPartial) {
              appliedPartial = true
              clearComposerLoading()
            }
          }
        )

        if (generation !== emoteCatalogGenerationRef.current) {
          return true
        }

        applyBundle(bundle)
        roomEmotesSettledRef.current.add(roomId)
        onRoomEmotesSettledRef?.current?.(roomId)
      } catch {
        if (generation === emoteCatalogGenerationRef.current) {
          if (!appliedPartial) {
            const emptyThirdParty = createEmptyEmoteCatalog()
            const emptyComposer = createEmptyComposerCatalog()
            emoteCatalogsRef.current.set(roomId, emptyThirdParty)
            composerCatalogsRef.current.set(roomId, emptyComposer)
            composerCatalogLoadedRef.current.add(roomId)
            setComposerCatalogs((current) => ({
              ...current,
              [roomId]: emptyComposer,
            }))
          }

          roomEmotesFailedAtRef.current.set(roomId, Date.now())
          scheduleRoomEmoteRetry(normalized, roomId, generation)
        }
      } finally {
        roomEmotesLoadingRef.current.delete(roomId)
        composerCatalogLoadingRef.current.delete(roomId)

        if (generation === emoteCatalogGenerationRef.current) {
          clearComposerLoading()
        }
      }

      return true
    },
    [
      cheermoteCatalogsRef,
      composerCatalogLoadedRef,
      composerCatalogLoadingRef,
      composerCatalogsRef,
      emoteCatalogGenerationRef,
      emoteLoadContextRef,
      emoteCatalogsRef,
      onRoomEmotesSettledRef,
      rehydrateRoomTimeline,
      roomEmotesFailedAtRef,
      roomEmotesLoadingRef,
      roomEmotesSettledRef,
      roomsRef,
      clearRoomEmoteRetry,
      scheduleRoomEmoteRetry,
    ]
  )

  const clearEmotesForRoomIds = React.useCallback(
    (roomIds: string[]) => {
      if (roomIds.length > 0) {
        onRoomsClearedRef?.current?.(roomIds)
      }

      for (const roomId of roomIds) {
        clearRoomEmoteRetry(roomId)
        emoteCatalogsRef.current.delete(roomId)
        composerCatalogsRef.current.delete(roomId)
        cheermoteCatalogsRef.current.delete(roomId)
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
      cheermoteCatalogsRef,
      composerCatalogLoadedRef,
      composerCatalogLoadingRef,
      composerCatalogsRef,
      emoteCatalogsRef,
      onRoomsClearedRef,
      clearRoomEmoteRetry,
      roomEmotesFailedAtRef,
      roomEmotesLoadingRef,
      roomEmotesSettledRef,
    ]
  )

  const clearAllEmoteState = React.useCallback(() => {
    const roomIds = [...emoteCatalogsRef.current.keys()]
    if (roomIds.length > 0) {
      onRoomsClearedRef?.current?.(roomIds)
    }

    emoteCatalogGenerationRef.current += 1
    clearAllRoomEmoteRetries()
    clearThirdPartyEmoteCache()
    clearTwitchEmoteSessionCache()
    clearBroadcasterProfileCache()
    clearTwitchEmoteIvrCache()
    clearRoomEmoteBundleCache()
    clearCheermoteCache()
    emoteCatalogsRef.current.clear()
    composerCatalogsRef.current.clear()
    cheermoteCatalogsRef.current.clear()
    setComposerCatalogs({})
    composerCatalogLoadedRef.current.clear()
    roomEmotesLoadingRef.current.clear()
    roomEmotesSettledRef.current.clear()
    roomEmotesFailedAtRef.current.clear()
    composerCatalogLoadingRef.current.clear()
    setComposerCatalogLoading({})
  }, [
    cheermoteCatalogsRef,
    composerCatalogLoadedRef,
    composerCatalogLoadingRef,
    composerCatalogsRef,
    emoteCatalogGenerationRef,
    emoteCatalogsRef,
    onRoomsClearedRef,
    clearAllRoomEmoteRetries,
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

  const applyRoomEmoteBundle = React.useCallback(
    (
      roomId: string,
      bundle: {
        thirdParty: ThirdPartyEmoteCatalog
        composer: ComposerEmoteCatalog
        cheermotes: CheermoteCatalog
      }
    ) => {
      emoteCatalogsRef.current.set(roomId, bundle.thirdParty)
      cheermoteCatalogsRef.current.set(roomId, bundle.cheermotes)
      composerCatalogsRef.current.set(roomId, bundle.composer)
      composerCatalogLoadedRef.current.add(roomId)
      roomEmotesSettledRef.current.add(roomId)
      setComposerCatalogs((current) => ({
        ...current,
        [roomId]: bundle.composer,
      }))
    },
    [
      cheermoteCatalogsRef,
      composerCatalogLoadedRef,
      composerCatalogsRef,
      emoteCatalogsRef,
      roomEmotesSettledRef,
    ]
  )

  return {
    emoteCatalogsRef,
    composerCatalogsRef,
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
    rehydrateRoomTimeline,
    rehydrateAllRoomTimelines,
    refreshEmotes,
    clearEmotesForRoomIds,
    clearAllEmoteState,
    getCatalogForRoom,
    isRoomEmotesSettled,
    applyRoomEmoteBundle,
  }
}

export type ChatEmotesApi = ReturnType<typeof useChatEmotes>
