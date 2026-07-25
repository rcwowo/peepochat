import * as React from "react"

import type { RoomStore } from "@/hooks/twitch/chat/use-room-store"
import type { TwitchAccount } from "@/lib/peepochat/peepochat-config"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import type { TwitchSelfChatState } from "@/lib/twitch/twitch-chat-types"
import {
  isAnonymousBanTimeoutSystemMessage,
  type TwitchSystemMessage,
} from "@/lib/twitch/twitch-chat"
import { createSystemMessageFromChannelModerate } from "@/lib/twitch/twitch-eventsub-moderate"
import { buildDesiredEventSubSubscriptions } from "@/lib/twitch/twitch-eventsub-subscriptions"
import {
  getTwitchEventSubClient,
  type TwitchEventSubNotification,
} from "@/lib/twitch/twitch-eventsub"

type UseTwitchEventSubOptions = {
  account: TwitchAccount | null
  roomStore: RoomStore
  syncedChannelsRef: React.RefObject<string[]>
  selfStatesRef: React.RefObject<Map<string, TwitchSelfChatState>>
  onAuthFailure?: (reason: "expired" | "scopes") => void
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
}: UseTwitchEventSubOptions) {
  const { rooms, roomsRef, updateRoom } = roomStore
  const client = React.useMemo(() => getTwitchEventSubClient(), [])
  const accountRef = React.useRef(account)
  const onAuthFailureRef = React.useRef(onAuthFailure)
  const lastSyncKeyRef = React.useRef("")

  React.useLayoutEffect(() => {
    accountRef.current = account
  }, [account])

  React.useLayoutEffect(() => {
    onAuthFailureRef.current = onAuthFailure
  }, [onAuthFailure])

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

  const appendModerateSystemMessage = React.useCallback(
    (
      channelLogin: string,
      message: TwitchSystemMessage,
      targetNames: string[]
    ) => {
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
              entry.kind === "system" && entry.message.id === message.id
          )
        ) {
          if (withoutAnonymous === room.timeline) {
            return room
          }
          return { ...room, timeline: withoutAnonymous }
        }

        return {
          ...room,
          timeline: [
            ...withoutAnonymous,
            { kind: "system" as const, message },
          ],
        }
      })
    },
    [updateRoom]
  )

  const appendModerateSystemMessageRef = React.useRef(
    appendModerateSystemMessage
  )
  React.useLayoutEffect(() => {
    appendModerateSystemMessageRef.current = appendModerateSystemMessage
  }, [appendModerateSystemMessage])

  React.useEffect(() => {
    client.setHandlers({
      onNotification: (notification: TwitchEventSubNotification) => {
        if (notification.subscriptionType !== "channel.moderate") {
          return
        }

        const channelLogin =
          notification.channelLogin ||
          normalizeChannelLogin(
            typeof notification.event.broadcaster_user_login === "string"
              ? notification.event.broadcaster_user_login
              : ""
          )

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

        appendModerateSystemMessageRef.current(
          channelLogin,
          message,
          extractModerateTargetNames(notification.event)
        )
      },
    })

    return () => {
      client.setHandlers({})
    }
  }, [client, roomsRef, syncedChannelsRef])

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
