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
import { fetchChannelsByBroadcasterId } from "@/lib/twitch/twitch-api"
import {
  createChannelUpdateSystemMessages,
  parseChannelUpdateEvent,
  type ChannelUpdateSnapshot,
} from "@/lib/twitch/twitch-eventsub-channel-update"
import { createSystemMessageFromChannelModerate } from "@/lib/twitch/twitch-eventsub-moderate"
import { extractModerateTargetNames } from "@/lib/twitch/twitch-eventsub-parse"
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
  showChannelUpdatesRef: React.RefObject<boolean>
  hideBlockedUsersRef: React.RefObject<boolean>
  isUserBlockedRef: React.RefObject<
    (userId?: string | null, login?: string | null) => boolean
  >
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
  showSuspiciousActivity,
  showChannelUpdates,
}: {
  account: TwitchAccount
  syncedChannels: readonly string[]
  rooms: RoomStore["rooms"]
  selfStates: Map<string, TwitchSelfChatState>
  showSuspiciousActivity: boolean
  showChannelUpdates: boolean
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

  const scopesPart = [...account.scopes].sort().join(" ")
  return `${account.id}::${account.accessToken}::${scopesPart}::${showSuspiciousActivity ? "1" : "0"}::${showChannelUpdates ? "1" : "0"}::${channelPart}`
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
  showChannelUpdatesRef,
  hideBlockedUsersRef,
  isUserBlockedRef,
}: UseTwitchEventSubOptions) {
  const { rooms, roomsRef, updateRoom } = roomStore
  const client = React.useMemo(() => getTwitchEventSubClient(), [])
  const accountRef = React.useRef(account)
  const onAuthFailureRef = React.useRef(onAuthFailure)
  const pushComposerNoticeRef = React.useRef(pushComposerNotice)
  const dismissComposerNoticeRef = React.useRef(dismissComposerNotice)
  const trimRoomTimelineRef = React.useRef(trimRoomTimeline)
  const lastSyncKeyRef = React.useRef("")
  const channelUpdateStateRef = React.useRef(
    new Map<string, ChannelUpdateSnapshot>()
  )
  const channelUpdatePendingRef = React.useRef(
    new Map<
      string,
      Array<{
        snapshot: ChannelUpdateSnapshot
        roomId: string | null
        messageId: string | null
        messageTimestamp: string | null
      }>
    >()
  )
  const channelUpdateSeedKeyRef = React.useRef("")
  const roomIdsKey = Object.keys(rooms)
    .sort()
    .map((login) => `${login}:${rooms[login]?.roomId?.trim() ?? ""}`)
    .join("|")

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
      showSuspiciousActivity: showSuspiciousActivityRef.current,
      showChannelUpdates: showChannelUpdatesRef.current,
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

    const syncedLoginSet = new Set(channels.map((channel) => channel.login))
    for (const login of channelUpdateStateRef.current.keys()) {
      if (!syncedLoginSet.has(login)) {
        channelUpdateStateRef.current.delete(login)
      }
    }
    for (const login of channelUpdatePendingRef.current.keys()) {
      if (!syncedLoginSet.has(login)) {
        channelUpdatePendingRef.current.delete(login)
      }
    }

    client.setDesiredSubscriptions(
      buildDesiredEventSubSubscriptions({
        account: currentAccount,
        channels,
        selfStates: selfStatesRef.current,
        showSuspiciousActivity: showSuspiciousActivityRef.current,
        showChannelUpdates: showChannelUpdatesRef.current,
      })
    )
  }, [
    client,
    roomsRef,
    selfStatesRef,
    showChannelUpdatesRef,
    showSuspiciousActivityRef,
    syncedChannelsRef,
  ])

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

  const applyChannelUpdateSnapshot = React.useCallback(
    (
      channelLogin: string,
      nextSnapshot: ChannelUpdateSnapshot,
      meta: {
        roomId: string | null
        messageId: string | null
        messageTimestamp: string | null
      }
    ) => {
      const previous = channelUpdateStateRef.current.get(channelLogin) ?? null
      channelUpdateStateRef.current.set(channelLogin, nextSnapshot)

      const messages = createChannelUpdateSystemMessages({
        channelLogin,
        roomId: meta.roomId,
        messageId: meta.messageId,
        messageTimestamp: meta.messageTimestamp,
        previous,
        next: nextSnapshot,
      })
      for (const message of messages) {
        appendSystemMessageRef.current(channelLogin, message)
      }
    },
    []
  )

  const flushPendingChannelUpdates = React.useCallback(
    (channelLogin: string) => {
      const pending = channelUpdatePendingRef.current.get(channelLogin)
      if (!pending || pending.length === 0) {
        return
      }
      channelUpdatePendingRef.current.delete(channelLogin)
      for (const entry of pending) {
        applyChannelUpdateSnapshot(channelLogin, entry.snapshot, entry)
      }
    },
    [applyChannelUpdateSnapshot]
  )

  const seedChannelUpdateBaselines = React.useCallback(async () => {
    const currentAccount = accountRef.current
    if (!currentAccount || !showChannelUpdatesRef.current) {
      channelUpdateSeedKeyRef.current = ""
      return
    }

    const syncedChannels = syncedChannelsRef.current
    const targets = syncedChannels.flatMap((login) => {
      const roomId = roomsRef.current[login]?.roomId?.trim()
      if (!roomId) return []
      return [{ login, roomId }]
    })

    const seedKey = `${currentAccount.id}::${targets
      .map((target) => `${target.login}:${target.roomId}`)
      .join("|")}`
    if (seedKey === channelUpdateSeedKeyRef.current) {
      return
    }
    channelUpdateSeedKeyRef.current = seedKey

    const missing = targets.filter(
      (target) => !channelUpdateStateRef.current.has(target.login)
    )
    if (missing.length === 0) {
      for (const target of targets) {
        flushPendingChannelUpdates(target.login)
      }
      return
    }

    try {
      const channels = await fetchChannelsByBroadcasterId(
        missing.map((target) => target.roomId),
        currentAccount.accessToken,
        currentAccount.clientId
      )
      if (channelUpdateSeedKeyRef.current !== seedKey) {
        return
      }

      const seededLogins = new Set<string>()
      for (const channel of channels) {
        const login = normalizeChannelLogin(channel.broadcasterLogin)
        if (!login || channelUpdateStateRef.current.has(login)) {
          continue
        }
        channelUpdateStateRef.current.set(login, {
          title: channel.title,
          categoryName: channel.gameName,
        })
        seededLogins.add(login)
      }

      for (const login of seededLogins) {
        flushPendingChannelUpdates(login)
      }

      for (const target of missing) {
        if (channelUpdateStateRef.current.has(target.login)) {
          continue
        }
        const pending = channelUpdatePendingRef.current.get(target.login)
        if (!pending || pending.length === 0) {
          continue
        }
        channelUpdatePendingRef.current.delete(target.login)
        for (const entry of pending) {
          channelUpdateStateRef.current.set(target.login, entry.snapshot)
        }
      }
    } catch {
      if (channelUpdateSeedKeyRef.current === seedKey) {
        channelUpdateSeedKeyRef.current = ""
      }
    }
  }, [
    flushPendingChannelUpdates,
    roomsRef,
    showChannelUpdatesRef,
    syncedChannelsRef,
  ])

  const upsertAutomodHeldMessage = React.useCallback(
    (
      channelLogin: string,
      held: ReturnType<typeof parseAutomodHeldMessage>
    ) => {
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
        if (
          existing?.kind !== "automod" ||
          existing.message.status !== "pending"
        ) {
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

          const existingMessage =
            existing.kind === "chat" || existing.kind === "suspicious"
              ? existing.message
              : null
          if (!existingMessage) return room

          let nextMessage = message
          if (existingMessage.color && !message.color) {
            nextMessage = { ...nextMessage, color: existingMessage.color }
          }
          if (existingMessage.deletedAt) {
            nextMessage = {
              ...nextMessage,
              deletedAt: existingMessage.deletedAt,
            }
          }

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

        if (type === "channel.update") {
          if (!showChannelUpdatesRef.current) {
            return
          }

          const parsed = parseChannelUpdateEvent(notification.event)
          if (!parsed) return

          const channelLogin = resolveChannelLogin(
            notification,
            parsed.channelLogin
          )
          if (
            !channelLogin ||
            !syncedChannelsRef.current.includes(channelLogin)
          ) {
            return
          }

          const nextSnapshot: ChannelUpdateSnapshot = {
            title: parsed.title,
            categoryName: parsed.categoryName,
          }
          const roomId =
            roomsRef.current[channelLogin]?.roomId ?? parsed.broadcasterUserId
          const meta = {
            snapshot: nextSnapshot,
            roomId,
            messageId: notification.messageId,
            messageTimestamp: notification.messageTimestamp,
          }

          if (!channelUpdateStateRef.current.has(channelLogin)) {
            const pending =
              channelUpdatePendingRef.current.get(channelLogin) ?? []
            pending.push(meta)
            channelUpdatePendingRef.current.set(channelLogin, pending)
            return
          }

          applyChannelUpdateSnapshot(channelLogin, nextSnapshot, meta)
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

          if (
            hideBlockedUsersRef.current &&
            isUserBlockedRef.current(message.userId, message.userName)
          ) {
            return
          }

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
  }, [
    applyChannelUpdateSnapshot,
    client,
    hideBlockedUsersRef,
    isUserBlockedRef,
    roomsRef,
    showChannelUpdatesRef,
    showSuspiciousActivityRef,
    syncedChannelsRef,
  ])

  React.useEffect(() => {
    syncDesiredSubscriptions()
    void seedChannelUpdateBaselines()
  }, [
    account,
    roomIdsKey,
    seedChannelUpdateBaselines,
    syncDesiredSubscriptions,
  ])

  React.useEffect(() => {
    const channelUpdateState = channelUpdateStateRef.current
    const channelUpdatePending = channelUpdatePendingRef.current
    return () => {
      lastSyncKeyRef.current = ""
      channelUpdateSeedKeyRef.current = ""
      channelUpdateState.clear()
      channelUpdatePending.clear()
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
    void seedChannelUpdateBaselines()
  }, [seedChannelUpdateBaselines, syncDesiredSubscriptions])

  const notifySuspiciousSettingChanged = React.useCallback(() => {
    lastSyncKeyRef.current = ""
    syncDesiredSubscriptions()
  }, [syncDesiredSubscriptions])

  const notifyChannelUpdatesSettingChanged = React.useCallback(() => {
    lastSyncKeyRef.current = ""
    if (!showChannelUpdatesRef.current) {
      channelUpdateSeedKeyRef.current = ""
      channelUpdateStateRef.current.clear()
      channelUpdatePendingRef.current.clear()
    }
    syncDesiredSubscriptions()
    void seedChannelUpdateBaselines()
  }, [
    seedChannelUpdateBaselines,
    showChannelUpdatesRef,
    syncDesiredSubscriptions,
  ])

  const hasEnabledModActionSubscription = React.useCallback(
    (channelLogin: string) =>
      client.hasEnabledModActionSubscription(channelLogin),
    [client]
  )

  return {
    notifySelfStateChanged,
    notifyChannelsChanged,
    notifySuspiciousSettingChanged,
    notifyChannelUpdatesSettingChanged,
    hasEnabledModActionSubscription,
  }
}
