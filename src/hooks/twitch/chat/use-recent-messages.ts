import * as React from "react"

import type { ChatEmotesApi } from "@/hooks/twitch/chat/use-chat-emotes"
import type { RoomStore } from "@/hooks/twitch/chat/use-room-store"
import type { TimelineApi } from "@/hooks/twitch/chat/use-timeline"
import { useLazyRef } from "@/hooks/use-lazy-ref"
import { devFetchLogger } from "@/lib/dev-logger"
import {
  createRecentMessagesStatusMessage,
  fetchRecentMessages,
  RECENT_MESSAGES_CONCURRENCY,
  RECENT_MESSAGES_ERROR_TEXT,
  RECENT_MESSAGES_UNAVAILABLE_TEXT,
} from "@/lib/chat/recent-messages"
import type { DeletedMessagesBehavior } from "@/lib/peepochat/peepochat-config"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"

type UseRecentMessagesOptions = {
  roomStore: RoomStore
  timeline: TimelineApi
  emotes: ChatEmotesApi
  syncedChannelsRef: React.MutableRefObject<string[]>
}

export function useRecentMessages({
  roomStore,
  timeline,
  emotes,
  syncedChannelsRef,
}: UseRecentMessagesOptions) {
  const { roomsRef, updateRoom } = roomStore
  const {
    liveMessageLimitRef,
    deletedMessagesBehaviorRef,
    prependHistoricalTimeline,
    appendRoomSystemMessage,
    clearHistoricalTimeline,
  } = timeline
  const {
    emoteCatalogsRef,
    ensureRoomEmotes,
    hydrateRoomMessage,
    roomEmotesSettledRef,
  } = emotes

  const recentMessagesEnabledRef = React.useRef(true)
  const historyFetchLimitRef = React.useRef(0)
  const historyLoadedRef = useLazyRef(() => new Set<string>())
  const historyLoadingRef = useLazyRef(() => new Set<string>())
  const historyErrorNotifiedRef = useLazyRef(() => new Set<string>())
  const recentMessagesGenerationRef = React.useRef(0)
  const recentMessagesQueueRef = React.useRef<string[]>([])
  const recentMessagesQueuedRef = useLazyRef(() => new Set<string>())
  const recentMessagesActiveRef = React.useRef(0)
  const loadingListenersRef = useLazyRef(
    () => new Map<string, Set<() => void>>()
  )

  const notifyRecentMessagesLoading = React.useCallback(
    (login: string) => {
      const listeners = loadingListenersRef.current.get(login)
      if (!listeners) {
        return
      }

      for (const listener of listeners) {
        listener()
      }
    },
    [loadingListenersRef]
  )

  const isRecentMessagesLoading = React.useCallback(
    (login: string): boolean => {
      if (!recentMessagesEnabledRef.current) {
        return false
      }

      const normalized = normalizeChannelLogin(login)
      if (historyLoadedRef.current.has(normalized)) {
        return false
      }

      return (
        historyLoadingRef.current.has(normalized) ||
        recentMessagesQueuedRef.current.has(normalized)
      )
    },
    [
      historyLoadedRef,
      historyLoadingRef,
      recentMessagesEnabledRef,
      recentMessagesQueuedRef,
    ]
  )

  const subscribeToRecentMessagesLoading = React.useCallback(
    (login: string, listener: () => void) => {
      const normalized = normalizeChannelLogin(login)
      let set = loadingListenersRef.current.get(normalized)
      if (!set) {
        set = new Set()
        loadingListenersRef.current.set(normalized, set)
      }
      set.add(listener)
      return () => {
        set.delete(listener)
        if (set.size === 0) {
          loadingListenersRef.current.delete(normalized)
        }
      }
    },
    [loadingListenersRef]
  )

  const shouldApplyRecentMessagesFetch = React.useCallback(
    (normalized: string, generation: number) => {
      return (
        recentMessagesEnabledRef.current &&
        syncedChannelsRef.current.includes(normalized) &&
        recentMessagesGenerationRef.current === generation
      )
    },
    [syncedChannelsRef]
  )

  const clearRecentMessagesQueue = React.useCallback(() => {
    recentMessagesQueueRef.current = []
    recentMessagesQueuedRef.current.clear()
    recentMessagesGenerationRef.current += 1
  }, [
    recentMessagesGenerationRef,
    recentMessagesQueueRef,
    recentMessagesQueuedRef,
  ])

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
          notifyRecentMessagesLoading(normalized)

          devFetchLogger.debugLazy(() => [
            "recent-messages:start",
            { channel: normalized },
          ])

          const fetchLimit = liveMessageLimitRef.current

          try {
            const outcome = await fetchRecentMessages(normalized, fetchLimit)

            if (shouldApplyRecentMessagesFetch(normalized, generation)) {
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
                  historyFetchLimitRef.current = Math.max(
                    historyFetchLimitRef.current,
                    fetchLimit
                  )

                  if (outcome.messages.length === 0) {
                    break
                  }

                  const roomId =
                    outcome.messages.find((message) => message.roomId)
                      ?.roomId ??
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

                  const hideDeletedMessages =
                    deletedMessagesBehaviorRef.current === "remove"

                  prependHistoricalTimeline(
                    normalized,
                    outcome.messages
                      .filter(
                        (message) =>
                          !hideDeletedMessages || message.deletedAt === null
                      )
                      .map((message) => {
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
                  break
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
                  break
                }
                case "error": {
                  if (historyErrorNotifiedRef.current.has(normalized)) {
                    break
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
            } else {
              devFetchLogger.debugLazy(() => [
                "recent-messages:stale",
                { channel: normalized },
              ])
            }
          } finally {
            historyLoadingRef.current.delete(normalized)
            recentMessagesQueuedRef.current.delete(normalized)
            notifyRecentMessagesLoading(normalized)
            recentMessagesActiveRef.current -= 1
            runNext()
          }
        })()
      }
    }

    runNext()
  }, [
    appendRoomSystemMessage,
    deletedMessagesBehaviorRef,
    emoteCatalogsRef,
    ensureRoomEmotes,
    historyErrorNotifiedRef,
    historyFetchLimitRef,
    historyLoadedRef,
    historyLoadingRef,
    hydrateRoomMessage,
    liveMessageLimitRef,
    notifyRecentMessagesLoading,
    prependHistoricalTimeline,
    recentMessagesActiveRef,
    recentMessagesGenerationRef,
    recentMessagesQueueRef,
    recentMessagesQueuedRef,
    roomEmotesSettledRef,
    roomsRef,
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
      notifyRecentMessagesLoading(normalized)
      recentMessagesQueueRef.current.push(normalized)
      drainRecentMessagesQueue()
    },
    [
      drainRecentMessagesQueue,
      historyLoadedRef,
      historyLoadingRef,
      notifyRecentMessagesLoading,
      recentMessagesEnabledRef,
      recentMessagesQueuedRef,
      recentMessagesQueueRef,
    ]
  )

  const setRecentMessagesEnabled = React.useCallback(
    (enabled: boolean) => {
      const wasEnabled = recentMessagesEnabledRef.current
      recentMessagesEnabledRef.current = enabled

      if (!enabled) {
        const loadingChannels = new Set([
          ...historyLoadingRef.current,
          ...recentMessagesQueuedRef.current,
        ])
        historyLoadedRef.current.clear()
        historyLoadingRef.current.clear()
        historyErrorNotifiedRef.current.clear()
        historyFetchLimitRef.current = 0
        clearRecentMessagesQueue()
        for (const login of loadingChannels) {
          notifyRecentMessagesLoading(login)
        }
        if (wasEnabled) {
          clearHistoricalTimeline()
        }
        return
      }

      if (!wasEnabled) {
        historyLoadedRef.current.clear()
        historyErrorNotifiedRef.current.clear()
        historyFetchLimitRef.current = 0
        for (const login of syncedChannelsRef.current) {
          loadRecentMessages(login)
        }
      }
    },
    [
      clearHistoricalTimeline,
      clearRecentMessagesQueue,
      historyErrorNotifiedRef,
      historyFetchLimitRef,
      historyLoadedRef,
      historyLoadingRef,
      loadRecentMessages,
      notifyRecentMessagesLoading,
      recentMessagesEnabledRef,
      recentMessagesQueuedRef,
      syncedChannelsRef,
    ]
  )

  const clearHistoryForLogins = React.useCallback(
    (logins: string[]) => {
      const removed = new Set(logins)
      for (const login of logins) {
        historyLoadedRef.current.delete(login)
        historyLoadingRef.current.delete(login)
        historyErrorNotifiedRef.current.delete(login)
        recentMessagesQueuedRef.current.delete(login)
        notifyRecentMessagesLoading(login)
      }

      if (recentMessagesQueueRef.current.length > 0) {
        recentMessagesQueueRef.current = recentMessagesQueueRef.current.filter(
          (login) => !removed.has(login)
        )
      }
    },
    [
      historyErrorNotifiedRef,
      historyLoadedRef,
      historyLoadingRef,
      notifyRecentMessagesLoading,
      recentMessagesQueueRef,
      recentMessagesQueuedRef,
    ]
  )

  const handleDeletedMessagesBehaviorChange = React.useCallback(
    (previous: DeletedMessagesBehavior, behavior: DeletedMessagesBehavior) => {
      if (
        previous !== "remove" ||
        behavior === "remove" ||
        !recentMessagesEnabledRef.current
      ) {
        return
      }

      for (const login of syncedChannelsRef.current) {
        historyLoadedRef.current.delete(login)
        historyErrorNotifiedRef.current.delete(login)
      }

      clearHistoricalTimeline()

      for (const login of syncedChannelsRef.current) {
        loadRecentMessages(login)
      }
    },
    [
      clearHistoricalTimeline,
      historyErrorNotifiedRef,
      historyLoadedRef,
      loadRecentMessages,
      recentMessagesEnabledRef,
      syncedChannelsRef,
    ]
  )

  const clearAllHistoryState = React.useCallback(() => {
    const loadingChannels = new Set([
      ...historyLoadingRef.current,
      ...recentMessagesQueuedRef.current,
    ])
    historyLoadedRef.current.clear()
    historyLoadingRef.current.clear()
    historyErrorNotifiedRef.current.clear()
    clearRecentMessagesQueue()
    for (const login of loadingChannels) {
      notifyRecentMessagesLoading(login)
    }
  }, [
    clearRecentMessagesQueue,
    historyErrorNotifiedRef,
    historyLoadedRef,
    historyLoadingRef,
    notifyRecentMessagesLoading,
    recentMessagesQueuedRef,
  ])

  return {
    loadRecentMessages,
    setRecentMessagesEnabled,
    handleDeletedMessagesBehaviorChange,
    clearRecentMessagesQueue,
    clearHistoryForLogins,
    clearAllHistoryState,
    isRecentMessagesLoading,
    subscribeToRecentMessagesLoading,
  }
}

export type RecentMessagesApi = ReturnType<typeof useRecentMessages>
