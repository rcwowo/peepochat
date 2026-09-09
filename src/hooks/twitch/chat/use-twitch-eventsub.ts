import * as React from "react"

import type { RoomStore } from "@/hooks/twitch/chat/use-room-store"
import type { TwitchAccount } from "@/lib/peepochat/peepochat-config"
import { normalizeChannelLogin } from "@/lib/twitch/channel/channel"
import type {
  TwitchAutomodHeldStatus,
  TwitchChatRoomState,
  TwitchSelfChatState,
  TwitchTimelineItem,
} from "@/lib/twitch/chat/types"
import {
  isAnonymousBanTimeoutSystemMessage,
  type TwitchSystemMessage,
} from "@/lib/twitch/chat/chat"
import {
  automodHeldTimelineId,
  createUserAutomodHeldNotice,
  createUserAutomodUpdateSystemMessage,
  parseAutomodHeldMessage,
  parseAutomodUpdateStatus,
  parseUserMessageHoldEvent,
  parseUserMessageUpdateEvent,
  userAutomodHeldNoticeId,
} from "@/lib/twitch/eventsub/automod"
import {
  fetchSharedChatSession,
  fetchTwitchUsersById,
  type TwitchUser,
} from "@/lib/twitch/auth/api"
import {
  formatSharedChatEndedNotice,
  formatSharedChatParticipantsNotice,
  sharedChatNoticeId,
  sharedChatParticipantKey,
  sharedChatSessionsEqual,
  type SharedChatSession,
  type SharedChatSourceProfile,
} from "@/lib/chat/shared-chat/shared-chat"
import {
  getSharedChatSourceProfile,
  upsertSharedChatSourceProfiles,
} from "@/lib/chat/shared-chat/profiles"
import {
  createSystemMessageFromChannelModerate,
  parseChannelModerateAction,
} from "@/lib/twitch/eventsub/moderate"
import type { SelfModerationRestriction } from "@/lib/chat/send/send-notice"
import { extractModerateTargetNames } from "@/lib/twitch/eventsub/parse"
import {
  createSystemMessageFromSuspiciousUserUpdate,
  parseSuspiciousUserMessage,
} from "@/lib/twitch/eventsub/suspicious"
import { buildDesiredEventSubSubscriptions } from "@/lib/twitch/eventsub/subscriptions"
import {
  getTwitchEventSubClient,
  type TwitchEventSubNotification,
} from "@/lib/twitch/eventsub/eventsub"
import type { TwitchSuspiciousUserMessage } from "@/lib/twitch/chat/types"

type UseTwitchEventSubOptions = {
  account: TwitchAccount | null
  roomStore: RoomStore
  syncedChannelsRef: React.RefObject<string[]>
  selfStatesRef: React.RefObject<Map<string, TwitchSelfChatState>>
  onTimelineItems?: (login: string, items: TwitchTimelineItem[]) => void
  onAuthFailure?: (reason: "expired" | "scopes") => void
  pushComposerNotice?: (notice: {
    channel: string
    message: string
    id: string
    discardPending?: boolean
  }) => void
  dismissComposerNotice?: (notice: { channel: string; id: string }) => void
  applySelfModerationRestriction?: (
    channel: string,
    restriction: SelfModerationRestriction
  ) => void
  trimRoomTimeline: (timeline: TwitchTimelineItem[]) => TwitchTimelineItem[]
  showSuspiciousActivityRef: React.RefObject<boolean>
  hideBlockedUsersRef: React.RefObject<boolean>
  isUserBlockedRef: React.RefObject<
    (userId?: string | null, login?: string | null) => boolean
  >
  visibleChannelsRef: React.RefObject<string[]>
}

const SHARED_CHAT_POLL_INTERVAL_MS = 60_000
const SHARED_CHAT_POLL_STAGGER_MS = 750

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
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
}: {
  account: TwitchAccount
  syncedChannels: readonly string[]
  rooms: Record<string, TwitchChatRoomState>
  selfStates: Map<string, TwitchSelfChatState>
  showSuspiciousActivity: boolean
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
  return `${account.id}::${account.accessToken}::${scopesPart}::${showSuspiciousActivity ? "1" : "0"}::${channelPart}`
}

