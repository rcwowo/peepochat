import * as React from "react"

import type {
  AppendRoomTimelineOptions,
  PendingLiveTimelineBatch,
} from "@/hooks/twitch/chat/types"
import type { RoomStore } from "@/hooks/twitch/chat/use-room-store"
import { devChatLogger } from "@/lib/dev-logger"
import type { DeletedMessagesBehavior } from "@/lib/peepochat/peepochat-config"
import { LIVE_MESSAGES_PER_CHANNEL_DEFAULT } from "@/lib/peepochat/peepochat-config"
import {
  getTimelineMessageIds,
  partitionTimeline,
  partitionTimelineWithKnownIds,
  purgeDeletedChatEntries,
  purgeMessagesFromUsers,
  trimTimeline,
  type TimelineMatchableMessage,
} from "@/lib/twitch/chat-timeline"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import type { TwitchSystemMessage } from "@/lib/twitch/twitch-chat"
import type {
  TwitchChatRoomState,
  TwitchTimelineItem,
} from "@/lib/twitch/twitch-chat-types"

type UseTimelineOptions = {
  roomStore: RoomStore
  hideBlockedUsersRef: React.MutableRefObject<boolean>
  isUserBlockedRef: React.MutableRefObject<
    (userId?: string | null, login?: string | null) => boolean
  >
  onTimelineItems?: (
    login: string,
    items: TwitchTimelineItem[],
    options?: { flush?: boolean }
  ) => void
}

