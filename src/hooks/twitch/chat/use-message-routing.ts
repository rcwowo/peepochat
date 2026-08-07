import * as React from "react"

import type { ChatEmotesApi } from "@/hooks/twitch/chat/use-chat-emotes"
import type { ChatSendApi } from "@/hooks/twitch/chat/use-chat-send"
import type { RoomStore } from "@/hooks/twitch/chat/use-room-store"
import type { TimelineApi } from "@/hooks/twitch/chat/use-timeline"
import { devChatLogger } from "@/lib/dev-logger"
import { hydrateSystemMessageDetails } from "@/lib/chat/chat-emotes"
import {
  applyDeletedBehaviorToTimeline,
  notifyChatMessageDeleted,
  selfStateFromMessage,
  type TimelineMatchableMessage,
} from "@/lib/twitch/chat-timeline"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import {
  createClearChatModActionMessage,
  type TwitchChatMessage,
  type TwitchClearChatEvent,
  type TwitchClearMsgEvent,
  type TwitchSystemMessage,
} from "@/lib/twitch/twitch-chat"
import type { TwitchSelfChatState } from "@/lib/twitch/twitch-chat-types"

type UseMessageRoutingOptions = {
  roomStore: RoomStore
  timeline: TimelineApi
  emotes: ChatEmotesApi
  send: Pick<
    ChatSendApi,
    "emitSendOutcome" | "pendingSendRef" | "applySelfModerationRestriction"
  >
  syncedChannelsRef: React.MutableRefObject<string[]>
  hideBlockedUsersRef: React.MutableRefObject<boolean>
  isUserBlockedRef: React.MutableRefObject<
    (userId?: string | null, login?: string | null) => boolean
  >
  clearChatWhenInstructedRef: React.MutableRefObject<boolean>
  selfStatesRef: React.MutableRefObject<Map<string, TwitchSelfChatState>>
  updateSelfState: (state: TwitchSelfChatState) => void
  onChatMessageRef?: React.RefObject<
    ((message: TwitchChatMessage) => void) | null
  >
}

