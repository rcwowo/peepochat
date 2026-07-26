import * as React from "react"
import { toast } from "sonner"

import {
  useChatLayout,
  type CachedChatView,
} from "@/hooks/chat-ui/use-chat-layout"
import { usePeepochatConfig } from "@/hooks/peepochat/use-peepochat-config"
import { useBlockedUsers } from "@/hooks/twitch/use-blocked-users"
import { useTwitchAuth } from "@/hooks/twitch/use-twitch-auth"
import { useTwitchChannels } from "@/hooks/twitch/use-twitch-channels"
import { useChatBadges } from "@/hooks/chat-ui/use-chat-badges"
import { useRcwBadges } from "@/hooks/chat-ui/use-rcw-badges"
import { useHighlightActivity } from "@/hooks/chat-ui/use-highlight-activity"
import { useStreamLiveStatus } from "@/hooks/twitch/use-stream-live-status"
import {
  useTwitchChat,
  isSyncChannelsSupersededError,
} from "@/hooks/twitch/use-twitch-chat"
import type { TwitchChannelSendBlock } from "@/lib/chat/chat-send-notice"
import type {
  TwitchAutomodHeldMessage,
  TwitchChatRoomState,
  TwitchSelfChatState,
  TwitchTimelineItem,
} from "@/lib/twitch/twitch-chat-types"
import type {
  TwitchChatMessage,
  TwitchSystemMessage,
} from "@/lib/twitch/twitch-chat"
import {
  canShowDesktopNotifications,
  shouldShowDesktopNotification,
  showDesktopNotification,
} from "@/lib/highlights/desktop-notifications"
import { playAlertSound } from "@/lib/highlights/alert-sounds"
import {
  addLiveNotification,
  formatLiveNotificationText,
} from "@/lib/highlights/notification-center"
import type { ChatBadgeCatalog } from "@/lib/chat/chat-badges"
import type { ResolvedMemberBadge } from "@/lib/chat/rcw-badges"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import type {
  AppConfig,
  ChatSplit,
  ChatSplitLayoutNode,
  SplitLayoutEdge,
  MessageTimestampFormat,
  TwitchAccount,
  TwitchChannel,
} from "@/lib/peepochat/peepochat-config"
import { findSplitContainingChannel } from "@/lib/peepochat/peepochat-config"
import {
  setSeventvEmoteRenderOptions,
  setThirdPartyEmoteFetchOptions,
} from "@/lib/chat/chat-emotes"
import type { ChatSendResult } from "@/lib/chat/chat-send"
import type { SendOutcomeEvent } from "@/lib/chat/chat-send-notice"
import type { ComposerEmoteCatalog } from "@/lib/chat/chat-emote-catalog"
import type { TwitchConnectionState } from "@/lib/twitch/twitch-chat"

export type { TwitchTimelineItem } from "@/lib/twitch/twitch-chat-types"

export type PeepochatConfigContextValue = {
  config: AppConfig
  ready: boolean
  needsOnboarding: boolean
  completeOnboarding: () => void
  requireOnboarding: () => void
  updateConfig: ReturnType<typeof usePeepochatConfig>["updateConfig"]
  restoreBackup: ReturnType<typeof usePeepochatConfig>["restoreBackup"]
  account: TwitchAccount | null
  oauthBusy: boolean
  isOAuthConfigured: boolean
  loginWithTwitch: () => void
  logout: () => void
  channels: TwitchChannel[]
  activeChannelLogin: string
  setActiveChannel: (login: string) => void
  addChannel: (login: string) => Promise<string>
  removeChannel: (login: string) => void
}

export type PeepochatLayoutContextValue = {
  savedSplits: ChatSplit[]
  activeSplitId: string | null
  activeSplitLayout?: ChatSplitLayoutNode
  sidebarOrder: string[]
  splitChannels: string[]
  isSplitView: boolean
  channelsInSplits: Set<string>
  visibleChannelLogins: string[]
  keepChatViewsMounted: boolean
  cachedChatViews: CachedChatView[]
  activeChatViewKey: string | null
  mountedChannelLogins: string[]
  selectSplit: (splitId: string) => void
  openSplitView: (channels: string[]) => void
  addSplitChannel: (login: string) => void
  removeSplitChannel: (login: string) => void
  unsplit: (splitId: string) => void
  reorderSidebar: (activeId: string, overId: string) => void
  moveSplitPane: (
    splitId: string,
    sourceChannel: string,
    targetChannel: string,
    edge: SplitLayoutEdge
  ) => void
  resizeSplitPanePath: (
    splitId: string,
    path: number[],
    sizes: number[]
  ) => void
}