export function useTimeline({
  roomStore,
  hideBlockedUsersRef,
  isUserBlockedRef,
  onTimelineItems,
}: UseTimelineOptions) {
  const { commitRooms, updateRoom } = roomStore
  const liveMessageLimitRef = React.useRef(LIVE_MESSAGES_PER_CHANNEL_DEFAULT)
  const deletedMessagesBehaviorRef =
    React.useRef<DeletedMessagesBehavior>("strikethrough")
  const pendingLiveTimelineRef = React.useRef<
    Map<string, PendingLiveTimelineBatch>
  >(new Map())
  const onTimelineItemsRef = React.useRef(onTimelineItems)
  React.useLayoutEffect(() => {
    onTimelineItemsRef.current = onTimelineItems
  }, [onTimelineItems])

  const trimWithLimit = React.useCallback((timeline: TwitchTimelineItem[]) => {
    return trimTimeline(timeline, liveMessageLimitRef.current)
  }, [])

  const commitRoomTimelineAppend = React.useCallback(
    (
      login: string,
      items: TwitchTimelineItem[],
      options?: AppendRoomTimelineOptions
    ) => {
      if (items.length === 0) return

      updateRoom(login, (room) => {
        const nextRoomId =
          options?.roomId && !room.roomId ? options.roomId : room.roomId
        const { historical, live } = partitionTimeline(room.timeline)
        const knownIds = getTimelineMessageIds(room.timeline)
        const nextHistorical = [...historical]
        const nextLive = [...live]
        const historicalIndexByMessageId = new Map<string, number>()
        for (let index = 0; index < nextHistorical.length; index++) {
          historicalIndexByMessageId.set(
            nextHistorical[index].message.id,
            index
          )
        }

        for (const item of items) {
          if (item.isHistorical) {
            continue
          }

          const messageId = item.message.id
          const historicalIndex = historicalIndexByMessageId.get(messageId)
          if (historicalIndex !== undefined) {
            devChatLogger.debugLazy(() => [
              "timeline:promote-historical",
              {
                login,
                id: messageId,
                kind: item.kind,
              },
            ])
            nextHistorical.splice(historicalIndex, 1)
            historicalIndexByMessageId.delete(messageId)
            for (const [id, index] of historicalIndexByMessageId) {
              if (index > historicalIndex) {
                historicalIndexByMessageId.set(id, index - 1)
              }
            }
            nextLive.push(item)
            continue
          }

          if (knownIds.has(messageId)) {
            devChatLogger.debugLazy(() => [
              "timeline:skip-dedup",
              {
                login,
                id: messageId,
                kind: item.kind,
              },
            ])
            continue
          }

          knownIds.add(messageId)
          nextLive.push(item)
        }

        const addedCount = nextLive.length - live.length
        if (addedCount === 0 && nextRoomId === room.roomId) {
          return room
        }

        devChatLogger.debugLazy(() => [
          "timeline:append-live",
          {
            login,
            added: addedCount,
            total: nextHistorical.length + nextLive.length,
          },
        ])

        const nextTimeline = trimWithLimit([...nextHistorical, ...nextLive])
        if (nextRoomId === room.roomId) {
          return { ...room, timeline: nextTimeline }
        }

        return {
          ...room,
          roomId: nextRoomId,
          timeline: nextTimeline,
        }
      })
    },
    [trimWithLimit, updateRoom]
  )

  const flushLiveTimelineBatch = React.useCallback(
    (login: string) => {
      const normalized = normalizeChannelLogin(login)
      const batch = pendingLiveTimelineRef.current.get(normalized)
      if (!batch) {
        return
      }

      if (batch.frameId !== null) {
        cancelAnimationFrame(batch.frameId)
        batch.frameId = null
      }

      if (batch.items.length === 0) {
        return
      }

      const items = batch.items
      const roomId = batch.roomId
      batch.items = []
      batch.roomId = undefined

      commitRoomTimelineAppend(normalized, items, { roomId })
    },
    [commitRoomTimelineAppend]
  )

  const queueLiveRoomTimeline = React.useCallback(
    (
      login: string,
      items: TwitchTimelineItem[],
      options?: AppendRoomTimelineOptions
    ) => {
      if (items.length === 0) {
        return
      }

      const normalized = normalizeChannelLogin(login)
      onTimelineItemsRef.current?.(normalized, items)
      let batch = pendingLiveTimelineRef.current.get(normalized)
      if (!batch) {
        batch = { items: [], roomId: undefined, frameId: null }
        pendingLiveTimelineRef.current.set(normalized, batch)
      }

      batch.items.push(...items)
      if (options?.roomId && batch.roomId === undefined) {
        batch.roomId = options.roomId
      }

      if (batch.frameId !== null) {
        return
      }

      batch.frameId = requestAnimationFrame(() => {
        const pending = pendingLiveTimelineRef.current.get(normalized)
        if (!pending) {
          return
        }

        pending.frameId = null
        flushLiveTimelineBatch(normalized)
      })
    },
    [flushLiveTimelineBatch]
  )

  React.useEffect(() => {
    const pendingLiveTimeline = pendingLiveTimelineRef.current

    return () => {
      for (const login of pendingLiveTimeline.keys()) {
        flushLiveTimelineBatch(login)
      }
    }
  }, [flushLiveTimelineBatch])

  const flushLiveTimelineBatchRef = React.useRef(flushLiveTimelineBatch)
  React.useEffect(() => {
    flushLiveTimelineBatchRef.current = flushLiveTimelineBatch
  }, [flushLiveTimelineBatch])

  const prependHistoricalTimeline = React.useCallback(
    (login: string, items: TwitchTimelineItem[]) => {
      if (items.length === 0) return

      onTimelineItemsRef.current?.(login, items, { flush: true })

      updateRoom(login, (room) => {
        const { historical, live, knownIds } = partitionTimelineWithKnownIds(
          room.timeline
        )
        const nextHistorical = [...historical]

        for (const item of items) {
          const messageId = item.message.id
          if (knownIds.has(messageId)) {
            devChatLogger.debugLazy(() => [
              "timeline:skip-historical-dedup",
              {
                login,
                id: messageId,
                kind: item.kind,
              },
            ])
            continue
          }

          if (
            item.kind === "chat" &&
            hideBlockedUsersRef.current &&
            isUserBlockedRef.current(item.message.userId, item.message.userName)
          ) {
            continue
          }

          knownIds.add(messageId)
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
          timeline: trimWithLimit([...nextHistorical, ...live]),
        }
      })
    },
    [hideBlockedUsersRef, isUserBlockedRef, trimWithLimit, updateRoom]
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

      commitRooms((current) => {
        const next = { ...current }
        for (const channelLogin of Object.keys(next)) {
          next[channelLogin] = clearRoom(next[channelLogin])
        }
        return next
      })
    },
    [commitRooms, updateRoom]
  )

  const appendRoomSystemMessage = React.useCallback(
    (login: string, message: TwitchSystemMessage) => {
      queueLiveRoomTimeline(login, [{ kind: "system", message }])
    },
    [queueLiveRoomTimeline]
  )

  const setLiveMessageLimit = React.useCallback(
    (limit: number) => {
      const previous = liveMessageLimitRef.current
      liveMessageLimitRef.current = limit

      if (limit < previous) {
        commitRooms((current) => {
          let changed = false
          const next: Record<string, TwitchChatRoomState> = { ...current }

          for (const [login, room] of Object.entries(current)) {
            const trimmed = trimWithLimit(room.timeline)
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
      }
    },
    [commitRooms, trimWithLimit]
  )

  const setDeletedMessagesBehavior = React.useCallback(
    (behavior: DeletedMessagesBehavior) => {
      const previous = deletedMessagesBehaviorRef.current
      deletedMessagesBehaviorRef.current = behavior

      if (previous !== "remove" && behavior === "remove") {
        commitRooms((current) => {
          let changed = false
          const next: Record<string, TwitchChatRoomState> = { ...current }

          for (const [login, room] of Object.entries(current)) {
            const purged = purgeDeletedChatEntries(room.timeline)
            if (purged.length === room.timeline.length) {
              continue
            }

            changed = true
            next[login] = { ...room, timeline: purged }
          }

          return changed ? next : current
        })
      }
    },
    [commitRooms]
  )

  const purgeMessagesFromBlockedUsers = React.useCallback(
    (matches: (message: TimelineMatchableMessage) => boolean) => {
      commitRooms((current) => {
        let changed = false
        const next: Record<string, TwitchChatRoomState> = { ...current }

        for (const [login, room] of Object.entries(current)) {
          const purged = purgeMessagesFromUsers(room.timeline, matches)
          if (purged.length === room.timeline.length) {
            continue
          }

          changed = true
          next[login] = { ...room, timeline: purged }
        }

        return changed ? next : current
      })
    },
    [commitRooms]
  )

  const purgeMessagesFromUser = React.useCallback(
    (userId: string, login: string) => {
      const normalizedLogin = login.toLowerCase()
      purgeMessagesFromBlockedUsers(
        (message) =>
          (userId.length > 0 && message.userId === userId) ||
          message.userName.toLowerCase() === normalizedLogin
      )
    },
    [purgeMessagesFromBlockedUsers]
  )

  const flushPendingForLogins = React.useCallback((logins: string[]) => {
    for (const login of logins) {
      const normalized = normalizeChannelLogin(login)
      flushLiveTimelineBatchRef.current(normalized)
      pendingLiveTimelineRef.current.delete(normalized)
    }
  }, [])

  const flushAllPending = React.useCallback(() => {
    for (const login of pendingLiveTimelineRef.current.keys()) {
      flushLiveTimelineBatchRef.current(login)
    }
    pendingLiveTimelineRef.current.clear()
  }, [])

  const appendSystemMessageToAllRooms = React.useCallback(
    (message: TwitchSystemMessage) => {
      commitRooms((current) => {
        const next = { ...current }
        for (const channelLogin of Object.keys(next)) {
          const room = next[channelLogin]
          const { historical, live } = partitionTimeline(room.timeline)
          next[channelLogin] = {
            ...room,
            timeline: trimWithLimit([
              ...historical,
              ...live,
              { kind: "system" as const, message },
            ]),
          }
        }
        return next
      })
    },
    [commitRooms, trimWithLimit]
  )

  return {
    liveMessageLimitRef,
    deletedMessagesBehaviorRef,
    pendingLiveTimelineRef,
    flushLiveTimelineBatchRef,
    queueLiveRoomTimeline,
    prependHistoricalTimeline,
    clearHistoricalTimeline,
    appendRoomSystemMessage,
    appendSystemMessageToAllRooms,
    setLiveMessageLimit,
    setDeletedMessagesBehavior,
    purgeMessagesFromBlockedUsers,
    purgeMessagesFromUser,
    flushPendingForLogins,
    flushAllPending,
    trimWithLimit,
  }
}

export type TimelineApi = ReturnType<typeof useTimeline>