export function useMessageRouting({
  roomStore,
  timeline,
  emotes,
  send,
  syncedChannelsRef,
  hideBlockedUsersRef,
  isUserBlockedRef,
  clearChatWhenInstructedRef,
  selfStatesRef,
  updateSelfState,
  onChatMessageRef,
}: UseMessageRoutingOptions) {
  const { updateRoom } = roomStore
  const {
    deletedMessagesBehaviorRef,
    queueLiveRoomTimeline,
    appendRoomSystemMessage,
    appendSystemMessageToAllRooms,
  } = timeline
  const {
    emoteCatalogsRef,
    emoteLoadContextRef,
    ensureRoomEmotes,
    hydrateRoomMessage,
    getTwitchHydration,
  } = emotes
  const { emitSendOutcome, pendingSendRef, applySelfModerationRestriction } =
    send

  const routeMessageToRoom = React.useCallback(
    (message: TwitchChatMessage) => {
      const login = normalizeChannelLogin(message.channel)
      if (!syncedChannelsRef.current.includes(login)) {
        return
      }

      const roomId = message.roomId

      if (roomId) {
        ensureRoomEmotes(login, roomId)
        updateRoom(login, (room) => {
          if (room.roomId) {
            return room
          }

          return { ...room, roomId }
        })
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

      const userLogin = emoteLoadContextRef.current.userLogin
      if (
        userLogin &&
        normalizeChannelLogin(message.userName) ===
          normalizeChannelLogin(userLogin)
      ) {
        updateSelfState(selfStateFromMessage({ ...hydrated, channel: login }))
        pendingSendRef.current = null
        emitSendOutcome({ type: "echo", message: hydrated })
      }

      if (
        hideBlockedUsersRef.current &&
        isUserBlockedRef.current(message.userId, message.userName)
      ) {
        return
      }

      queueLiveRoomTimeline(login, [{ kind: "chat", message: hydrated }], {
        roomId,
      })
      onChatMessageRef?.current?.(hydrated)
    },
    [
      emoteCatalogsRef,
      emitSendOutcome,
      emoteLoadContextRef,
      ensureRoomEmotes,
      hideBlockedUsersRef,
      hydrateRoomMessage,
      isUserBlockedRef,
      onChatMessageRef,
      pendingSendRef,
      queueLiveRoomTimeline,
      syncedChannelsRef,
      updateRoom,
      updateSelfState,
    ]
  )

  const applyRoomMessageDeletions = React.useCallback(
    (
      login: string,
      matches: (message: TimelineMatchableMessage) => boolean,
      deletedAt = new Date().toISOString()
    ) => {
      const behavior = deletedMessagesBehaviorRef.current
      let deletedMessageIds: string[] = []

      updateRoom(login, (room) => {
        const result = applyDeletedBehaviorToTimeline(
          room.timeline,
          matches,
          deletedAt,
          behavior
        )
        deletedMessageIds = result.deletedMessageIds

        if (result.deletedMessageIds.length === 0) {
          return room
        }

        return { ...room, timeline: result.timeline }
      })

      for (const messageId of deletedMessageIds) {
        notifyChatMessageDeleted(login, messageId)
      }
    },
    [deletedMessagesBehaviorRef, updateRoom]
  )

  const markChatMessageDeleted = React.useCallback(
    (login: string, messageId: string) => {
      applyRoomMessageDeletions(
        normalizeChannelLogin(login),
        (message) => message.id === messageId
      )
    },
    [applyRoomMessageDeletions]
  )

  const routeClearMsg = React.useCallback(
    (event: TwitchClearMsgEvent) => {
      const login = normalizeChannelLogin(event.channel)
      if (!syncedChannelsRef.current.includes(login)) {
        return
      }

      applyRoomMessageDeletions(
        login,
        (message) => message.id === event.messageId
      )
    },
    [applyRoomMessageDeletions, syncedChannelsRef]
  )

  const routeClearChat = React.useCallback(
    (event: TwitchClearChatEvent) => {
      const login = normalizeChannelLogin(event.channel)
      if (!syncedChannelsRef.current.includes(login)) {
        return
      }

      const hasTarget = Boolean(event.targetUserId || event.targetUserName)

      if (hasTarget) {
        const normalizedTargetLogin =
          event.targetUserName?.toLowerCase() ?? null
        applyRoomMessageDeletions(login, (message) => {
          if (event.targetUserId && message.userId === event.targetUserId) {
            return true
          }
          if (
            normalizedTargetLogin &&
            message.userName.toLowerCase() === normalizedTargetLogin
          ) {
            return true
          }
          return false
        })

        const modAction = createClearChatModActionMessage(event)
        if (modAction) {
          appendRoomSystemMessage(login, modAction)
        }

        const { userId, userLogin } = emoteLoadContextRef.current
        const isSelfTarget =
          (event.targetUserId && userId && event.targetUserId === userId) ||
          (normalizedTargetLogin &&
            userLogin &&
            normalizedTargetLogin === normalizeChannelLogin(userLogin))
        if (isSelfTarget) {
          const durationSeconds = event.banDurationSeconds
          if (
            durationSeconds != null &&
            Number.isFinite(durationSeconds) &&
            durationSeconds > 0
          ) {
            applySelfModerationRestriction(login, {
              kind: "timeout",
              durationSeconds,
            })
          } else {
            applySelfModerationRestriction(login, { kind: "ban" })
          }
        }
        return
      }

      if (!clearChatWhenInstructedRef.current) {
        return
      }

      const selfState = selfStatesRef.current.get(login)
      if (selfState?.isModerator || selfState?.isBroadcaster) {
        return
      }

      updateRoom(login, (room) => {
        const deletedMessageIds = room.timeline.flatMap((entry) =>
          entry.kind === "chat" || entry.kind === "suspicious"
            ? [entry.message.id]
            : []
        )

        if (deletedMessageIds.length === 0) {
          return room
        }

        for (const messageId of deletedMessageIds) {
          notifyChatMessageDeleted(login, messageId)
        }

        return {
          ...room,
          timeline: room.timeline.filter(
            (entry) => entry.kind !== "chat" && entry.kind !== "suspicious"
          ),
        }
      })
    },
    [
      appendRoomSystemMessage,
      applyRoomMessageDeletions,
      applySelfModerationRestriction,
      clearChatWhenInstructedRef,
      emoteLoadContextRef,
      selfStatesRef,
      syncedChannelsRef,
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
          (message.event === "subscription" ||
            message.event === "announcement") &&
          message.details
        ) {
          const roomId = message.roomId
          const thirdPartyCatalog = roomId
            ? (emoteCatalogsRef.current.get(roomId) ?? null)
            : null

          message = hydrateSystemMessageDetails(
            message,
            thirdPartyCatalog,
            roomId ? getTwitchHydration(roomId) : null
          )
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

      appendSystemMessageToAllRooms(message)
    },
    [
      appendRoomSystemMessage,
      appendSystemMessageToAllRooms,
      emoteCatalogsRef,
      getTwitchHydration,
      syncedChannelsRef,
      updateRoom,
    ]
  )

  return {
    routeMessageToRoom,
    routeClearMsg,
    routeClearChat,
    routeSystemMessage,
    markChatMessageDeleted,
  }
}