export type PeepochatSidebarHighlightsContextValue = {
  hasUnreadForChannel: (login: string) => boolean
  hasUnreadForSplit: (splitId: string, channelLogins: string[]) => boolean
  hasPingForChannel: (login: string) => boolean
  hasPingForSplit: (splitId: string, channelLogins: string[]) => boolean
  markChannelRead: (login: string) => void
  markSplitRead: (splitId: string) => void
  isChannelLive: (login: string) => boolean
  getChannelLiveStream: (
    login: string
  ) => import("@/lib/twitch/twitch-api").TwitchLiveStream | null
  isSplitLive: (channelLogins: string[]) => boolean
  liveIndicatorsEnabled: boolean
}

export type PeepochatChatContextValue = {
  connectionState: TwitchConnectionState
  sendConnectionState: TwitchConnectionState
  logs: string[]
  subscribeToRoom: (login: string, listener: () => void) => () => void
  getTimeline: (login: string) => TwitchTimelineItem[]
  getRoom: (login: string) => TwitchChatRoomState | null
  getRoomId: (login: string) => string | null
  getSelfChatState: (login: string) => TwitchSelfChatState | null
  getChannelSendBlock: (login: string) => TwitchChannelSendBlock | null
  registerSendOutcomeListener: (
    listener: (event: SendOutcomeEvent) => void
  ) => () => void
  getBadgeCatalog: (login: string) => ChatBadgeCatalog
  getMemberBadge: (userId: string | null) => ResolvedMemberBadge | null
  getComposerEmoteCatalog: (login: string) => ComposerEmoteCatalog
  ensureComposerEmotes: (login: string, roomId: string | null) => void
  isComposerEmotesLoading: (login: string) => boolean
  refreshEmotes: (login: string) => Promise<boolean>
  sendChatMessage: (
    login: string,
    message: string,
    reply?: import("@/lib/twitch/twitch-chat").TwitchChatReply | null
  ) => ChatSendResult
  sendActionMessage: (
    login: string,
    message: string,
    reply?: import("@/lib/twitch/twitch-chat").TwitchChatReply | null
  ) => ChatSendResult
  executeChatCommand: (
    login: string,
    input: string
  ) => Promise<import("@/lib/chat/chat-commands").ChatCommandResult>
  markChatMessageDeleted: (login: string, messageId: string) => void
  injectChatMessage: (message: TwitchChatMessage) => boolean
  injectSystemMessage: (message: TwitchSystemMessage) => boolean
  injectAutomodHeldMessage: (
    login: string,
    message: TwitchAutomodHeldMessage
  ) => boolean
  canSendChat: boolean
  hasBadgeSupport: boolean
  hideBlockedUsers: boolean
  isUserBlocked: (userId?: string | null, login?: string | null) => boolean
  blockUser: (userId: string, login: string) => Promise<void>
  unblockUser: (userId: string, login?: string) => Promise<void>
}

export type PeepochatContextValue = PeepochatConfigContextValue &
  PeepochatLayoutContextValue &
  PeepochatChatContextValue

const PeepochatConfigContext =
  React.createContext<PeepochatConfigContextValue | null>(null)
const PeepochatLayoutContext =
  React.createContext<PeepochatLayoutContextValue | null>(null)
const PeepochatChatContext =
  React.createContext<PeepochatChatContextValue | null>(null)
const PeepochatSidebarHighlightsContext =
  React.createContext<PeepochatSidebarHighlightsContextValue | null>(null)

export function usePeepochatSettings() {
  const context = React.useContext(PeepochatConfigContext)
  if (!context) {
    throw new Error(
      "usePeepochatSettings must be used within a PeepochatProvider"
    )
  }
  return context
}

export function usePeepochatLayout() {
  const config = React.useContext(PeepochatConfigContext)
  const layout = React.useContext(PeepochatLayoutContext)
  if (!config || !layout) {
    throw new Error(
      "usePeepochatLayout must be used within a PeepochatProvider"
    )
  }
  return { ...config, ...layout }
}

