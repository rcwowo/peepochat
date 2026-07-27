import * as React from "react"

import type { RoomStore } from "@/hooks/twitch/chat/use-room-store"
import type { TwitchAccount } from "@/lib/peepochat/peepochat-config"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import type {
  TwitchAutomodHeldStatus,
  TwitchSelfChatState,
  TwitchTimelineItem,
} from "@/lib/twitch/twitch-chat-types"
import {
  isAnonymousBanTimeoutSystemMessage,
  type TwitchSystemMessage,
} from "@/lib/twitch/twitch-chat"
import {
  automodHeldTimelineId,
  createUserAutomodHeldNotice,
  createUserAutomodUpdateSystemMessage,
  parseAutomodHeldMessage,
  parseAutomodUpdateStatus,
  parseUserMessageHoldEvent,
  parseUserMessageUpdateEvent,
  userAutomodHeldNoticeId,
} from "@/lib/twitch/twitch-eventsub-automod"
import { createSystemMessageFromChannelModerate } from "@/lib/twitch/twitch-eventsub-moderate"
import {
  createSystemMessageFromSuspiciousUserUpdate,
  parseSuspiciousUserMessage,
} from "@/lib/twitch/twitch-eventsub-suspicious"
import { buildDesiredEventSubSubscriptions } from "@/lib/twitch/twitch-eventsub-subscriptions"
import {
  getTwitchEventSubClient,
  type TwitchEventSubNotification,
} from "@/lib/twitch/twitch-eventsub"
import type { TwitchSuspiciousUserMessage } from "@/lib/twitch/twitch-chat-types"

type UseTwitchEventSubOptions = {
  account: TwitchAccount | null
  roomStore: RoomStore
  syncedChannelsRef: React.RefObject<string[]>
  selfStatesRef: React.RefObject<Map<string, TwitchSelfChatState>>
  onAuthFailure?: (reason: "expired" | "scopes") => void
  pushComposerNotice?: (notice: {
    channel: string
    message: string
    id: string
    discardPending?: boolean
  }) => void
  dismissComposerNotice?: (notice: { channel: string; id: string }) => void
  trimRoomTimeline: (timeline: TwitchTimelineItem[]) => TwitchTimelineItem[]
  showSuspiciousActivityRef: React.RefObject<boolean>
}

function extractModerateTargetNames(event: Record<string, unknown>): string[] {
  const action = typeof event.action === "string" ? event.action : ""
  if (!action) return []
  const target = event[action]
  if (typeof target !== "object" || target === null || Array.isArray(target)) {
    return []
  }
  const record = target as Record<string, unknown>
  const names = [record.user_login, record.user_name]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
  return [...new Set(names)]
}

function resolveChannelLogin(
  notification: TwitchEventSubNotification,
  fallbackLogin: string | null
): string {
  return (
    notification.channelLogin ||
    normalizeChannelLogin(
      typeof notification.event.broadcaster_user_login === "string"
        ? notification.event.broadcaster_user_login
        : fallbackLogin || ""
    )
  )
}

function buildSyncKey({
  account,
  syncedChannels,
  rooms,
  selfStates,
}: {
  account: TwitchAccount
  syncedChannels: readonly string[]
  rooms: RoomStore["rooms"]
  selfStates: Map<string, TwitchSelfChatState>
}): string {
  const channelPart = syncedChannels
    .map((login) => {
      const roomId = rooms[login]?.roomId?.trim() ?? ""
      const state = selfStates.get(login)
      return [
        login,
        roomId,
        state?.isModerator ? "1" : "0",
        state?.isBroadcaster ? "1" : "0",
      ].join(":")
    })
    .join("|")

  return `${account.id}::${account.accessToken}::${channelPart}`
}

