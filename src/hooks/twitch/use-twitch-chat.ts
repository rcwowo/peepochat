import * as React from "react"

import {
  useChatConnection,
  type ReadClientHandlers,
  type SendClientHandlers,
} from "@/hooks/twitch/chat/use-chat-connection"
import { useChatEmotes } from "@/hooks/twitch/chat/use-chat-emotes"
import { useChatSend } from "@/hooks/twitch/chat/use-chat-send"
import { useMessageRouting } from "@/hooks/twitch/chat/use-message-routing"
import { useRecentMessages } from "@/hooks/twitch/chat/use-recent-messages"
import { useRoomStore } from "@/hooks/twitch/chat/use-room-store"
import { useTimeline } from "@/hooks/twitch/chat/use-timeline"
import { useLazyRef } from "@/hooks/use-lazy-ref"
import type { TwitchChatClient, TwitchChatMessage } from "@/lib/twitch/twitch-chat"
import type { TwitchSelfChatState } from "@/lib/twitch/twitch-chat-types"

export {
  SYNC_CHANNELS_SUPERSEDED_MESSAGE,
  isSyncChannelsSupersededError,
} from "@/hooks/twitch/chat/types"

export function useTwitchChat(options?: {
  onChatMessageRef?: React.RefObject<
    ((message: TwitchChatMessage) => void) | null
  >
}) {
  const onChatMessageRef = options?.onChatMessageRef

  const hideBlockedUsersRef = React.useRef(true)
  const isUserBlockedRef = React.useRef<
    (userId?: string | null, login?: string | null) => boolean
  >(() => false)
  const clearChatWhenInstructedRef = React.useRef(true)

  const syncedChannelsRef = React.useRef<string[]>([])
  const sendClientRef = React.useRef<TwitchChatClient | null>(null)
  const selfStatesRef = useLazyRef(() => new Map<string, TwitchSelfChatState>())
  const getSendClientRef = React.useRef<() => TwitchChatClient>(() => {
    throw new Error("Send client is not ready")
  })

  const [logs, setLogs] = React.useState<string[]>([])
  const appendLog = React.useCallback((text: string) => {
    setLogs((current) => [text, ...current].slice(0, 20))
  }, [])

  const roomStore = useRoomStore()
  const timeline = useTimeline({
    roomStore,
    hideBlockedUsersRef,
    isUserBlockedRef,
  })
  const emotes = useChatEmotes({ roomStore, appendLog })
  const recentMessages = useRecentMessages({
    roomStore,
    timeline,
    emotes,
    syncedChannelsRef,
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
  })
  const sendHandlersRef = React.useRef<SendClientHandlers>({
    onSystemNotice: () => undefined,
    onSelfStateChannel: () => undefined,
    probeSendRestrictions: () => undefined,
  })

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
  })

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

  return {
    connectionState: connection.connectionState,
    sendConnectionState: connection.sendConnectionState,
    logs,
    syncChannels: connection.syncChannels,
    subscribeToRoom: roomStore.subscribeToRoom,
    getRoom: roomStore.getRoom,
    getTimeline: roomStore.getTimeline,
    getRoomId: roomStore.getRoomId,
    setEmoteLoadContext: emotes.setEmoteLoadContext,
    setRecentMessagesEnabled: recentMessages.setRecentMessagesEnabled,
    setLiveMessageLimit: timeline.setLiveMessageLimit,
    setDeletedMessagesBehavior: timeline.setDeletedMessagesBehavior,
    setClearChatWhenInstructed,
    setHideBlockedUsers,
    setIsUserBlocked,
    setChatCommandActions: send.setChatCommandActions,
    purgeMessagesFromBlockedUsers: timeline.purgeMessagesFromBlockedUsers,
    purgeMessagesFromUser: timeline.purgeMessagesFromUser,
    markChatMessageDeleted: routing.markChatMessageDeleted,
    getComposerEmoteCatalog: emotes.getComposerEmoteCatalog,
    ensureComposerEmotes: emotes.ensureComposerEmotes,
    isComposerEmotesLoading: emotes.isComposerEmotesLoading,
    getSelfChatState: connection.getSelfChatState,
    getChannelSendBlock: send.getChannelSendBlock,
    registerSendOutcomeListener: send.registerSendOutcomeListener,
    refreshEmotes: emotes.refreshEmotes,
    rehydrateAllRoomTimelines: emotes.rehydrateAllRoomTimelines,
    sendMessage: send.sendMessage,
    sendActionMessage: send.sendActionMessage,
    runChatCommand: send.runChatCommand,
  }
}