export function useTwitchEventSub({
  account,
  roomStore,
  syncedChannelsRef,
  selfStatesRef,
  onTimelineItems,
  onAuthFailure,
  pushComposerNotice,
  dismissComposerNotice,
  applySelfModerationRestriction,
  trimRoomTimeline,
  showSuspiciousActivityRef,
  hideBlockedUsersRef,
  isUserBlockedRef,
  visibleChannelsRef,
}: UseTwitchEventSubOptions) {
  const { roomsRef, updateRoom, subscribeToRoomIds, getRoomIdsKey } = roomStore
  const client = React.useMemo(() => getTwitchEventSubClient(), [])
  const accountRef = React.useRef(account)
  const onAuthFailureRef = React.useRef(onAuthFailure)
  const pushComposerNoticeRef = React.useRef(pushComposerNotice)
  const dismissComposerNoticeRef = React.useRef(dismissComposerNotice)
  const applySelfModerationRestrictionRef = React.useRef(
    applySelfModerationRestriction
  )
  const trimRoomTimelineRef = React.useRef(trimRoomTimeline)
  const onTimelineItemsRef = React.useRef(onTimelineItems)
  React.useLayoutEffect(() => {
    onTimelineItemsRef.current = onTimelineItems
  }, [onTimelineItems])
  const lastSyncKeyRef = React.useRef("")
  const sharedChatPollInFlightRef = React.useRef(false)
  const sharedChatPollQueuedRef = React.useRef(false)
  const sharedChatStateRef = React.useRef(
    new Map<string, SharedChatSession | null>()
  )
  const sourceProfileFetchesRef = React.useRef(new Set<string>())
  const sourceProfilesResolvedRef = React.useRef(new Set<string>())
  const roomIdsKey = React.useSyncExternalStore(
    subscribeToRoomIds,
    getRoomIdsKey,
    getRoomIdsKey
  )

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
    applySelfModerationRestrictionRef.current = applySelfModerationRestriction
  }, [applySelfModerationRestriction])

  React.useLayoutEffect(() => {
    trimRoomTimelineRef.current = trimRoomTimeline
  }, [trimRoomTimeline])

  const rememberSourceProfiles = React.useCallback(
    (profiles: SharedChatSourceProfile[]) => {
      upsertSharedChatSourceProfiles(profiles)
    },
    []
  )

  const rememberUsersAsSourceProfiles = React.useCallback(
    (users: TwitchUser[]) => {
      rememberSourceProfiles(
        users.map((user) => ({
          userId: user.id,
          login: user.login,
          displayName: user.displayName,
          profileImageUrl: user.profileImageUrl,
        }))
      )
    },
    [rememberSourceProfiles]
  )

  const ensureSharedChatSourceProfiles = React.useCallback(
    (ids: Array<string | null | undefined>) => {
      const currentAccount = accountRef.current
      if (!currentAccount) {
        return
      }

      const missing = [
        ...new Set(
          ids.flatMap((id) => {
            const trimmed = id?.trim() ?? ""
            if (!trimmed) {
              return []
            }
            if (getSharedChatSourceProfile(trimmed)?.profileImageUrl) {
              return []
            }
            if (sourceProfilesResolvedRef.current.has(trimmed)) {
              return []
            }
            if (sourceProfileFetchesRef.current.has(trimmed)) {
              return []
            }
            return [trimmed]
          })
        ),
      ]

      if (missing.length === 0) {
        return
      }

      for (const id of missing) {
        sourceProfileFetchesRef.current.add(id)
      }

      void fetchTwitchUsersById(
        missing,
        currentAccount.accessToken,
        currentAccount.clientId
      )
        .then((users) => {
          rememberUsersAsSourceProfiles(users)
          for (const id of missing) {
            sourceProfilesResolvedRef.current.add(id)
          }
        })
        .catch(() => undefined)
        .finally(() => {
          for (const id of missing) {
            sourceProfileFetchesRef.current.delete(id)
          }
        })
    },
    [rememberUsersAsSourceProfiles]
  )

  const applySharedChatSession = React.useCallback(
    (
      channelLogin: string,
      session: SharedChatSession | null,
      kind: "join" | "update" | "end"
    ) => {
      const login = normalizeChannelLogin(channelLogin)
      if (!login || !syncedChannelsRef.current.includes(login)) {
        return
      }

      if (session) {
        rememberSourceProfiles(
          session.participants.map((participant) => ({
            ...participant,
            profileImageUrl:
              getSharedChatSourceProfile(participant.userId)?.profileImageUrl ??
              "",
          }))
        )
        ensureSharedChatSourceProfiles(
          session.participants.map((participant) => participant.userId)
        )
      }

      const previous = sharedChatStateRef.current.get(login) ?? null
      if (
        kind !== "join" &&
        kind !== "end" &&
        sharedChatSessionsEqual(previous, session)
      ) {
        sharedChatStateRef.current.set(login, session)
        return
      }

      sharedChatStateRef.current.set(login, session)

      if (!session) {
        if (kind === "end" && previous) {
          pushComposerNoticeRef.current?.({
            channel: login,
            message: formatSharedChatEndedNotice(),
            id: sharedChatNoticeId(login, `${previous.sessionId}:end`),
          })
        }
        return
      }

      const roomId = roomsRef.current[login]?.roomId?.trim() || null
      const variant = kind === "join" ? "active" : "now"
      const message = formatSharedChatParticipantsNotice(
        session.participants,
        roomId,
        variant
      )
      if (!message) {
        return
      }

      const suffix =
        kind === "update"
          ? `${session.sessionId}:${sharedChatParticipantKey(session.participants)}`
          : session.sessionId

      pushComposerNoticeRef.current?.({
        channel: login,
        message,
        id: sharedChatNoticeId(login, suffix),
      })
    },
    [
      ensureSharedChatSourceProfiles,
      rememberSourceProfiles,
      roomsRef,
      syncedChannelsRef,
    ]
  )

  const loadSharedChatSession = React.useCallback(
    async (channelLogin: string, roomId: string, kind: "join" | "refresh") => {
      const login = normalizeChannelLogin(channelLogin)
      const broadcasterId = roomId.trim()
      const currentAccount = accountRef.current
      if (!login || !broadcasterId || !currentAccount) {
        return
      }

      try {
        const raw = await fetchSharedChatSession(
          broadcasterId,
          currentAccount.accessToken,
          currentAccount.clientId
        )
        if (!syncedChannelsRef.current.includes(login)) {
          return
        }

        if (!raw) {
          if (kind === "join") {
            if (!sharedChatStateRef.current.get(login)) {
              sharedChatStateRef.current.set(login, null)
            }
            return
          }
          applySharedChatSession(login, null, "end")
          return
        }

        const participantIds = raw.participants.map(
          (participant) => participant.broadcasterId
        )

        const missingIds = [
          ...new Set(
            participantIds.filter((id) => {
              if (getSharedChatSourceProfile(id)?.profileImageUrl) return false
              if (sourceProfilesResolvedRef.current.has(id)) return false
              if (sourceProfileFetchesRef.current.has(id)) return false
              return true
            })
          ),
        ]
        const usersById = new Map<string, TwitchUser>()
        if (missingIds.length > 0) {
          for (const id of missingIds) {
            sourceProfileFetchesRef.current.add(id)
          }
          let users: TwitchUser[] | null = null
          try {
            users = await fetchTwitchUsersById(
              missingIds,
              currentAccount.accessToken,
              currentAccount.clientId
            )
          } catch {
            users = null
          } finally {
            for (const id of missingIds) {
              sourceProfileFetchesRef.current.delete(id)
            }
          }
          if (users) {
            rememberUsersAsSourceProfiles(users)
            for (const user of users) {
              usersById.set(user.id, user)
            }
            for (const id of missingIds) {
              sourceProfilesResolvedRef.current.add(id)
            }
          }
        }
        if (!syncedChannelsRef.current.includes(login)) {
          return
        }

        applySharedChatSession(
          login,
          {
            sessionId: raw.sessionId,
            hostUserId: raw.hostBroadcasterId,
            participants: participantIds.map((id) => {
              const user = usersById.get(id)
              const cached = getSharedChatSourceProfile(id)
              return {
                userId: id,
                login: user?.login || cached?.login || "",
                displayName:
                  user?.displayName || cached?.displayName || user?.login || id,
              }
            }),
          },
          kind === "join" ? "join" : "update"
        )
      } catch {
        return
      }
    },
    [applySharedChatSession, rememberUsersAsSourceProfiles, syncedChannelsRef]
  )

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
    for (const login of sharedChatStateRef.current.keys()) {
      if (!syncedLoginSet.has(login)) {
        sharedChatStateRef.current.delete(login)
      }
    }

    client.setDesiredSubscriptions(
      buildDesiredEventSubSubscriptions({
        account: currentAccount,
        channels,
        selfStates: selfStatesRef.current,
        showSuspiciousActivity: showSuspiciousActivityRef.current,
      })
    )
  }, [
    client,
    roomsRef,
    selfStatesRef,
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
      onTimelineItemsRef.current?.(channelLogin, [{ kind: "system", message }])
    },
    [updateRoom]
  )

  const appendSystemMessageRef = React.useRef(appendSystemMessage)
  React.useLayoutEffect(() => {
    appendSystemMessageRef.current = appendSystemMessage
  }, [appendSystemMessage])

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
      onTimelineItemsRef.current?.(channelLogin, [
        { kind: "automod", message: held },
      ])
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
      onTimelineItemsRef.current?.(channelLogin, [
        { kind: "suspicious", message },
      ])
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
          const parsed = parseChannelModerateAction({
            event: notification.event,
            channelLogin,
            messageTimestamp: notification.messageTimestamp,
          })
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

          const accountId = accountRef.current?.id
          const accountLogin = accountRef.current?.login
          if (parsed && (accountId || accountLogin)) {
            const isSelfTarget =
              (parsed.targetUserId &&
                accountId &&
                parsed.targetUserId === accountId) ||
              (accountLogin &&
                normalizeChannelLogin(parsed.targetUserName) ===
                  normalizeChannelLogin(accountLogin))
            if (isSelfTarget) {
              if (
                parsed.kind === "timeout" &&
                parsed.banDurationSeconds &&
                parsed.banDurationSeconds > 0
              ) {
                applySelfModerationRestrictionRef.current?.(channelLogin, {
                  kind: "timeout",
                  durationSeconds: parsed.banDurationSeconds,
                })
              } else if (parsed.kind === "ban") {
                applySelfModerationRestrictionRef.current?.(channelLogin, {
                  kind: "ban",
                })
              } else if (
                parsed.kind === "untimeout" ||
                parsed.kind === "unban"
              ) {
                applySelfModerationRestrictionRef.current?.(channelLogin, {
                  kind: "clear",
                })
              }
            }
          }
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
    client,
    hideBlockedUsersRef,
    isUserBlockedRef,
    roomsRef,
    showSuspiciousActivityRef,
    syncedChannelsRef,
  ])

  React.useEffect(() => {
    syncDesiredSubscriptions()
  }, [account, roomIdsKey, syncDesiredSubscriptions])

  React.useEffect(() => {
    client.retain()
    const sharedChatState = sharedChatStateRef.current
    return () => {
      lastSyncKeyRef.current = ""
      sharedChatState.clear()
      client.release()
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

  const notifySuspiciousSettingChanged = React.useCallback(() => {
    lastSyncKeyRef.current = ""
    syncDesiredSubscriptions()
  }, [syncDesiredSubscriptions])

  const notifyRoomReady = React.useCallback(
    (login: string, roomId: string) => {
      void loadSharedChatSession(login, roomId, "join")
    },
    [loadSharedChatSession]
  )

  const refreshVisibleSharedChatSessions = React.useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) {
      return
    }
    if (sharedChatPollInFlightRef.current) {
      sharedChatPollQueuedRef.current = true
      return
    }
    const currentAccount = accountRef.current
    if (!currentAccount) {
      return
    }

    sharedChatPollInFlightRef.current = true
    try {
      const visible = visibleChannelsRef.current ?? []
      let refreshed = false
      for (const login of visible) {
        const normalized = normalizeChannelLogin(login)
        const roomId = roomsRef.current[normalized]?.roomId?.trim()
        if (!normalized || !roomId) {
          continue
        }
        if (!syncedChannelsRef.current.includes(normalized)) {
          continue
        }
        if (refreshed) {
          await sleep(SHARED_CHAT_POLL_STAGGER_MS)
        }
        refreshed = true
        await loadSharedChatSession(normalized, roomId, "refresh")
      }
    } finally {
      sharedChatPollInFlightRef.current = false
      if (sharedChatPollQueuedRef.current) {
        sharedChatPollQueuedRef.current = false
        void refreshVisibleSharedChatSessions()
      }
    }
  }, [loadSharedChatSession, roomsRef, syncedChannelsRef, visibleChannelsRef])

  React.useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshVisibleSharedChatSessions()
    }, SHARED_CHAT_POLL_INTERVAL_MS)
    const onVisibilityChange = () => {
      if (!document.hidden) {
        void refreshVisibleSharedChatSessions()
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [refreshVisibleSharedChatSessions])

  const notifyVisibleChannelsChanged = React.useCallback(() => {
    void refreshVisibleSharedChatSessions()
  }, [refreshVisibleSharedChatSessions])

  return {
    notifySelfStateChanged,
    notifyChannelsChanged,
    notifySuspiciousSettingChanged,
    notifyRoomReady,
    notifyVisibleChannelsChanged,
    ensureSharedChatSourceProfiles,
  }
}
