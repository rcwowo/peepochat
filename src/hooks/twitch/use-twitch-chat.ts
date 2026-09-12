import * as React from "react"

import {
  useChatConnection,
  type ReadClientHandlers,
  type SendClientHandlers,
} from "@/hooks/twitch/chat/use-chat-connection"
import { useChatEmotes } from "@/hooks/twitch/chat/use-chat-emotes"
import { useChatSend } from "@/hooks/twitch/chat/use-chat-send"
import { useChatterStore } from "@/hooks/twitch/chat/use-chatter-store"
import { useMessageRouting } from "@/hooks/twitch/chat/use-message-routing"
import { useRecentMessages } from "@/hooks/twitch/chat/use-recent-messages"
import { useRoomStore } from "@/hooks/twitch/chat/use-room-store"
import { useSevenTvLiveUpdates } from "@/hooks/twitch/chat/use-seventv-live-updates"
import { useTimeline } from "@/hooks/twitch/chat/use-timeline"
import { usePinnedMessages } from "@/hooks/twitch/chat/use-pinned-messages"
import { useTwitchEventSub } from "@/hooks/twitch/chat/use-twitch-eventsub"
import { useRetainedRef } from "@/hooks/use-retained-ref"
import type {
  DeletedMessagesBehavior,
  TwitchAccount,
} from "@/lib/peepochat/peepochat-config"
import { normalizeChannelLogin } from "@/lib/twitch/channel/channel"
import type {
  TwitchChatClient,
  TwitchChatConnectOptions,
  TwitchChatMessage,
  TwitchSystemMessage,
} from "@/lib/twitch/chat/chat"
import type {
  TwitchAutomodHeldMessage,
  TwitchSelfChatState,
  TwitchTimelineItem,
} from "@/lib/twitch/chat/types"

export { isSyncChannelsSupersededError } from "@/hooks/twitch/chat/types"