export function usePeepochatSidebarHighlights() {
  const context = React.useContext(PeepochatSidebarHighlightsContext)
  if (!context) {
    throw new Error(
      "usePeepochatSidebarHighlights must be used within a PeepochatProvider"
    )
  }
  return context
}

export function usePeepochatChat() {
  const context = React.useContext(PeepochatChatContext)
  if (!context) {
    throw new Error("usePeepochatChat must be used within a PeepochatProvider")
  }
  return context
}

export function usePeepochat() {
  const config = React.useContext(PeepochatConfigContext)
  const layout = React.useContext(PeepochatLayoutContext)
  const chat = React.useContext(PeepochatChatContext)
  const highlights = React.useContext(PeepochatSidebarHighlightsContext)
  if (!config || !layout || !chat || !highlights) {
    throw new Error("usePeepochat must be used within a PeepochatProvider")
  }
  return { ...config, ...layout, ...chat, ...highlights }
}

export function PeepochatProvider({ children }: { children: React.ReactNode }) {
  const {
    config,
    ready,
    needsOnboarding,
    completeOnboarding,
    requireOnboarding,
    updateConfig,
    restoreBackup,
  } = usePeepochatConfig()
  const {
    account,
    oauthBusy,
    login,
    logout,
    invalidateSession,
    isOAuthConfigured,
  } = useTwitchAuth({
    config,
    updateConfig,
  })
  const hasAccountValue = account !== null
  const onChatMessageRef = React.useRef<
    | ((message: import("@/lib/twitch/twitch-chat").TwitchChatMessage) => void)
    | null
  >(null)

  const {
    connectionState,
    sendConnectionState,
    logs,
    subscribeToRoom,
    syncChannels,
    getTimeline,
    getRoom,
    getRoomId,
    getSelfChatState,
    getChannelSendBlock,
    registerSendOutcomeListener,
    setEmoteLoadContext,
    setRecentMessagesEnabled,
    setLiveEmoteUpdatesEnabled,
    setLiveMessageLimit,
    setDeletedMessagesBehavior,
    setClearChatWhenInstructed,
    setHideBlockedUsers,
    setIsUserBlocked,
    setChatCommandActions,
    purgeMessagesFromBlockedUsers,
    purgeMessagesFromUser,
    markChatMessageDeleted,
    injectChatMessage,
    injectSystemMessage,
    injectAutomodHeldMessage,
    getComposerEmoteCatalog,
    ensureComposerEmotes,
    isComposerEmotesLoading,
    refreshEmotes,
    rehydrateAllRoomTimelines,
    sendMessage,
    sendActionMessage,
    runChatCommand,
  } = useTwitchChat({
    account,
    onAuthFailure: invalidateSession,
    onChatMessageRef,
  })
  const {
    isBlocked,
    blockUser: blockUserBase,
    unblockUser: unblockUserBase,
  } = useBlockedUsers(account)
  const { getBadgeCatalog, loadBadgesForRoom, hasBadgeSupport } =
    useChatBadges(account)
  const { getMemberBadge } = useRcwBadges()

  const connectOptions = React.useMemo(
    () => ({
      accessToken: account?.accessToken,
      nick: account?.login,
    }),
    [account?.accessToken, account?.login]
  )

  const syncAllChannels = React.useCallback(
    (channelLogins: string[]) => {
      return syncChannels(channelLogins, connectOptions)
    },
    [connectOptions, syncChannels]
  )

  const {
    savedSplits,
    activeSplitId,
    activeSplitLayout,
    sidebarOrder,
    splitChannels,
    isSplitView,
    channelsInSplits,
    visibleChannelLogins,
    keepChatViewsMounted,
    cachedChatViews,
    activeChatViewKey,
    mountedChannelLogins,
    selectSplit,
    openSplitView,
    addSplitChannel,
    removeSplitChannel,
    unsplit,
    reorderSidebar,
    moveSplitPane,
    resizeSplitPanePath,
  } = useChatLayout({ config, updateConfig })

  const {
    channels,
    activeChannelLogin,
    setActiveChannel: setActiveChannelBase,
    addChannel,
    removeChannel,
  } = useTwitchChannels({
    config,
    updateConfig,
  })

  const channelLogins = React.useMemo(
    () => channels.map((channel) => channel.login),
    [channels]
  )

  const focusChannelRef = React.useRef<(login: string) => void>((login) => {
    setActiveChannelBase(login)
  })

  const visibleChannelLoginsRef = React.useRef(visibleChannelLogins)
  React.useEffect(() => {
    visibleChannelLoginsRef.current = visibleChannelLogins
  }, [visibleChannelLogins])

  const highlightActivity = useHighlightActivity({
    config,
    accountLogin: account?.login ?? null,
    visibleChannelLogins,
    isSplitView,
    activeSplitId,
    splits: savedSplits,
    onFocusChannel: (login) => {
      focusChannelRef.current(login)
    },
  })

  React.useEffect(() => {
    onChatMessageRef.current = highlightActivity.handleIncomingMessage
  }, [highlightActivity.handleIncomingMessage])

  const { isLive: isChannelLive, getLiveStream } = useStreamLiveStatus({
    channelLogins,
    enabled: config.highlights.liveIndicatorsEnabled && hasAccountValue,
    accessToken: account?.accessToken,
    clientId: account?.clientId,
    onChannelWentLive: (login, title, gameName) => {
      if (!config.highlights.livePushNotificationsEnabled) return

      const normalizedLogin = normalizeChannelLogin(login)
      const isVisible = visibleChannelLoginsRef.current.some(
        (channelLogin) =>
          normalizeChannelLogin(channelLogin) === normalizedLogin
      )

      addLiveNotification({
        channelLogin: login,
        title,
        gameName,
        wentLiveAt: new Date().toISOString(),
        readAt: isVisible ? new Date().toISOString() : null,
      })

      if (config.highlights.doNotDisturbEnabled) return

      if (!canShowDesktopNotifications()) return
      if (!shouldShowDesktopNotification()) return

      const channel = channels.find(
        (entry) => normalizeChannelLogin(entry.login) === login
      )
      const channelName = channel?.displayName || channel?.login || login

      showDesktopNotification({
        title: `${channelName} just went live!`,
        body: formatLiveNotificationText(gameName ?? "", title),
        tag: `live:${login}`,
        icon: channel?.profileImageUrl || undefined,
        onClick: () => focusChannelRef.current(login),
      })
      void playAlertSound({
        useDefaultSounds: config.highlights.useDefaultSounds,
        customId: config.highlights.liveSoundCustomId,
        kind: "live",
      })
    },
  })

  const setActiveChannel = React.useCallback(
    (login: string) => {
      const normalized = normalizeChannelLogin(login)
      const split = findSplitContainingChannel(savedSplits, normalized)

      if (split) {
        highlightActivity.markSplitRead(split.id)
        updateConfig((current) => ({
          ...current,
          twitch: {
            ...current.twitch,
            activeChannelLogin: normalized,
          },
          layout: { ...current.layout, activeSplitId: split.id },
        }))
        return
      }

      highlightActivity.markChannelRead(normalized)
      setActiveChannelBase(normalized)
    },
    [highlightActivity, savedSplits, setActiveChannelBase, updateConfig]
  )

  React.useEffect(() => {
    focusChannelRef.current = setActiveChannel
  }, [setActiveChannel])

  const selectSplitWithRead = React.useCallback(
    (splitId: string) => {
      highlightActivity.markSplitRead(splitId)
      selectSplit(splitId)
    },
    [highlightActivity, selectSplit]
  )

  React.useEffect(() => {
    setRecentMessagesEnabled(config.chat.recentMessagesEnabled)
  }, [config.chat.recentMessagesEnabled, setRecentMessagesEnabled])

  React.useEffect(() => {
    setLiveEmoteUpdatesEnabled(
      config.chat.emotes.seventvEnabled &&
        config.chat.emotes.liveEmoteUpdatesEnabled
    )
  }, [
    config.chat.emotes.liveEmoteUpdatesEnabled,
    config.chat.emotes.seventvEnabled,
    setLiveEmoteUpdatesEnabled,
  ])

  React.useEffect(() => {
    setLiveMessageLimit(config.chat.maxLiveMessagesPerChannel)
  }, [config.chat.maxLiveMessagesPerChannel, setLiveMessageLimit])

  React.useEffect(() => {
    setDeletedMessagesBehavior(config.chat.deletedMessagesBehavior)
  }, [config.chat.deletedMessagesBehavior, setDeletedMessagesBehavior])

  React.useEffect(() => {
    setClearChatWhenInstructed(config.chat.clearChatWhenInstructed)
  }, [config.chat.clearChatWhenInstructed, setClearChatWhenInstructed])

  React.useEffect(() => {
    setHideBlockedUsers(config.chat.hideBlockedUsers)
  }, [config.chat.hideBlockedUsers, setHideBlockedUsers])

  React.useEffect(() => {
    setIsUserBlocked(isBlocked)
  }, [isBlocked, setIsUserBlocked])

  const blockUser = React.useCallback(
    async (userId: string, login: string) => {
      await blockUserBase(userId, login)
      if (config.chat.hideBlockedUsers) {
        purgeMessagesFromUser(userId, login)
      }
    },
    [blockUserBase, config.chat.hideBlockedUsers, purgeMessagesFromUser]
  )

  const unblockUser = React.useCallback(
    async (userId: string, login?: string) => {
      await unblockUserBase(userId, login)
    },
    [unblockUserBase]
  )

  React.useEffect(() => {
    setChatCommandActions({ blockUser, unblockUser })
  }, [blockUser, setChatCommandActions, unblockUser])

  React.useEffect(() => {
    if (!config.chat.hideBlockedUsers) {
      return
    }

    purgeMessagesFromBlockedUsers((message) =>
      isBlocked(message.userId, message.userName)
    )
  }, [config.chat.hideBlockedUsers, isBlocked, purgeMessagesFromBlockedUsers])

  React.useEffect(() => {
    if (!ready || needsOnboarding) return
    if (!hasAccountValue) return

    void syncAllChannels(channelLogins).catch((error) => {
      if (isSyncChannelsSupersededError(error)) {
        return
      }

      toast.error(error instanceof Error ? error.message : "Connection failed")
    })
  }, [channelLogins, hasAccountValue, needsOnboarding, ready, syncAllChannels])

  React.useEffect(() => {
    for (const login of mountedChannelLogins) {
      loadBadgesForRoom(getRoomId(login))
    }
  }, [getRoomId, loadBadgesForRoom, mountedChannelLogins])

  const channelHints = React.useMemo(
    () =>
      channels.map((channel) => ({
        login: channel.login,
        displayName: channel.displayName,
        profileImageUrl: channel.profileImageUrl,
        roomId: getRoomId(channel.login) ?? undefined,
      })),
    [channels, getRoomId]
  )

  const channelLoginsRef = React.useRef(channelLogins)

  const setEmoteLoadContextRef = React.useRef(setEmoteLoadContext)

  React.useEffect(() => {
    channelLoginsRef.current = channelLogins
  }, [channelLogins])

  React.useEffect(() => {
    setEmoteLoadContextRef.current = setEmoteLoadContext
  }, [setEmoteLoadContext])

  React.useEffect(() => {
    setEmoteLoadContextRef.current({
      accessToken: account?.accessToken,
      clientId: account?.clientId,
      userId: account?.id,
      userLogin: account?.login,
      userDisplayName: account?.displayName,
      channelHints,
    })
  }, [
    account?.accessToken,
    account?.clientId,
    account?.id,
    account?.login,
    account?.displayName,
    channelHints,
  ])

  const emotesOptionsReadyRef = React.useRef(false)
  const emoteProviderFlagsRef = React.useRef("")
  const zeroWidthEnabledRef = React.useRef(
    config.chat.emotes.zeroWidthEmotesEnabled
  )
  const refreshEmotesRef = React.useRef(refreshEmotes)
  const rehydrateAllRoomTimelinesRef = React.useRef(rehydrateAllRoomTimelines)

  React.useEffect(() => {
    refreshEmotesRef.current = refreshEmotes
  }, [refreshEmotes])

  React.useEffect(() => {
    rehydrateAllRoomTimelinesRef.current = rehydrateAllRoomTimelines
  }, [rehydrateAllRoomTimelines])

  React.useEffect(() => {
    setSeventvEmoteRenderOptions({
      zeroWidthEnabled: config.chat.emotes.zeroWidthEmotesEnabled,
    })

    if (
      emotesOptionsReadyRef.current &&
      zeroWidthEnabledRef.current !== config.chat.emotes.zeroWidthEmotesEnabled
    ) {
      rehydrateAllRoomTimelinesRef.current()
    }

    zeroWidthEnabledRef.current = config.chat.emotes.zeroWidthEmotesEnabled
  }, [config.chat.emotes.zeroWidthEmotesEnabled])

  React.useEffect(() => {
    const flagsKey = [
      config.chat.emotes.bttvEnabled,
      config.chat.emotes.ffzEnabled,
      config.chat.emotes.seventvEnabled,
      config.chat.emotes.showUnlistedEmotes,
    ].join(":")

    setThirdPartyEmoteFetchOptions({
      bttvEnabled: config.chat.emotes.bttvEnabled,
      ffzEnabled: config.chat.emotes.ffzEnabled,
      seventvEnabled: config.chat.emotes.seventvEnabled,
      showUnlistedEmotes: config.chat.emotes.showUnlistedEmotes,
    })

    if (!emotesOptionsReadyRef.current) {
      emotesOptionsReadyRef.current = true
      emoteProviderFlagsRef.current = flagsKey
      return
    }

    if (emoteProviderFlagsRef.current === flagsKey) {
      return
    }

    emoteProviderFlagsRef.current = flagsKey

    for (const login of channelLoginsRef.current) {
      void refreshEmotesRef.current(login)
    }
  }, [
    config.chat.emotes.bttvEnabled,
    config.chat.emotes.ffzEnabled,
    config.chat.emotes.seventvEnabled,
    config.chat.emotes.showUnlistedEmotes,
  ])

  const canSendChat = Boolean(
    account?.accessToken &&
    connectionState.connected &&
    sendConnectionState.connected
  )

  const executeChatCommand = React.useCallback(
    (login: string, input: string) => runChatCommand(login, input, account),
    [account, runChatCommand]
  )

  const getBadgeCatalogForChannel = React.useCallback(
    (login: string) => getBadgeCatalog(getRoomId(login)),
    [getBadgeCatalog, getRoomId]
  )

  const handleLogout = React.useCallback(() => {
    void syncChannels([])
    logout()
    requireOnboarding()
  }, [logout, requireOnboarding, syncChannels])

  const configValue = React.useMemo<PeepochatConfigContextValue>(
    () => ({
      config,
      ready,
      needsOnboarding,
      completeOnboarding,
      requireOnboarding,
      updateConfig,
      restoreBackup,
      account,
      oauthBusy,
      isOAuthConfigured,
      loginWithTwitch: login,
      logout: handleLogout,
      channels,
      activeChannelLogin,
      setActiveChannel,
      addChannel,
      removeChannel,
    }),
    [
      config,
      ready,
      needsOnboarding,
      completeOnboarding,
      requireOnboarding,
      updateConfig,
      restoreBackup,
      account,
      oauthBusy,
      isOAuthConfigured,
      login,
      handleLogout,
      channels,
      activeChannelLogin,
      setActiveChannel,
      addChannel,
      removeChannel,
    ]
  )

  const layoutValue = React.useMemo<PeepochatLayoutContextValue>(
    () => ({
      savedSplits,
      activeSplitId,
      activeSplitLayout,
      sidebarOrder,
      splitChannels,
      isSplitView,
      channelsInSplits,
      visibleChannelLogins,
      keepChatViewsMounted,
      cachedChatViews,
      activeChatViewKey,
      mountedChannelLogins,
      selectSplit: selectSplitWithRead,
      openSplitView,
      addSplitChannel,
      removeSplitChannel,
      unsplit,
      reorderSidebar,
      moveSplitPane,
      resizeSplitPanePath,
    }),
    [
      savedSplits,
      activeSplitId,
      activeSplitLayout,
      sidebarOrder,
      splitChannels,
      isSplitView,
      channelsInSplits,
      visibleChannelLogins,
      keepChatViewsMounted,
      cachedChatViews,
      activeChatViewKey,
      mountedChannelLogins,
      selectSplitWithRead,
      openSplitView,
      addSplitChannel,
      removeSplitChannel,
      unsplit,
      reorderSidebar,
      moveSplitPane,
      resizeSplitPanePath,
    ]
  )

  const isSplitLive = React.useCallback(
    (logins: string[]) =>
      config.highlights.liveIndicatorsEnabled &&
      logins.some((login) => isChannelLive(login)),
    [config.highlights.liveIndicatorsEnabled, isChannelLive]
  )

  const getChannelLiveStream = React.useCallback(
    (login: string) => {
      if (!config.highlights.liveIndicatorsEnabled) return null
      if (!isChannelLive(login)) return null
      return getLiveStream(login)
    },
    [config.highlights.liveIndicatorsEnabled, isChannelLive, getLiveStream]
  )

  const sidebarHighlightsValue =
    React.useMemo<PeepochatSidebarHighlightsContextValue>(
      () => ({
        hasUnreadForChannel: highlightActivity.hasUnreadForChannel,
        hasUnreadForSplit: highlightActivity.hasUnreadForSplit,
        hasPingForChannel: highlightActivity.hasPingForChannel,
        hasPingForSplit: highlightActivity.hasPingForSplit,
        markChannelRead: highlightActivity.markChannelRead,
        markSplitRead: highlightActivity.markSplitRead,
        isChannelLive: (login) =>
          config.highlights.liveIndicatorsEnabled && isChannelLive(login),
        getChannelLiveStream,
        isSplitLive,
        liveIndicatorsEnabled: config.highlights.liveIndicatorsEnabled,
      }),
      [
        config.highlights.liveIndicatorsEnabled,
        highlightActivity.hasUnreadForChannel,
        highlightActivity.hasUnreadForSplit,
        highlightActivity.hasPingForChannel,
        highlightActivity.hasPingForSplit,
        highlightActivity.markChannelRead,
        highlightActivity.markSplitRead,
        isChannelLive,
        getChannelLiveStream,
        isSplitLive,
      ]
    )

  const chatValue = React.useMemo<PeepochatChatContextValue>(
    () => ({
      connectionState,
      sendConnectionState,
      logs,
      subscribeToRoom,
      getTimeline,
      getRoom,
      getRoomId,
      getSelfChatState,
      getChannelSendBlock,
      registerSendOutcomeListener,
      getBadgeCatalog: getBadgeCatalogForChannel,
      getMemberBadge,
      getComposerEmoteCatalog,
      ensureComposerEmotes,
      isComposerEmotesLoading,
      refreshEmotes,
      sendChatMessage: sendMessage,
      sendActionMessage,
      executeChatCommand,
      markChatMessageDeleted,
      injectChatMessage,
      injectSystemMessage,
      injectAutomodHeldMessage,
      canSendChat,
      hasBadgeSupport,
      hideBlockedUsers: config.chat.hideBlockedUsers,
      isUserBlocked: isBlocked,
      blockUser,
      unblockUser,
    }),
    [
      connectionState,
      sendConnectionState,
      logs,
      subscribeToRoom,
      getTimeline,
      getRoom,
      getRoomId,
      getSelfChatState,
      getChannelSendBlock,
      registerSendOutcomeListener,
      getBadgeCatalogForChannel,
      getMemberBadge,
      getComposerEmoteCatalog,
      ensureComposerEmotes,
      isComposerEmotesLoading,
      refreshEmotes,
      sendMessage,
      sendActionMessage,
      executeChatCommand,
      markChatMessageDeleted,
      injectChatMessage,
      injectSystemMessage,
      injectAutomodHeldMessage,
      canSendChat,
      hasBadgeSupport,
      config.chat.hideBlockedUsers,
      isBlocked,
      blockUser,
      unblockUser,
    ]
  )

  return (
    <PeepochatConfigContext.Provider value={configValue}>
      <PeepochatLayoutContext.Provider value={layoutValue}>
        <PeepochatSidebarHighlightsContext.Provider
          value={sidebarHighlightsValue}
        >
          <PeepochatChatContext.Provider value={chatValue}>
            {children}
          </PeepochatChatContext.Provider>
        </PeepochatSidebarHighlightsContext.Provider>
      </PeepochatLayoutContext.Provider>
    </PeepochatConfigContext.Provider>
  )
}

const timestamp24HourFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

const timestamp12HourFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
})

export function formatMessageTimestamp(
  value: string,
  format: MessageTimestampFormat
) {
  if (format === "none") {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  if (format === "24-hour") {
    return timestamp24HourFormatter.format(date)
  }

  if (format === "12-hour-meridiem") {
    return timestamp12HourFormatter.format(date)
  }

  return timestamp12HourFormatter
    .formatToParts(date)
    .flatMap((part) => (part.type !== "dayPeriod" ? [part.value] : []))
    .join("")
    .trim()
}
