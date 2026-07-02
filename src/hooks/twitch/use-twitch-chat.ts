import * as React from "react"
import { toast } from "sonner"

import { devChatLogger, devFetchLogger } from "@/lib/dev-logger"
import {
  clearBroadcasterProfileCache,
  clearChannelTwitchEmoteCache,
  clearRoomEmoteBundleCache,
  clearTwitchEmoteSessionCache,
  createEmptyComposerCatalog,
  fetchRoomEmoteBundle,
  getTwitchEmoteHydration,
  type ChannelProfileHint,
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
import {
  createRecentMessagesStatusMessage,
  fetchRecentMessages,
  RECENT_MESSAGES_CONCURRENCY,
  RECENT_MESSAGES_ERROR_TEXT,
  RECENT_MESSAGES_UNAVAILABLE_TEXT,
} from "@/lib/chat/recent-messages"
import {
  executeChatCommand,
  type ChatCommandContext,
  type ChatCommandResult,
} from "@/lib/chat/chat-commands"
import {
  createChatRateLimiter,
  isPrivilegedChannelSender,
  mapRateLimitResult,
  type ChatSendResult,
  type TwitchChannelSendBlock,
} from "@/lib/chat/chat-send"
import {
  classifySendNotice,
  isSendRejectionNotice,
  type SendOutcomeEvent,
} from "@/lib/chat/chat-send-notice"
import {
  LIVE_MESSAGES_PER_CHANNEL_DEFAULT,
  type DeletedMessagesBehavior,
  type TwitchAccount,
} from "@/lib/peepochat/peepochat-config"
import {
  TwitchChatClient,
  type TwitchBadge,
  type TwitchChatConnectOptions,
  type TwitchChatMessage,
  type TwitchConnectionState,
  type TwitchSelfUserState,
  type TwitchSystemMessage,
} from "@/lib/twitch/twitch-chat"
/** Back off automatic emote reloads after a failed fetch (avoids 429 retry storms). */
const EMOTE_LOAD_RETRY_MS = 60_000
const RECONNECT_TOAST_ID = "twitch-connection-recovery"

export type TwitchTimelineItem =
  | { kind: "chat"; message: TwitchChatMessage; isHistorical?: boolean }
  | { kind: "system"; message: TwitchSystemMessage; isHistorical?: boolean }

function notifyChatMessageDeleted(channelLogin: string, messageId: string) {
  if (typeof window === "undefined") {
    return
  }

  window.dispatchEvent(
    new CustomEvent("peepochat:message-deleted", {
      detail: { channelLogin, messageId },
    })
  )
}

function applyDeletedBehaviorToChatEntry(
  entry: Extract<TwitchTimelineItem, { kind: "chat" }>,
  deletedAt: string,
  behavior: DeletedMessagesBehavior
): TwitchTimelineItem | null {
  if (entry.message.deletedAt) {
    return entry
  }

  if (behavior === "remove") {
    return null
  }

  return {
    ...entry,
    message: { ...entry.message, deletedAt },
  }
}

function applyDeletedBehaviorToTimeline(
  timeline: TwitchTimelineItem[],
  matches: (message: TwitchChatMessage) => boolean,
  deletedAt: string,
  behavior: DeletedMessagesBehavior
): { timeline: TwitchTimelineItem[]; deletedMessageIds: string[] } {
  const next: TwitchTimelineItem[] = []
  const deletedMessageIds: string[] = []

  for (const entry of timeline) {
    if (entry.kind !== "chat" || !matches(entry.message)) {
      next.push(entry)
      continue
    }

    const updated = applyDeletedBehaviorToChatEntry(entry, deletedAt, behavior)
    if (updated) {
      next.push(updated)
    }
    deletedMessageIds.push(entry.message.id)
  }

  return { timeline: next, deletedMessageIds }
}

function purgeDeletedChatEntries(
  timeline: TwitchTimelineItem[]
): TwitchTimelineItem[] {
  return timeline.filter(
    (entry) => entry.kind !== "chat" || entry.message.deletedAt === null
  )
}

function purgeMessagesFromUsers(
  timeline: TwitchTimelineItem[],
  matches: (message: TwitchChatMessage) => boolean
): TwitchTimelineItem[] {
  return timeline.filter(
    (entry) => entry.kind !== "chat" || !matches(entry.message)
  )
}

export type TwitchChatRoomState = {
  login: string
  roomId: string | null
  joined: boolean
  joining: boolean
  timeline: TwitchTimelineItem[]
}

export type { TwitchChannelSendBlock } from "@/lib/chat/chat-send"

export type TwitchSelfChatState = {
  channel: string
  roomId: string | null
  displayName: string
  color: string | null
  badges: TwitchBadge[]
  isBroadcaster: boolean
  isModerator: boolean
  isSubscriber: boolean
  isVip: boolean
}

export type TwitchChatEmoteLoadContext = {
  accessToken?: string
  clientId?: string
  userId?: string
  userLogin?: string
  userDisplayName?: string
  channelHints?: ChannelProfileHint[]
}

type PendingConnect = {
  resolve: () => void
  reject: (err: Error) => void
}

type PendingReadConnect = PendingConnect & {
  key: string
  expectedChannels: string[]
}

type PendingConnectionRecovery = {
  id: number
  promise: Promise<void>
  resolve: () => void
}

export const SYNC_CHANNELS_SUPERSEDED_MESSAGE = "Channel list updated"

export function isSyncChannelsSupersededError(error: unknown): boolean {
  return (
    error instanceof Error && error.message === SYNC_CHANNELS_SUPERSEDED_MESSAGE
  )
}

function buildSyncChannelsKey(channelLogins: string[]): string {
  return channelLogins.join("\0")
}

function toSelfChatState(state: TwitchSelfUserState): TwitchSelfChatState {
  return state
}

function selfStateFromMessage(message: TwitchChatMessage): TwitchSelfChatState {
  return {
    channel: normalizeChannelLogin(message.channel),
    roomId: message.roomId,
    displayName: message.displayName,
    color: message.color,
    badges: message.badges,
    isBroadcaster: message.flags.isBroadcaster,
    isModerator: message.flags.isModerator,
    isSubscriber: message.flags.isSubscriber,
    isVip: message.flags.isVip,
  }
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

export function useTwitchChat(options?: {
  onChatMessageRef?: React.RefObject<
    ((message: TwitchChatMessage) => void) | null
  >
}) {
  const onChatMessageRef = options?.onChatMessageRef
  const readClientRef = React.useRef<TwitchChatClient | null>(null)
  const sendClientRef = React.useRef<TwitchChatClient | null>(null)
  const rateLimiterRef = React.useRef(createChatRateLimiter())
  const pendingConnectRef = React.useRef<PendingReadConnect | null>(null)
  const pendingSendConnectRef = React.useRef<PendingConnect | null>(null)
  const sendConnectKeyRef = React.useRef("")
  const readJoinedChannelsRef = React.useRef(new Set<string>())
  const connectionRecoveryRef = React.useRef<PendingConnectionRecovery | null>(
    null
  )
  const connectionRecoveryIdRef = React.useRef(0)
  const wasFullySyncedRef = React.useRef(false)
  const pendingSyncPromiseRef = React.useRef<{
    key: string
    promise: Promise<void>
  } | null>(null)
  const pendingSendRef = React.useRef<{
    channel: string
    recordedAt: number
  } | null>(null)
  const sendBlockTimersRef = React.useRef(
    new Map<string, ReturnType<typeof setTimeout>>()
  )
  const channelSendBlocksRef = React.useRef<
    Record<string, TwitchChannelSendBlock>
  >({})
  const sendOutcomeListenersRef = React.useRef(
    new Set<(event: SendOutcomeEvent) => void>()
  )
  const emoteCatalogsRef = React.useRef(
    new Map<string, ThirdPartyEmoteCatalog>()
  )
  const composerCatalogsRef = React.useRef(
    new Map<string, ComposerEmoteCatalog>()
  )
  const [composerCatalogs, setComposerCatalogs] = React.useState<
    Record<string, ComposerEmoteCatalog>
  >({})
  const [composerCatalogLoading, setComposerCatalogLoading] = React.useState<
    Record<string, boolean>
  >({})
  const roomEmotesLoadingRef = React.useRef(new Map<string, boolean>())
  const roomEmotesSettledRef = React.useRef(new Set<string>())
  const roomEmotesFailedAtRef = React.useRef(new Map<string, number>())
  const composerCatalogLoadingRef = React.useRef(new Map<string, boolean>())
  const composerCatalogLoadedRef = React.useRef(new Set<string>())
  const emoteLoadContextRef = React.useRef<TwitchChatEmoteLoadContext>({})
  const senderStateRef = React.useRef<{
    color: string | null
    badges: TwitchBadge[]
    displayName: string | null
    isBroadcaster: boolean
    isModerator: boolean
    isSubscriber: boolean
    isVip: boolean
  }>({
    color: null,
    badges: [],
    displayName: null,
    isBroadcaster: false,
    isModerator: false,
    isSubscriber: false,
    isVip: false,
  })
  const selfStatesRef = React.useRef(new Map<string, TwitchSelfChatState>())
  const [selfStates, setSelfStates] = React.useState<
    Record<string, TwitchSelfChatState>
  >({})
  const emoteCatalogGenerationRef = React.useRef(0)
  const hasAnnouncedConnectedRef = React.useRef(false)
  const syncedChannelsRef = React.useRef<string[]>([])
  const recentMessagesEnabledRef = React.useRef(true)
  const liveMessageLimitRef = React.useRef(LIVE_MESSAGES_PER_CHANNEL_DEFAULT)
  const deletedMessagesBehaviorRef =
    React.useRef<DeletedMessagesBehavior>("strikethrough")
  const clearChatWhenInstructedRef = React.useRef(true)
  const hideBlockedUsersRef = React.useRef(true)
  const isUserBlockedRef = React.useRef<
    (userId?: string | null, login?: string | null) => boolean
  >(() => false)
  const chatCommandActionsRef = React.useRef<
    Pick<ChatCommandContext, "blockUser" | "unblockUser">
  >({})
  const historyFetchLimitRef = React.useRef(0)
  const historyLoadedRef = React.useRef(new Set<string>())
  const historyLoadingRef = React.useRef(new Set<string>())
  const historyErrorNotifiedRef = React.useRef(new Set<string>())
  const recentMessagesGenerationRef = React.useRef(0)
  const recentMessagesQueueRef = React.useRef<string[]>([])
  const recentMessagesQueuedRef = React.useRef(new Set<string>())
  const recentMessagesActiveRef = React.useRef(0)

  const [connectionState, setConnectionState] =
    React.useState<TwitchConnectionState>({
      connected: false,
      connecting: false,
      lastError: null,
    })
  const [sendConnectionState, setSendConnectionState] =
    React.useState<TwitchConnectionState>({
      connected: false,
      connecting: false,
      lastError: null,
    })
  const [channelSendBlocks, setChannelSendBlocks] = React.useState<
    Record<string, TwitchChannelSendBlock>
  >({})
  React.useEffect(() => {
    channelSendBlocksRef.current = channelSendBlocks
  }, [channelSendBlocks])
  const [rooms, setRooms] = React.useState<Record<string, TwitchChatRoomState>>(
    {}
  )
  const roomsRef = React.useRef(rooms)
  React.useEffect(() => {
    roomsRef.current = rooms
  }, [rooms])
  const roomSubscribersRef = React.useRef<Map<string, Set<() => void>> | null>(
    null
  )
  if (roomSubscribersRef.current === null) {
    roomSubscribersRef.current = new Map()
  }

  const notifyRoomSubscribers = React.useCallback((login: string) => {
    const normalized = normalizeChannelLogin(login)
    const subscribers = roomSubscribersRef.current?.get(normalized)
    if (!subscribers) {
      return
    }

    for (const listener of subscribers) {
      listener()
    }
  }, [])

  const notifyChangedRoomSubscribers = React.useCallback(
    (
      current: Record<string, TwitchChatRoomState>,
      next: Record<string, TwitchChatRoomState>
    ) => {
      const logins = new Set([...Object.keys(current), ...Object.keys(next)])
      for (const login of logins) {
        if (current[login] !== next[login]) {
          notifyRoomSubscribers(login)
        }
      }
    },
    [notifyRoomSubscribers]
  )

  const commitRooms = React.useCallback(
    (
      updater: (
        current: Record<string, TwitchChatRoomState>
      ) => Record<string, TwitchChatRoomState>
    ) => {
      setRooms((current) => {
        const next = updater(current)
        if (next === current) {
          return current
        }

        roomsRef.current = next
        notifyChangedRoomSubscribers(current, next)
        return next
      })
    },
    [notifyChangedRoomSubscribers]
  )

  const subscribeToRoom = React.useCallback(
    (login: string, listener: () => void) => {
      const normalized = normalizeChannelLogin(login)
      const subscribers = roomSubscribersRef.current!
      let set = subscribers.get(normalized)
      if (!set) {
        set = new Set()
        subscribers.set(normalized, set)
      }
      set.add(listener)
      return () => {
        set.delete(listener)
        if (set.size === 0) {
          subscribers.delete(normalized)
        }
      }
    },
    []
  )

  const [logs, setLogs] = React.useState<string[]>([])

  const appendLog = React.useCallback((text: string) => {
    setLogs((current) => [text, ...current].slice(0, 20))
  }, [])

  const emitSendOutcome = React.useCallback((event: SendOutcomeEvent) => {
    for (const listener of sendOutcomeListenersRef.current) {
      listener(event)
    }
  }, [])

  const registerSendOutcomeListener = React.useCallback(
    (listener: (event: SendOutcomeEvent) => void) => {
      sendOutcomeListenersRef.current.add(listener)
      return () => {
        sendOutcomeListenersRef.current.delete(listener)
      }
    },
    []
  )

  const clearSendBlockTimer = React.useCallback((login: string) => {
    const timer = sendBlockTimersRef.current.get(login)
    if (timer) {
      clearTimeout(timer)
      sendBlockTimersRef.current.delete(login)
    }
  }, [])

  const scheduleSendBlockClear = React.useCallback(
    (login: string, expiresAt: number) => {
      clearSendBlockTimer(login)
      const delay = Math.max(0, expiresAt - Date.now())
      const timer = setTimeout(() => {
        sendBlockTimersRef.current.delete(login)
        setChannelSendBlocks((current) => {
          const block = current[login]
          if (!block || block.expiresAt !== expiresAt) {
            return current
          }
          const next = { ...current }
          delete next[login]
          return next
        })
      }, delay)
      sendBlockTimersRef.current.set(login, timer)
    },
    [clearSendBlockTimer]
  )

  const clearAllSendBlocks = React.useCallback(() => {
    for (const login of sendBlockTimersRef.current.keys()) {
      clearSendBlockTimer(login)
    }
    channelSendBlocksRef.current = {}
    setChannelSendBlocks({})
    pendingSendRef.current = null
  }, [clearSendBlockTimer])

  const handleSendSystemNotice = React.useCallback(
    (message: TwitchSystemMessage) => {
      const login = message.channel
        ? normalizeChannelLogin(message.channel)
        : null
      if (!login || !syncedChannelsRef.current.includes(login)) {
        return
      }

      const sendBlock = classifySendNotice(message)
      if (sendBlock) {
        setChannelSendBlocks((current) => ({
          ...current,
          [login]: sendBlock,
        }))
        if (sendBlock.expiresAt) {
          scheduleSendBlockClear(login, sendBlock.expiresAt)
        } else {
          clearSendBlockTimer(login)
        }
      }

      if (!isSendRejectionNotice(message)) {
        return
      }

      const pending = pendingSendRef.current
      if (
        pending &&
        pending.channel === login &&
        Date.now() - pending.recordedAt < 5_000
      ) {
        rateLimiterRef.current.unrecordLast(login)
        pendingSendRef.current = null
      }

      emitSendOutcome({
        type: "rejected",
        channel: login,
        message: message.text,
      })
    },
    [clearSendBlockTimer, emitSendOutcome, scheduleSendBlockClear]
  )

  const probeSendRestrictions = React.useCallback(() => {
    if (syncedChannelsRef.current.length === 0) {
      return
    }

    sendClientRef.current?.probeSendStatus(syncedChannelsRef.current)
  }, [])

  const isReadConnectionSynced = React.useCallback(() => {
    const expected = syncedChannelsRef.current
    return (
      expected.length > 0 &&
      Boolean(readClientRef.current?.isConnected) &&
      expected.every((login) => readJoinedChannelsRef.current.has(login))
    )
  }, [])

  const isConnectionFullySynced = React.useCallback(() => {
    const sendConnectionExpected = sendConnectKeyRef.current.length > 0
    return (
      isReadConnectionSynced() &&
      (!sendConnectionExpected || Boolean(sendClientRef.current?.isConnected))
    )
  }, [isReadConnectionSynced])

  const finishConnectionRecovery = React.useCallback(() => {
    const recovery = connectionRecoveryRef.current
    if (!recovery) {
      return
    }

    connectionRecoveryRef.current = null
    recovery.resolve()
    toast.success("Reconnected.", {
      id: RECONNECT_TOAST_ID,
      duration: 4_000,
    })
  }, [])

  const markConnectionSyncedIfReady = React.useCallback(() => {
    if (!isConnectionFullySynced()) {
      return
    }

    wasFullySyncedRef.current = true
    finishConnectionRecovery()
  }, [finishConnectionRecovery, isConnectionFullySynced])

  const beginConnectionRecovery = React.useCallback(() => {
    if (
      !wasFullySyncedRef.current ||
      syncedChannelsRef.current.length === 0 ||
      connectionRecoveryRef.current
    ) {
      return
    }

    let resolveRecovery!: () => void
    const promise = new Promise<void>((resolve) => {
      resolveRecovery = resolve
    })
    const recovery = {
      id: connectionRecoveryIdRef.current + 1,
      promise,
      resolve: resolveRecovery,
    }

    connectionRecoveryIdRef.current = recovery.id
    connectionRecoveryRef.current = recovery

    toast.loading(
      "It looks like you've lost connection. Trying to reconnect...",
      {
        id: RECONNECT_TOAST_ID,
        duration: Infinity,
      }
    )
  }, [])

  const handleReadConnectionLost = React.useCallback(
    (reason: string) => {
      beginConnectionRecovery()
      setConnectionState((prev) => ({
        ...prev,
        connected: false,
        connecting: true,
        lastError: reason,
      }))
    },
    [beginConnectionRecovery]
  )

  const handleSendConnectionLost = React.useCallback(
    (reason: string) => {
      beginConnectionRecovery()
      setSendConnectionState((prev) => ({
        ...prev,
        connected: false,
        connecting: true,
        lastError: reason,
      }))
    },
    [beginConnectionRecovery]
  )

  const completePendingReadSyncIfReady = React.useCallback(() => {
    const pending = pendingConnectRef.current
    if (!pending || !readClientRef.current?.isConnected) {
      return
    }

    if (
      pending.expectedChannels.some(
        (login) => !readJoinedChannelsRef.current.has(login)
      )
    ) {
      return
    }

    pendingConnectRef.current = null
    pending.resolve()
  }, [])

  const resolveConnectionRecovery = React.useCallback(() => {
    const recovery = connectionRecoveryRef.current
    if (!recovery) {
      return
    }

    connectionRecoveryRef.current = null
    recovery.resolve()
    toast.dismiss(RECONNECT_TOAST_ID)
  }, [])

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const handleOffline = () => {
      readClientRef.current?.forceReconnect("Browser went offline")
      sendClientRef.current?.forceReconnect("Browser went offline")
    }

    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  const updateSelfState = React.useCallback((state: TwitchSelfChatState) => {
    selfStatesRef.current.set(state.channel, state)
    setSelfStates((current) => ({
      ...current,
      [state.channel]: state,
    }))
    senderStateRef.current = {
      color: state.color,
      badges: state.badges,
      displayName: state.displayName || null,
      isBroadcaster: state.isBroadcaster,
      isModerator: state.isModerator,
      isSubscriber: state.isSubscriber,
      isVip: state.isVip,
    }
  }, [])

  const updateRoom = React.useCallback(
    (
      login: string,
      updater: (room: TwitchChatRoomState) => TwitchChatRoomState
    ) => {
      const normalized = normalizeChannelLogin(login)
      commitRooms((current) => {
        const existing = current[normalized] ?? createEmptyRoom(normalized)
        return { ...current, [normalized]: updater(existing) }
      })
    },
    [commitRooms]
  )

  const partitionTimeline = React.useCallback(
    (timeline: TwitchTimelineItem[]) => {
      const historical: TwitchTimelineItem[] = []
      const live: TwitchTimelineItem[] = []

      for (const entry of timeline) {
        if (entry.isHistorical) {
          historical.push(entry)
        } else {
          live.push(entry)
        }
      }

      return { historical, live }
    },
    []
  )

  const partitionTimelineWithKnownIds = React.useCallback(
    (timeline: TwitchTimelineItem[]) => {
      const historical: TwitchTimelineItem[] = []
      const live: TwitchTimelineItem[] = []
      const knownIds = new Set<string>()

      for (const entry of timeline) {
        knownIds.add(entry.message.id)
        if (entry.isHistorical) {
          historical.push(entry)
        } else {
          live.push(entry)
        }
      }

      return { historical, live, knownIds }
    },
    []
  )

  const trimTimeline = React.useCallback(
    (timeline: TwitchTimelineItem[]) => {
      const limit = liveMessageLimitRef.current
      if (timeline.length <= limit) {
        return timeline
      }

      const { historical, live } = partitionTimeline(timeline)
      let excess = historical.length + live.length - limit

      if (excess <= 0) {
        return timeline
      }

      let trimmedHistorical = historical
      if (trimmedHistorical.length > 0) {
        const removeCount = Math.min(excess, trimmedHistorical.length)
        trimmedHistorical = trimmedHistorical.slice(removeCount)
        excess -= removeCount
      }

      const trimmedLive = excess > 0 ? live.slice(excess) : live

      return [...trimmedHistorical, ...trimmedLive]
    },
    [partitionTimeline]
  )

  const getTimelineMessageIds = React.useCallback(
    (timeline: TwitchTimelineItem[]) => {
      const ids = new Set<string>()
      for (const entry of timeline) {
        ids.add(entry.message.id)
      }
      return ids
    },
    []
  )

  const appendRoomTimeline = React.useCallback(
    (login: string, items: TwitchTimelineItem[]) => {
      if (items.length === 0) return

      updateRoom(login, (room) => {
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

        devChatLogger.debugLazy(() => [
          "timeline:append-live",
          {
            login,
            added: nextLive.length - live.length,
            total: nextHistorical.length + nextLive.length,
          },
        ])

        return {
          ...room,
          timeline: trimTimeline([...nextHistorical, ...nextLive]),
        }
      })
    },
    [getTimelineMessageIds, partitionTimeline, trimTimeline, updateRoom]
  )

  const prependHistoricalTimeline = React.useCallback(
    (login: string, items: TwitchTimelineItem[]) => {
      if (items.length === 0) return

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
          timeline: trimTimeline([...nextHistorical, ...live]),
        }
      })
    },
    [partitionTimelineWithKnownIds, trimTimeline, updateRoom]
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
    [partitionTimeline, updateRoom]
  )

  const appendRoomSystemMessage = React.useCallback(
    (login: string, message: TwitchSystemMessage) => {
      appendRoomTimeline(login, [{ kind: "system", message }])
    },
    [appendRoomTimeline]
  )

  const getTwitchHydration = React.useCallback(
    (roomId: string | null): TwitchEmoteHydration | null => {
      if (!roomId) {
        return null
      }

      const catalog = composerCatalogsRef.current.get(roomId)
      return catalog ? getTwitchEmoteHydration(catalog) : null
    },
    []
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
    [getTwitchHydration]
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
    [appendLog, rehydrateRoomTimeline]
  )

  const routeMessageToRoom = React.useCallback(
    (message: TwitchChatMessage) => {
      const login = normalizeChannelLogin(message.channel)
      if (!syncedChannelsRef.current.includes(login)) {
        return
      }

      const roomId = message.roomId

      if (roomId) {
        updateRoom(login, (room) => ({
          ...room,
          roomId: room.roomId ?? roomId,
        }))
        ensureRoomEmotes(login, roomId)
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

      appendRoomTimeline(login, [{ kind: "chat", message: hydrated }])
      onChatMessageRef?.current?.(hydrated)
    },
    [
      appendRoomTimeline,
      ensureRoomEmotes,
      hydrateRoomMessage,
      onChatMessageRef,
      updateRoom,
      updateSelfState,
      emitSendOutcome,
    ]
  )

  const applyRoomMessageDeletions = React.useCallback(
    (
      login: string,
      matches: (message: TwitchChatMessage) => boolean,
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
    [updateRoom]
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
    (event: import("@/lib/twitch/twitch-chat").TwitchClearMsgEvent) => {
      const login = normalizeChannelLogin(event.channel)
      if (!syncedChannelsRef.current.includes(login)) {
        return
      }

      applyRoomMessageDeletions(
        login,
        (message) => message.id === event.messageId
      )
    },
    [applyRoomMessageDeletions]
  )

  const routeClearChat = React.useCallback(
    (event: import("@/lib/twitch/twitch-chat").TwitchClearChatEvent) => {
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
          entry.kind === "chat" ? [entry.message.id] : []
        )

        if (deletedMessageIds.length === 0) {
          return room
        }

        for (const messageId of deletedMessageIds) {
          notifyChatMessageDeleted(login, messageId)
        }

        return {
          ...room,
          timeline: room.timeline.filter((entry) => entry.kind !== "chat"),
        }
      })
    },
    [applyRoomMessageDeletions, updateRoom]
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
          message.event === "subscription" &&
          message.details &&
          message.detailsEmotes &&
          message.detailsEmotes.length > 0
        ) {
          const roomId = message.roomId
          const thirdPartyCatalog = roomId
            ? (emoteCatalogsRef.current.get(roomId) ?? null)
            : null

          const hydrated = hydrateRoomMessage(
            {
              id: message.id,
              channel: login,
              roomId: message.roomId,
              userId: null,
              userName: message.actor?.userName ?? "system",
              displayName: message.actor?.displayName ?? "System",
              text: message.details,
              color: message.actor?.color ?? null,
              receivedAt: message.receivedAt,
              badges: [],
              badgeInfo: [],
              emotes: message.detailsEmotes,
              reply: null,
              deletedAt: null,
              flags: {
                isBroadcaster: false,
                isModerator: false,
                isSubscriber: false,
                isVip: false,
                isFirst: false,
                isAction: false,
              },
            },
            thirdPartyCatalog
          )

          message = { ...message, detailsEmotes: hydrated.emotes }
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

      commitRooms((current) => {
        const next = { ...current }
        for (const channelLogin of Object.keys(next)) {
          const room = next[channelLogin]
          const { historical, live } = partitionTimeline(room.timeline)
          next[channelLogin] = {
            ...room,
            timeline: trimTimeline([
              ...historical,
              ...live,
              { kind: "system" as const, message },
            ]),
          }
        }
        return next
      })
    },
    [
      appendRoomSystemMessage,
      hydrateRoomMessage,
      partitionTimeline,
      trimTimeline,
      updateRoom,
    ]
  )

  const shouldApplyRecentMessagesFetch = React.useCallback(
    (normalized: string, generation: number) => {
      return (
        recentMessagesEnabledRef.current &&
        syncedChannelsRef.current.includes(normalized) &&
        recentMessagesGenerationRef.current === generation
      )
    },
    []
  )

  const clearRecentMessagesQueue = React.useCallback(() => {
    recentMessagesQueueRef.current = []
    recentMessagesQueuedRef.current.clear()
    recentMessagesGenerationRef.current += 1
  }, [])

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

          devFetchLogger.debugLazy(() => [
            "recent-messages:start",
            { channel: normalized },
          ])

          const fetchLimit = liveMessageLimitRef.current

          try {
            const outcome = await fetchRecentMessages(normalized, fetchLimit)

            if (!shouldApplyRecentMessagesFetch(normalized, generation)) {
              devFetchLogger.debugLazy(() => [
                "recent-messages:stale",
                { channel: normalized },
              ])
              return
            }

            devFetchLogger.debugLazy(() => [
              "recent-messages:outcome",
              {
                channel: normalized,
                status: outcome.status,
                messageCount:
                  outcome.status === "success" ? outcome.messages.length : 0,
                error: outcome.status === "error" ? outcome.message : undefined,
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
                  return
                }

                const roomId =
                  outcome.messages.find((message) => message.roomId)?.roomId ??
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

                prependHistoricalTimeline(
                  normalized,
                  outcome.messages.map((message) => {
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
                return
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
                return
              }
              case "error": {
                if (historyErrorNotifiedRef.current.has(normalized)) {
                  return
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
          } finally {
            historyLoadingRef.current.delete(normalized)
            recentMessagesQueuedRef.current.delete(normalized)
            recentMessagesActiveRef.current -= 1
            runNext()
          }
        })()
      }
    }

    runNext()
  }, [
    appendRoomSystemMessage,
    hydrateRoomMessage,
    ensureRoomEmotes,
    prependHistoricalTimeline,
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
      recentMessagesQueueRef.current.push(normalized)
      drainRecentMessagesQueue()
    },
    [drainRecentMessagesQueue]
  )

  const getReadClient = React.useCallback(() => {
    if (readClientRef.current) return readClientRef.current

    const client = new TwitchChatClient((event) => {
      switch (event.type) {
        case "connection-lost":
          handleReadConnectionLost(event.reason)
          break
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
          completePendingReadSyncIfReady()
          markConnectionSyncedIfReady()
          break
        case "disconnected":
          readJoinedChannelsRef.current.clear()
          senderStateRef.current = {
            color: null,
            badges: [],
            displayName: null,
            isBroadcaster: false,
            isModerator: false,
            isSubscriber: false,
            isVip: false,
          }
          selfStatesRef.current.clear()
          setSelfStates({})
          setConnectionState((prev) => ({
            ...prev,
            connected: false,
            connecting: connectionRecoveryRef.current ? true : false,
            lastError: event.reason,
          }))
          commitRooms((current) => {
            const next = { ...current }
            const syncedChannels = new Set(syncedChannelsRef.current)
            for (const login of Object.keys(next)) {
              next[login] = {
                ...next[login],
                joined: false,
                joining: syncedChannels.has(login),
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
          readJoinedChannelsRef.current.add(event.channel)
          updateRoom(event.channel, (room) => ({
            ...room,
            joined: true,
            joining: false,
          }))
          loadRecentMessages(event.channel)
          completePendingReadSyncIfReady()
          markConnectionSyncedIfReady()
          break
        case "channel-parted":
          readJoinedChannelsRef.current.delete(event.channel)
          updateRoom(event.channel, (room) => ({
            ...room,
            joined: false,
            joining: false,
          }))
          break
        case "room-state": {
          const login = normalizeChannelLogin(event.state.channel)
          readJoinedChannelsRef.current.add(login)
          updateRoom(login, (room) => ({
            ...room,
            roomId: event.state.roomId,
            joined: true,
            joining: false,
          }))
          if (
            event.state.roomId &&
            !roomEmotesSettledRef.current.has(event.state.roomId)
          ) {
            ensureRoomEmotes(login, event.state.roomId)
          }
          loadRecentMessages(login)
          completePendingReadSyncIfReady()
          markConnectionSyncedIfReady()
          break
        }
        case "self-state":
          updateSelfState(toSelfChatState(event.state))
          break
        case "message":
          routeMessageToRoom(event.message)
          break
        case "clear-msg":
          routeClearMsg(event.event)
          break
        case "clear-chat":
          routeClearChat(event.event)
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
    }, "read")

    readClientRef.current = client
    return client
  }, [
    appendLog,
    completePendingReadSyncIfReady,
    handleReadConnectionLost,
    loadRecentMessages,
    ensureRoomEmotes,
    markConnectionSyncedIfReady,
    routeMessageToRoom,
    routeClearMsg,
    routeClearChat,
    routeSystemMessage,
    updateRoom,
    updateSelfState,
  ])

  const getSendClient = React.useCallback(() => {
    if (sendClientRef.current) return sendClientRef.current

    const client = new TwitchChatClient((event) => {
      switch (event.type) {
        case "connection-lost":
          handleSendConnectionLost(event.reason)
          break
        case "connected":
          setSendConnectionState((prev) => ({
            ...prev,
            connected: true,
            connecting: false,
            lastError: null,
          }))
          pendingSendConnectRef.current?.resolve()
          pendingSendConnectRef.current = null
          probeSendRestrictions()
          markConnectionSyncedIfReady()
          break
        case "disconnected":
          setSendConnectionState((prev) => ({
            ...prev,
            connected: false,
            connecting: connectionRecoveryRef.current ? true : false,
            lastError: event.reason,
          }))
          pendingSendConnectRef.current?.reject(
            new Error(event.reason ?? "Send connection lost")
          )
          pendingSendConnectRef.current = null
          break
        case "self-state":
          updateSelfState(toSelfChatState(event.state))
          {
            const login = normalizeChannelLogin(event.state.channel)
            clearSendBlockTimer(login)
            setChannelSendBlocks((current) => {
              if (!current[login]) {
                return current
              }
              const next = { ...current }
              delete next[login]
              return next
            })
          }
          break
        case "system":
          handleSendSystemNotice(event.message)
          break
        case "log":
          appendLog(event.text)
          break
        case "error":
          appendLog(event.text)
          setSendConnectionState((prev) => ({
            ...prev,
            lastError: event.text,
          }))
          pendingSendConnectRef.current?.reject(new Error(event.text))
          pendingSendConnectRef.current = null
          break
      }
    }, "send")

    sendClientRef.current = client
    return client
  }, [
    appendLog,
    clearSendBlockTimer,
    handleSendConnectionLost,
    handleSendSystemNotice,
    markConnectionSyncedIfReady,
    probeSendRestrictions,
    updateSelfState,
  ])

  React.useEffect(() => {
    return () => {
      // React Strict Mode remounts immediately in dev; closing here interrupts
      // the in-flight Twitch IRC handshake before the remounted hook reuses it.
      if (import.meta.env.DEV) {
        return
      }

      readClientRef.current?.close()
      readClientRef.current = null
      sendClientRef.current?.close()
      sendClientRef.current = null
    }
  }, [])

  const ensureRooms = React.useCallback((channelLogins: string[]) => {
    commitRooms((current) => {
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

  const pruneRemovedChannelState = React.useCallback(
    (removedLogins: string[]) => {
      if (removedLogins.length === 0) {
        return
      }

      const removed = new Set(removedLogins)

      for (const login of removedLogins) {
        readJoinedChannelsRef.current.delete(login)
        historyLoadedRef.current.delete(login)
        historyLoadingRef.current.delete(login)
        historyErrorNotifiedRef.current.delete(login)
        recentMessagesQueuedRef.current.delete(login)
        selfStatesRef.current.delete(login)

        const roomId = roomsRef.current[login]?.roomId
        if (!roomId) {
          continue
        }

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

      if (recentMessagesQueueRef.current.length > 0) {
        recentMessagesQueueRef.current = recentMessagesQueueRef.current.filter(
          (login) => !removed.has(login)
        )
      }

      setSelfStates((current) => {
        let changed = false
        const next = { ...current }
        for (const login of removedLogins) {
          if (login in next) {
            delete next[login]
            changed = true
          }
        }
        return changed ? next : current
      })

      commitRooms((current) => {
        let changed = false
        const next = { ...current }
        for (const login of removedLogins) {
          if (login in next) {
            delete next[login]
            changed = true
          }
        }
        return changed ? next : current
      })
    },
    []
  )

  const syncSendConnection = React.useCallback(
    (options: TwitchChatConnectOptions = {}): Promise<void> => {
      const token = options.accessToken?.trim()
      const nick = options.nick?.trim()
      const hasAuth = Boolean(token && nick)
      const connectKey = `${token ?? ""}\u0001${nick ?? ""}`

      if (!hasAuth || syncedChannelsRef.current.length === 0) {
        sendConnectKeyRef.current = ""
        sendClientRef.current?.close()
        sendClientRef.current = null
        setSendConnectionState({
          connected: false,
          connecting: false,
          lastError: null,
        })
        return Promise.resolve()
      }

      if (
        sendClientRef.current?.isConnected &&
        sendConnectKeyRef.current === connectKey
      ) {
        probeSendRestrictions()
        return Promise.resolve()
      }

      if (sendClientRef.current) {
        sendClientRef.current.close()
        sendClientRef.current = null
      }

      sendConnectKeyRef.current = connectKey

      setSendConnectionState((prev) => ({
        ...prev,
        connecting: !prev.connected,
        lastError: null,
      }))

      return new Promise<void>((resolve, reject) => {
        pendingSendConnectRef.current = { resolve, reject }
        getSendClient().openSendSession(options)
      }).catch((error) => {
        devChatLogger.warn("send:connect-failed", error)
        return undefined
      })
    },
    [getSendClient, probeSendRestrictions]
  )

  const syncChannels = React.useCallback(
    (
      channelLogins: string[],
      options: TwitchChatConnectOptions = {}
    ): Promise<void> => {
      const normalized = [
        ...new Set(
          channelLogins.flatMap((login) => {
            const value = normalizeChannelLogin(login)
            return value ? [value] : []
          })
        ),
      ]
      const syncKey = buildSyncChannelsKey(normalized)

      const previous = syncedChannelsRef.current
      const unchanged =
        previous.length === normalized.length &&
        previous.every((login, index) => login === normalized[index])

      syncedChannelsRef.current = normalized

      if (unchanged && normalized.length > 0 && isReadConnectionSynced()) {
        completePendingReadSyncIfReady()
        return syncSendConnection(options).then(() => {
          markConnectionSyncedIfReady()
        })
      }

      const inFlight = pendingSyncPromiseRef.current
      if (inFlight && inFlight.key === syncKey) {
        void syncSendConnection(options)
        return inFlight.promise
      }

      if (normalized.length === 0) {
        pendingSyncPromiseRef.current = null
        pendingConnectRef.current?.resolve()
        pendingConnectRef.current = null
        pendingSendConnectRef.current?.resolve()
        pendingSendConnectRef.current = null
        readJoinedChannelsRef.current.clear()
        wasFullySyncedRef.current = false
        resolveConnectionRecovery()
        readClientRef.current?.close()
        readClientRef.current = null
        sendClientRef.current?.close()
        sendClientRef.current = null
        rateLimiterRef.current.reset()
        clearAllSendBlocks()
        hasAnnouncedConnectedRef.current = false
        emoteCatalogGenerationRef.current += 1
        clearThirdPartyEmoteCache()
        clearTwitchEmoteSessionCache()
        clearBroadcasterProfileCache()
        clearTwitchEmoteIvrCache()
        selfStatesRef.current.clear()
        setSelfStates({})
        historyLoadedRef.current.clear()
        historyLoadingRef.current.clear()
        historyErrorNotifiedRef.current.clear()
        clearRecentMessagesQueue()
        emoteCatalogsRef.current.clear()
        composerCatalogsRef.current.clear()
        setComposerCatalogs({})
        composerCatalogLoadedRef.current.clear()
        roomEmotesLoadingRef.current.clear()
        roomEmotesSettledRef.current.clear()
        roomEmotesFailedAtRef.current.clear()
        composerCatalogLoadingRef.current.clear()
        clearRoomEmoteBundleCache()
        setConnectionState({
          connected: false,
          connecting: false,
          lastError: null,
        })
        setSendConnectionState({
          connected: false,
          connecting: false,
          lastError: null,
        })
        commitRooms(() => ({}))
        return Promise.resolve()
      }

      const removedLogins = previous.filter(
        (login) => !normalized.includes(login)
      )
      pruneRemovedChannelState(removedLogins)

      ensureRooms(normalized)

      for (const login of normalized) {
        loadRecentMessages(login)
      }

      if (pendingConnectRef.current) {
        pendingConnectRef.current.resolve()
        pendingConnectRef.current = null
      }

      setConnectionState((prev) => ({
        ...prev,
        connecting: !prev.connected,
        lastError: null,
      }))

      const readSyncPromise = new Promise<void>((resolve, reject) => {
        pendingConnectRef.current = {
          key: syncKey,
          expectedChannels: normalized,
          resolve,
          reject,
        }
        getReadClient().setChannels(normalized, {})
      })
      completePendingReadSyncIfReady()

      const promise = readSyncPromise.then(() =>
        syncSendConnection(options).then(() => {
          markConnectionSyncedIfReady()
        })
      )

      pendingSyncPromiseRef.current = { key: syncKey, promise }
      void promise
        .finally(() => {
          if (pendingSyncPromiseRef.current?.promise === promise) {
            pendingSyncPromiseRef.current = null
          }
        })
        .catch(() => undefined)

      return promise
    },
    [
      clearAllSendBlocks,
      clearRecentMessagesQueue,
      completePendingReadSyncIfReady,
      ensureRooms,
      getReadClient,
      isReadConnectionSynced,
      loadRecentMessages,
      markConnectionSyncedIfReady,
      pruneRemovedChannelState,
      resolveConnectionRecovery,
      syncSendConnection,
    ]
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
            const trimmed = trimTimeline(room.timeline)
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
    [trimTimeline]
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
    []
  )

  const setClearChatWhenInstructed = React.useCallback((enabled: boolean) => {
    clearChatWhenInstructedRef.current = enabled
  }, [])

  const setHideBlockedUsers = React.useCallback((enabled: boolean) => {
    hideBlockedUsersRef.current = enabled
  }, [])

  const setIsUserBlocked = React.useCallback(
    (checker: (userId?: string | null, login?: string | null) => boolean) => {
      isUserBlockedRef.current = checker
    },
    []
  )

  const setChatCommandActions = React.useCallback(
    (actions: Pick<ChatCommandContext, "blockUser" | "unblockUser">) => {
      chatCommandActionsRef.current = actions
    },
    []
  )

  const purgeMessagesFromBlockedUsers = React.useCallback(
    (matches: (message: TwitchChatMessage) => boolean) => {
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
    []
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

  const setRecentMessagesEnabled = React.useCallback(
    (enabled: boolean) => {
      const wasEnabled = recentMessagesEnabledRef.current
      recentMessagesEnabledRef.current = enabled

      if (!enabled) {
        historyLoadedRef.current.clear()
        historyLoadingRef.current.clear()
        historyErrorNotifiedRef.current.clear()
        historyFetchLimitRef.current = 0
        clearRecentMessagesQueue()
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
    [clearHistoricalTimeline, clearRecentMessagesQueue, loadRecentMessages]
  )

  const getRoom = React.useCallback(
    (login: string): TwitchChatRoomState | null => {
      const normalized = normalizeChannelLogin(login)
      return roomsRef.current[normalized] ?? null
    },
    []
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

  const getSelfChatState = React.useCallback(
    (login: string): TwitchSelfChatState | null => {
      const normalized = normalizeChannelLogin(login)
      return selfStates[normalized] ?? null
    },
    [selfStates]
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
    [ensureRoomEmotes]
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
  }, [rehydrateRoomTimeline])

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
    [rehydrateRoomTimeline]
  )

  const sendChatMessageInternal = React.useCallback(
    (
      login: string,
      message: string,
      reply: import("@/lib/twitch/twitch-chat").TwitchChatReply | null,
      options: { isAction?: boolean } = {}
    ): ChatSendResult => {
      const normalized = normalizeChannelLogin(login)
      const text = message.replace(/\r?\n/g, " ").trim()
      if (!text) {
        return { ok: false, reason: "empty" }
      }

      if (!sendClientRef.current?.isConnected) {
        return { ok: false, reason: "not_connected" }
      }

      const sendBlock = channelSendBlocksRef.current[normalized]
      if (sendBlock) {
        if (
          sendBlock.kind === "ban" ||
          !sendBlock.expiresAt ||
          sendBlock.expiresAt > Date.now()
        ) {
          return {
            ok: false,
            reason: "blocked",
            message: sendBlock.message,
          }
        }
      }

      const { userLogin } = emoteLoadContextRef.current
      const selfState = selfStatesRef.current.get(normalized) ?? null
      const isPrivileged = isPrivilegedChannelSender(
        normalized,
        userLogin ?? null,
        selfState
      )

      const rateLimitResult = rateLimiterRef.current.check(
        normalized,
        isPrivileged
      )
      const rateLimitReason = mapRateLimitResult(rateLimitResult)
      if (rateLimitReason) {
        return { ok: false, reason: rateLimitReason }
      }

      const sent = getSendClient().sendMessage(normalized, text, {
        replyParentMessageId: reply?.parentMessageId ?? null,
        isAction: options.isAction ?? false,
      })
      if (!sent) {
        return { ok: false, reason: "not_connected" }
      }

      rateLimiterRef.current.record(normalized)
      pendingSendRef.current = {
        channel: normalized,
        recordedAt: Date.now(),
      }
      return { ok: true }
    },
    [getSendClient]
  )

  const getChannelSendBlock = React.useCallback(
    (login: string): TwitchChannelSendBlock | null => {
      const normalized = normalizeChannelLogin(login)
      const block = channelSendBlocks[normalized]
      if (!block) {
        return null
      }

      if (
        block.kind === "timeout" &&
        block.expiresAt &&
        block.expiresAt <= Date.now()
      ) {
        return null
      }

      return block
    },
    [channelSendBlocks]
  )

  const sendMessage = React.useCallback(
    (
      login: string,
      message: string,
      reply: import("@/lib/twitch/twitch-chat").TwitchChatReply | null = null
    ): ChatSendResult => sendChatMessageInternal(login, message, reply),
    [sendChatMessageInternal]
  )

  const sendActionMessage = React.useCallback(
    (
      login: string,
      message: string,
      reply: import("@/lib/twitch/twitch-chat").TwitchChatReply | null = null
    ): ChatSendResult =>
      sendChatMessageInternal(login, message, reply, { isAction: true }),
    [sendChatMessageInternal]
  )

  const runChatCommand = React.useCallback(
    async (
      login: string,
      input: string,
      account: TwitchAccount | null
    ): Promise<ChatCommandResult> => {
      const normalized = normalizeChannelLogin(login)
      const room = roomsRef.current[normalized]
      const result = await executeChatCommand(input, {
        account,
        channelLogin: normalized,
        broadcasterId: room?.roomId ?? null,
        selfState: selfStatesRef.current.get(normalized) ?? null,
        ...chatCommandActionsRef.current,
      })

      if (result.handled && result.kind === "feedback") {
        appendRoomSystemMessage(normalized, {
          ...createRecentMessagesStatusMessage(normalized, result.message),
          level: result.level ?? "info",
        })
      }

      return result
    },
    [appendRoomSystemMessage]
  )

  return {
    connectionState,
    sendConnectionState,
    logs,
    syncChannels,
    subscribeToRoom,
    getRoom,
    getTimeline,
    getRoomId,
    setEmoteLoadContext,
    setRecentMessagesEnabled,
    setLiveMessageLimit,
    setDeletedMessagesBehavior,
    setClearChatWhenInstructed,
    setHideBlockedUsers,
    setIsUserBlocked,
    setChatCommandActions,
    purgeMessagesFromBlockedUsers,
    purgeMessagesFromUser,
    markChatMessageDeleted,
    getComposerEmoteCatalog,
    ensureComposerEmotes,
    isComposerEmotesLoading,
    getSelfChatState,
    getChannelSendBlock,
    registerSendOutcomeListener,
    refreshEmotes,
    rehydrateAllRoomTimelines,
    sendMessage,
    sendActionMessage,
    runChatCommand,
  }
}