export function useTwitchChat(options?: {
  account?: TwitchAccount | null
  onAuthFailure?: (reason: "expired" | "scopes") => void
  onChatMessageRef?: React.RefObject<
    ((message: TwitchChatMessage) => void) | null
  >
  onHistoricalMessagesRef?: React.RefObject<
    ((messages: TwitchChatMessage[]) => void) | null
  >
}) {
  const account = options?.account ?? null
  const onAuthFailure = options?.onAuthFailure
  const onChatMessageRef = options?.onChatMessageRef
  const onHistoricalMessagesRef = options?.onHistoricalMessagesRef

  const hideBlockedUsersRef = React.useRef(true)
  const isUserBlockedRef = React.useRef<
    (userId?: string | null, login?: string | null) => boolean
  >(() => false)
  const clearChatWhenInstructedRef = React.useRef(true)
  const showSuspiciousActivityRef = React.useRef(true)

  const syncedChannelsRef = useRetainedRef(
    "synced-channels",
    () => [] as string[]
  )
  const visibleChannelsRef = React.useRef<string[]>([])
  const sendClientRef = useRetainedRef(
    "send-client",
    () => null as TwitchChatClient | null
  )
  const selfStatesRef = useRetainedRef(
    "self-states",
    () => new Map<string, TwitchSelfChatState>()
  )
  const getSendClientRef = React.useRef<() => TwitchChatClient>(() => {
    throw new Error("Send client is not ready")
  })

  const [logs, setLogs] = React.useState<string[]>([])
  const appendLog = React.useCallback((text: string) => {
    setLogs((current) => [text, ...current].slice(0, 20))
  }, [])

  const roomStore = useRoomStore()
  const chatterStore = useChatterStore()
  const observeTimelineItems = React.useCallback(
    (
      login: string,
      items: TwitchTimelineItem[],
      options?: { flush?: boolean }
    ) => {
      chatterStore.observeTimelineItems(login, items, options)
    },
    [chatterStore]
  )
  const timeline = useTimeline({
    roomStore,
    hideBlockedUsersRef,
    isUserBlockedRef,
    onTimelineItems: observeTimelineItems,
  })
  const onRoomEmotesSettledRef = React.useRef<
    ((roomId: string) => void) | null
  >(null)
  const onRoomsClearedRef = React.useRef<((roomIds: string[]) => void) | null>(
    null
  )
  const emotes = useChatEmotes({
    roomStore,
    appendLog,
    onRoomEmotesSettledRef,
    onRoomsClearedRef,
  })
  const sevenTvLiveUpdates = useSevenTvLiveUpdates({
    roomStore,
    emotes,
    appendRoomSystemMessage: timeline.appendRoomSystemMessage,
  })
  React.useLayoutEffect(() => {
    onRoomEmotesSettledRef.current = sevenTvLiveUpdates.notifyRoomEmotesSettled
    onRoomsClearedRef.current = sevenTvLiveUpdates.notifyRoomsRemoved
  }, [
    sevenTvLiveUpdates.notifyRoomEmotesSettled,
    sevenTvLiveUpdates.notifyRoomsRemoved,
  ])
  const recentMessages = useRecentMessages({
    roomStore,
    timeline,
    emotes,
    syncedChannelsRef,
    hideBlockedUsersRef,
    isUserBlockedRef,
    onHistoricalMessagesRef,
  })

  const send = useChatSend({
    getSendClient: () => getSendClientRef.current(),
    sendClientRef,
    syncedChannelsRef,
    emoteLoadContextRef: emotes.emoteLoadContextRef,
    selfStatesRef,
    roomsRef: roomStore.roomsRef,
    appendRoomSystemMessage: timeline.appendRoomSystemMessage,
  })

  const readHandlersRef = React.useRef<ReadClientHandlers>({
    onMessage: () => undefined,
    onClearMsg: () => undefined,
    onClearChat: () => undefined,
    onSystem: () => undefined,
    loadRecentMessages: () => undefined,
    ensureRoomEmotes: () => undefined,
    isRoomEmotesSettled: () => false,
    onRoomReady: () => undefined,
  })
  const sendHandlersRef = React.useRef<SendClientHandlers>({
    onSystemNotice: () => undefined,
    onSelfStateChannel: () => undefined,
    probeSendRestrictions: () => undefined,
  })
  const onSelfStateChangedRef = React.useRef<
    ((state: TwitchSelfChatState) => void) | null
  >(null)

  const connection = useChatConnection({
    roomStore,
    timeline,
    emotes,
    recentMessages,
    send,
    readHandlersRef,
    sendHandlersRef,
    syncedChannelsRef,
    sendClientRef,
    selfStatesRef,
    appendLog,
    onSelfStateChangedRef,
    onRoomsRemoved: chatterStore.removeChannels,
    onAllRoomsCleared: chatterStore.clearAll,
  })

  const eventSub = useTwitchEventSub({
    account,
    roomStore,
    syncedChannelsRef,
    selfStatesRef,
    onTimelineItems: observeTimelineItems,
    onAuthFailure,
    pushComposerNotice: send.pushComposerNotice,
    dismissComposerNotice: send.dismissComposerNotice,
    applySelfModerationRestriction: send.applySelfModerationRestriction,
    trimRoomTimeline: timeline.trimWithLimit,
    showSuspiciousActivityRef,
    hideBlockedUsersRef,
    isUserBlockedRef,
    visibleChannelsRef,
  })
  const pinnedMessages = usePinnedMessages({
    account,
    roomStore,
    emotes,
    chatterStore,
    syncedChannelsRef,
    visibleChannelsRef,
  })

  const notifySelfStateChangedRef = React.useRef(() => {
    eventSub.notifySelfStateChanged()
    pinnedMessages.notifySelfStateChanged()
  })
  const notifyChannelsChangedRef = React.useRef(() => {
    eventSub.notifyChannelsChanged()
    pinnedMessages.notifyChannelsChanged()
  })
  const notifySuspiciousSettingChangedRef = React.useRef(
    eventSub.notifySuspiciousSettingChanged
  )
  const notifyRoomReadyRef = React.useRef((login: string, roomId: string) => {
    eventSub.notifyRoomReady(login, roomId)
    pinnedMessages.notifyRoomReady(login)
  })
  const notifyVisibleChannelsChangedRef = React.useRef(() => {
    eventSub.notifyVisibleChannelsChanged()
    pinnedMessages.notifyVisibleChannelsChanged()
  })
  const syncChannelsBaseRef = React.useRef(connection.syncChannels)

  React.useLayoutEffect(() => {
    const notifyEventSubSelfStateChanged = eventSub.notifySelfStateChanged
    const notifyPinnedSelfStateChanged = pinnedMessages.notifySelfStateChanged
    const notifyEventSubChannelsChanged = eventSub.notifyChannelsChanged
    const notifyPinnedChannelsChanged = pinnedMessages.notifyChannelsChanged
    const notifyEventSubRoomReady = eventSub.notifyRoomReady
    const notifyPinnedRoomReady = pinnedMessages.notifyRoomReady
    const notifyEventSubVisibleChannelsChanged =
      eventSub.notifyVisibleChannelsChanged
    const notifyPinnedVisibleChannelsChanged =
      pinnedMessages.notifyVisibleChannelsChanged

    notifySelfStateChangedRef.current = () => {
      notifyEventSubSelfStateChanged()
      notifyPinnedSelfStateChanged()
    }
    notifyChannelsChangedRef.current = () => {
      notifyEventSubChannelsChanged()
      notifyPinnedChannelsChanged()
    }
    notifySuspiciousSettingChangedRef.current =
      eventSub.notifySuspiciousSettingChanged
    notifyRoomReadyRef.current = (login: string, roomId: string) => {
      notifyEventSubRoomReady(login, roomId)
      notifyPinnedRoomReady(login)
    }
    notifyVisibleChannelsChangedRef.current = () => {
      notifyEventSubVisibleChannelsChanged()
      notifyPinnedVisibleChannelsChanged()
    }
    syncChannelsBaseRef.current = connection.syncChannels
  }, [
    connection.syncChannels,
    eventSub.notifyChannelsChanged,
    eventSub.notifyRoomReady,
    eventSub.notifySelfStateChanged,
    eventSub.notifySuspiciousSettingChanged,
    eventSub.notifyVisibleChannelsChanged,
    pinnedMessages.notifyChannelsChanged,
    pinnedMessages.notifyRoomReady,
    pinnedMessages.notifySelfStateChanged,
    pinnedMessages.notifyVisibleChannelsChanged,
  ])

  const lastSelfModFlagsRef = React.useRef(
    new Map<string, { isModerator: boolean; isBroadcaster: boolean }>()
  )
  React.useLayoutEffect(() => {
    onSelfStateChangedRef.current = (state) => {
      const previous = lastSelfModFlagsRef.current.get(state.channel)
      const next = {
        isModerator: state.isModerator,
        isBroadcaster: state.isBroadcaster,
      }
      lastSelfModFlagsRef.current.set(state.channel, next)
      if (
        !previous ||
        previous.isModerator !== next.isModerator ||
        previous.isBroadcaster !== next.isBroadcaster
      ) {
        notifySelfStateChangedRef.current()
      }
    }
  }, [])

  const routing = useMessageRouting({
    roomStore,
    timeline,
    emotes,
    send,
    syncedChannelsRef,
    hideBlockedUsersRef,
    isUserBlockedRef,
    clearChatWhenInstructedRef,
    selfStatesRef,
    updateSelfState: connection.updateSelfState,
    onChatMessageRef,
    onTimelineItems: observeTimelineItems,
  })

  React.useLayoutEffect(() => {
    getSendClientRef.current = connection.getSendClient
  }, [connection.getSendClient])

  React.useLayoutEffect(() => {
    readHandlersRef.current = {
      onMessage: routing.routeMessageToRoom,
      onClearMsg: routing.routeClearMsg,
      onClearChat: routing.routeClearChat,
      onSystem: routing.routeSystemMessage,
      loadRecentMessages: recentMessages.loadRecentMessages,
      ensureRoomEmotes: emotes.ensureRoomEmotes,
      isRoomEmotesSettled: emotes.isRoomEmotesSettled,
      onRoomReady: (login, roomId) => {
        notifyRoomReadyRef.current(login, roomId)
      },
    }
  }, [
    emotes.ensureRoomEmotes,
    emotes.isRoomEmotesSettled,
    recentMessages.loadRecentMessages,
    routing.routeClearChat,
    routing.routeClearMsg,
    routing.routeMessageToRoom,
    routing.routeSystemMessage,
  ])

  React.useLayoutEffect(() => {
    sendHandlersRef.current = {
      onSystemNotice: send.handleSendSystemNotice,
      onSelfStateChannel: send.clearChannelSendBlock,
      probeSendRestrictions: send.probeSendRestrictions,
    }
  }, [
    send.clearChannelSendBlock,
    send.handleSendSystemNotice,
    send.probeSendRestrictions,
  ])

  const syncChannels = React.useCallback(
    (logins: string[], options?: TwitchChatConnectOptions) => {
      const result = syncChannelsBaseRef.current(logins, options)
      notifyChannelsChangedRef.current()
      return result
    },
    []
  )

  const setClearChatWhenInstructed = React.useCallback((enabled: boolean) => {
    clearChatWhenInstructedRef.current = enabled
  }, [])

  const setHideBlockedUsers = React.useCallback((enabled: boolean) => {
    hideBlockedUsersRef.current = enabled
  }, [])

  const setShowSuspiciousActivity = React.useCallback((enabled: boolean) => {
    if (showSuspiciousActivityRef.current === enabled) {
      return
    }
    showSuspiciousActivityRef.current = enabled
    notifySuspiciousSettingChangedRef.current()
  }, [])

  const setVisibleSharedChatChannels = React.useCallback((logins: string[]) => {
    const next = logins
      .map((login) => normalizeChannelLogin(login))
      .filter(Boolean)
    const previous = visibleChannelsRef.current
    if (
      next.length === previous.length &&
      next.every((login, index) => login === previous[index])
    ) {
      return
    }
    visibleChannelsRef.current = next
    notifyVisibleChannelsChangedRef.current()
  }, [])

  const setIsUserBlocked = React.useCallback(
    (checker: (userId?: string | null, login?: string | null) => boolean) => {
      isUserBlockedRef.current = checker
    },
    []
  )

  const {
    deletedMessagesBehaviorRef,
    setDeletedMessagesBehavior: applyDeletedMessagesBehavior,
  } = timeline
  const { handleDeletedMessagesBehaviorChange } = recentMessages

  const setDeletedMessagesBehavior = React.useCallback(
    (behavior: DeletedMessagesBehavior) => {
      const previous = deletedMessagesBehaviorRef.current
      applyDeletedMessagesBehavior(behavior)
      handleDeletedMessagesBehaviorChange(previous, behavior)
    },
    [
      applyDeletedMessagesBehavior,
      deletedMessagesBehaviorRef,
      handleDeletedMessagesBehaviorChange,
    ]
  )

  const isChannelSynced = React.useCallback(
    (login: string) => {
      return syncedChannelsRef.current.includes(normalizeChannelLogin(login))
    },
    [syncedChannelsRef]
  )

  const { routeMessageToRoom, routeSystemMessage } = routing
  const { queueLiveRoomTimeline } = timeline

  const injectChatMessage = React.useCallback(
    (message: TwitchChatMessage) => {
      const login = normalizeChannelLogin(message.channel)
      if (!isChannelSynced(login)) {
        return false
      }

      routeMessageToRoom(message)
      return true
    },
    [isChannelSynced, routeMessageToRoom]
  )

  const injectSystemMessage = React.useCallback(
    (message: TwitchSystemMessage) => {
      const login = message.channel
        ? normalizeChannelLogin(message.channel)
        : null
      if (login && !isChannelSynced(login)) {
        return false
      }

      routeSystemMessage(message)
      return true
    },
    [isChannelSynced, routeSystemMessage]
  )

  const injectAutomodHeldMessage = React.useCallback(
    (login: string, message: TwitchAutomodHeldMessage) => {
      const normalized = normalizeChannelLogin(login)
      if (!isChannelSynced(normalized)) {
        return false
      }

      queueLiveRoomTimeline(normalized, [{ kind: "automod", message }])
      return true
    },
    [isChannelSynced, queueLiveRoomTimeline]
  )

  return {
    connectionState: connection.connectionState,
    sendConnectionState: connection.sendConnectionState,
    logs,
    syncChannels,
    subscribeToRoom: roomStore.subscribeToRoom,
    getRoom: roomStore.getRoom,
    getTimeline: roomStore.getTimeline,
    getRoomId: roomStore.getRoomId,
    subscribeToPinnedMessage: pinnedMessages.subscribe,
    getPinnedMessage: pinnedMessages.getPinnedMessage,
    refreshPinnedMessage: pinnedMessages.refreshPinnedMessage,
    clearPinnedMessage: pinnedMessages.clearPinnedMessage,
    subscribeToChatters: chatterStore.subscribe,
    getChatters: chatterStore.getChatters,
    getChatterByLogin: chatterStore.getChatterByLogin,
    searchChatters: chatterStore.searchChatters,
    isRecentMessagesLoading: recentMessages.isRecentMessagesLoading,
    subscribeToRecentMessagesLoading:
      recentMessages.subscribeToRecentMessagesLoading,
    setEmoteLoadContext: emotes.setEmoteLoadContext,
    setRecentMessagesEnabled: recentMessages.setRecentMessagesEnabled,
    setLiveEmoteUpdatesEnabled: sevenTvLiveUpdates.setLiveEmoteUpdatesEnabled,
    setLiveMessageLimit: timeline.setLiveMessageLimit,
    setDeletedMessagesBehavior,
    setClearChatWhenInstructed,
    setHideBlockedUsers,
    setShowSuspiciousActivity,
    setVisibleSharedChatChannels,
    setIsUserBlocked,
    setChatCommandActions: send.setChatCommandActions,
    purgeMessagesFromBlockedUsers: timeline.purgeMessagesFromBlockedUsers,
    purgeMessagesFromUser: timeline.purgeMessagesFromUser,
    markChatMessageDeleted: routing.markChatMessageDeleted,
    injectChatMessage,
    injectSystemMessage,
    injectAutomodHeldMessage,
    getComposerEmoteCatalog: emotes.getComposerEmoteCatalog,
    ensureComposerEmotes: emotes.ensureComposerEmotes,
    isComposerEmotesLoading: emotes.isComposerEmotesLoading,
    getSelfChatState: connection.getSelfChatState,
    getChannelSendBlock: send.getChannelSendBlock,
    registerSendOutcomeListener: send.registerSendOutcomeListener,
    replayPendingComposerNotice: send.replayPendingComposerNotice,
    dismissComposerNotice: send.dismissComposerNotice,
    refreshEmotes: emotes.refreshEmotes,
    rehydrateAllRoomTimelines: emotes.rehydrateAllRoomTimelines,
    sendMessage: send.sendMessage,
    sendActionMessage: send.sendActionMessage,
    runChatCommand: send.runChatCommand,
    ensureSharedChatSourceProfiles: eventSub.ensureSharedChatSourceProfiles,
  }
}