export function useTwitchEventSub({
  account,
  roomStore,
  syncedChannelsRef,
  selfStatesRef,
  onAuthFailure,
  pushComposerNotice,
  dismissComposerNotice,
  trimRoomTimeline,
  showSuspiciousActivityRef,
}: UseTwitchEventSubOptions) {
  const { rooms, roomsRef, updateRoom } = roomStore
  const client = React.useMemo(() => getTwitchEventSubClient(), [])
  const accountRef = React.useRef(account)
  const onAuthFailureRef = React.useRef(onAuthFailure)
  const pushComposerNoticeRef = React.useRef(pushComposerNotice)
  const dismissComposerNoticeRef = React.useRef(dismissComposerNotice)
  const trimRoomTimelineRef = React.useRef(trimRoomTimeline)
  const lastSyncKeyRef = React.useRef("")

  React.useLayoutEffect(() => {
    accountRef.current = account
  }, [account])

  React.useLayoutEffect(() => {
    onAuthFailureRef.current = onAuthFailure
  }, [onAuthFailure])

  React.useLayoutEffect(() => {
    pushComposerNoticeRef.current = pushComposerNotice
  }, [pushComposerNotice])

  React.useLayoutEffect(() => {
    dismissComposerNoticeRef.current = dismissComposerNotice
  }, [dismissComposerNotice])

  React.useLayoutEffect(() => {
    trimRoomTimelineRef.current = trimRoomTimeline
  }, [trimRoomTimeline])

  const syncDesiredSubscriptions = React.useCallback(() => {
    const currentAccount = accountRef.current
    if (!currentAccount) {
      lastSyncKeyRef.current = ""
      client.setAuth(null)
      client.setDesiredSubscriptions([])
      return
    }

    const syncedChannels = syncedChannelsRef.current
    const syncKey = buildSyncKey({
      account: currentAccount,
      syncedChannels,
      rooms: roomsRef.current,
      selfStates: selfStatesRef.current,
    })

    if (syncKey === lastSyncKeyRef.current) {
      return
    }
    lastSyncKeyRef.current = syncKey

    client.setAuth({
      accessToken: currentAccount.accessToken,
      clientId: currentAccount.clientId,
      userId: currentAccount.id,
      onAuthFailure: (reason) => {
        onAuthFailureRef.current?.(reason)
      },
    })

    const channels = syncedChannels.flatMap((login) => {
      const roomId = roomsRef.current[login]?.roomId?.trim()
      if (!roomId) return []
      return [{ login, roomId }]
    })

    client.setDesiredSubscriptions(
      buildDesiredEventSubSubscriptions({
        account: currentAccount,
        channels,
        selfStates: selfStatesRef.current,
      })
    )
  }, [client, roomsRef, selfStatesRef, syncedChannelsRef])

  const appendSystemMessage = React.useCallback(
    (
      channelLogin: string,
      message: TwitchSystemMessage,
      options?: { replaceAnonymousTargets?: string[] }
    ) => {
      const targetNames = options?.replaceAnonymousTargets ?? []
      updateRoom(channelLogin, (room) => {
        const withoutAnonymous =
          targetNames.length === 0
            ? room.timeline
            : room.timeline.filter((entry) => {
                if (entry.kind !== "system") return true
                return !targetNames.some((name) =>
                  isAnonymousBanTimeoutSystemMessage(entry.message, name)
                )
              })

        if (
          withoutAnonymous.some(
            (entry) =>
              (entry.kind === "system" || entry.kind === "automod") &&
              entry.message.id === message.id
          )
        ) {
          if (withoutAnonymous === room.timeline) {
            return room
          }
          return { ...room, timeline: withoutAnonymous }
        }

        return {
          ...room,
          timeline: trimRoomTimelineRef.current([
            ...withoutAnonymous,
            { kind: "system" as const, message },
          ]),
        }
      })
    },
    [updateRoom]
  )

  const appendSystemMessageRef = React.useRef(appendSystemMessage)
  React.useLayoutEffect(() => {
    appendSystemMessageRef.current = appendSystemMessage
  }, [appendSystemMessage])

  const upsertAutomodHeldMessage = React.useCallback(
    (channelLogin: string, held: ReturnType<typeof parseAutomodHeldMessage>) => {
      if (!held) return
      updateRoom(channelLogin, (room) => {
        const existingIndex = room.timeline.findIndex(
          (entry) => entry.kind === "automod" && entry.message.id === held.id
        )
        if (existingIndex >= 0) {
          const existing = room.timeline[existingIndex]
          if (existing?.kind !== "automod") return room
          if (existing.message.status !== "pending") {
            return room
          }
          const next = room.timeline.slice()
          next[existingIndex] = { kind: "automod", message: held }
          return { ...room, timeline: trimRoomTimelineRef.current(next) }
        }

        return {
          ...room,
          timeline: trimRoomTimelineRef.current([
            ...room.timeline,
            { kind: "automod" as const, message: held },
          ]),
        }
      })
    },
    [updateRoom]
  )

  const resolveAutomodHeldMessageStatus = React.useCallback(
    (
      channelLogin: string,
      messageId: string,
      status: TwitchAutomodHeldStatus
    ) => {
      const timelineId = automodHeldTimelineId(channelLogin, messageId)
      updateRoom(channelLogin, (room) => {
        const existingIndex = room.timeline.findIndex(
          (entry) => entry.kind === "automod" && entry.message.id === timelineId
        )
        if (existingIndex < 0) {
          return room
        }

        const existing = room.timeline[existingIndex]
        if (existing?.kind !== "automod" || existing.message.status !== "pending") {
          return room
        }

        const next = room.timeline.slice()
        next[existingIndex] = {
          kind: "automod",
          message: { ...existing.message, status },
        }
        return { ...room, timeline: next }
      })
    },
    [updateRoom]
  )

  const removeAutomodHeldMessage = React.useCallback(
    (channelLogin: string, messageId: string) => {
      const timelineId = automodHeldTimelineId(channelLogin, messageId)
      updateRoom(channelLogin, (room) => {
        const next = room.timeline.filter(
          (entry) =>
            !(entry.kind === "automod" && entry.message.id === timelineId)
        )
        if (next.length === room.timeline.length) {
          return room
        }
        return { ...room, timeline: next }
      })
    },
    [updateRoom]
  )

  const upsertAutomodHeldMessageRef = React.useRef(upsertAutomodHeldMessage)
  const resolveAutomodHeldMessageStatusRef = React.useRef(
    resolveAutomodHeldMessageStatus
  )
  const removeAutomodHeldMessageRef = React.useRef(removeAutomodHeldMessage)
  React.useLayoutEffect(() => {
    upsertAutomodHeldMessageRef.current = upsertAutomodHeldMessage
    resolveAutomodHeldMessageStatusRef.current = resolveAutomodHeldMessageStatus
    removeAutomodHeldMessageRef.current = removeAutomodHeldMessage
  }, [
    removeAutomodHeldMessage,
    resolveAutomodHeldMessageStatus,
    upsertAutomodHeldMessage,
  ])

  const upsertSuspiciousUserMessage = React.useCallback(
    (channelLogin: string, message: TwitchSuspiciousUserMessage) => {
      updateRoom(channelLogin, (room) => {
        const existingIndex = room.timeline.findIndex(
          (entry) =>
            (entry.kind === "chat" || entry.kind === "suspicious") &&
            entry.message.id === message.id
        )

        if (existingIndex >= 0) {
          const existing = room.timeline[existingIndex]
          if (!existing) return room

          const color =
            existing.kind === "chat" || existing.kind === "suspicious"
              ? existing.message.color
              : null
          const nextMessage =
            color && !message.color ? { ...message, color } : message
          const next = room.timeline.slice()
          next[existingIndex] = { kind: "suspicious", message: nextMessage }
          return { ...room, timeline: next }
        }

        return {
          ...room,
          timeline: trimRoomTimelineRef.current([
            ...room.timeline,
            { kind: "suspicious" as const, message },
          ]),
        }
      })
    },
    [updateRoom]
  )

  const upsertSuspiciousUserMessageRef = React.useRef(
    upsertSuspiciousUserMessage
  )
  React.useLayoutEffect(() => {
    upsertSuspiciousUserMessageRef.current = upsertSuspiciousUserMessage
  }, [upsertSuspiciousUserMessage])

  React.useEffect(() => {
    client.setHandlers({
      onNotification: (notification: TwitchEventSubNotification) => {
        const type = notification.subscriptionType

        if (type === "channel.moderate") {
          const channelLogin = resolveChannelLogin(notification, null)
          if (
            !channelLogin ||
            !syncedChannelsRef.current.includes(channelLogin)
          ) {
            return
          }

          const roomId = roomsRef.current[channelLogin]?.roomId ?? null
          const message = createSystemMessageFromChannelModerate({
            event: notification.event,
            channelLogin,
            roomId,
            messageId: notification.messageId,
            messageTimestamp: notification.messageTimestamp,
          })
          if (!message) return

          appendSystemMessageRef.current(channelLogin, message, {
            replaceAnonymousTargets: extractModerateTargetNames(
              notification.event
            ),
          })
          return
        }

        if (type === "automod.message.hold") {
          const channelLogin = resolveChannelLogin(notification, null)
          if (
            !channelLogin ||
            !syncedChannelsRef.current.includes(channelLogin)
          ) {
            return
          }

          const roomId = roomsRef.current[channelLogin]?.roomId ?? null
          const held = parseAutomodHeldMessage({
            event: notification.event,
            channelLogin,
            roomId,
            status: "pending",
          })
          if (!held) return
          upsertAutomodHeldMessageRef.current(channelLogin, held)
          return
        }

        if (type === "automod.message.update") {
          const update = parseAutomodUpdateStatus(notification.event)
          if (!update) return

          const channelLogin = resolveChannelLogin(
            notification,
            update.channelLogin
          )
          if (
            !channelLogin ||
            !syncedChannelsRef.current.includes(channelLogin)
          ) {
            return
          }

          if (update.status === "expired") {
            resolveAutomodHeldMessageStatusRef.current(
              channelLogin,
              update.messageId,
              "expired"
            )
            return
          }

          removeAutomodHeldMessageRef.current(channelLogin, update.messageId)
          return
        }

        if (type === "channel.chat.user_message_hold") {
          const hold = parseUserMessageHoldEvent(notification.event)
          if (!hold) return

          const channelLogin = resolveChannelLogin(
            notification,
            hold.channelLogin
          )
          if (
            !channelLogin ||
            !syncedChannelsRef.current.includes(channelLogin)
          ) {
            return
          }

          const notice = createUserAutomodHeldNotice({
            channelLogin,
            messageId: hold.messageId,
          })
          if (!notice) return
          pushComposerNoticeRef.current?.({
            channel: channelLogin,
            message: notice.message,
            id: notice.id,
            discardPending: true,
          })
          return
        }

        if (type === "channel.chat.user_message_update") {
          const update = parseUserMessageUpdateEvent(notification.event)
          if (!update) return

          const channelLogin = resolveChannelLogin(
            notification,
            update.channelLogin
          )
          if (
            !channelLogin ||
            !syncedChannelsRef.current.includes(channelLogin)
          ) {
            return
          }

          const heldNoticeId = userAutomodHeldNoticeId(
            channelLogin,
            update.messageId
          )
          if (heldNoticeId) {
            dismissComposerNoticeRef.current?.({
              channel: channelLogin,
              id: heldNoticeId,
            })
          }

          const roomId =
            roomsRef.current[channelLogin]?.roomId ?? update.broadcasterUserId
          const message = createUserAutomodUpdateSystemMessage({
            channelLogin,
            roomId,
            messageId: update.messageId,
            status: update.status,
            receivedAt: notification.messageTimestamp,
          })
          if (!message) return
          appendSystemMessageRef.current(channelLogin, message)
          return
        }

        if (type === "channel.suspicious_user.message") {
          if (!showSuspiciousActivityRef.current) {
            return
          }

          const channelLogin = resolveChannelLogin(notification, null)
          if (
            !channelLogin ||
            !syncedChannelsRef.current.includes(channelLogin)
          ) {
            return
          }

          const roomId = roomsRef.current[channelLogin]?.roomId ?? null
          const message = parseSuspiciousUserMessage({
            event: notification.event,
            channelLogin,
            roomId,
            receivedAt: notification.messageTimestamp,
          })
          if (!message) return
          upsertSuspiciousUserMessageRef.current(channelLogin, message)
          return
        }

        if (type === "channel.suspicious_user.update") {
          if (!showSuspiciousActivityRef.current) {
            return
          }

          const channelLogin = resolveChannelLogin(notification, null)
          if (
            !channelLogin ||
            !syncedChannelsRef.current.includes(channelLogin)
          ) {
            return
          }

          const roomId = roomsRef.current[channelLogin]?.roomId ?? null
          const message = createSystemMessageFromSuspiciousUserUpdate({
            event: notification.event,
            channelLogin,
            roomId,
            messageId: notification.messageId,
            messageTimestamp: notification.messageTimestamp,
          })
          if (!message) return
          appendSystemMessageRef.current(channelLogin, message)
        }
      },
    })

    return () => {
      client.setHandlers({})
    }
  }, [client, roomsRef, showSuspiciousActivityRef, syncedChannelsRef])

  React.useEffect(() => {
    syncDesiredSubscriptions()
  }, [account, rooms, syncDesiredSubscriptions])

  React.useEffect(() => {
    return () => {
      lastSyncKeyRef.current = ""
      client.setDesiredSubscriptions([])
      client.setAuth(null)
    }
  }, [client])

  const notifySelfStateChanged = React.useCallback(() => {
    lastSyncKeyRef.current = ""
    syncDesiredSubscriptions()
  }, [syncDesiredSubscriptions])

  const notifyChannelsChanged = React.useCallback(() => {
    lastSyncKeyRef.current = ""
    syncDesiredSubscriptions()
  }, [syncDesiredSubscriptions])

  return {
    notifySelfStateChanged,
    notifyChannelsChanged,
  }
}
