/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { toast } from "sonner"

import {
  useChatLayout,
  type CachedChatView,
} from "@/hooks/chat/use-chat-layout"
import { usePeepochatConfig } from "@/hooks/peepochat/use-peepochat-config"
import { useTwitchAuth } from "@/hooks/twitch/use-twitch-auth"
import { useTwitchChannels } from "@/hooks/twitch/use-twitch-channels"
import { useChatBadges } from "@/hooks/chat/use-chat-badges"
import { useHighlightActivity } from "@/hooks/chat/use-highlight-activity"
import { useStreamLiveStatus } from "@/hooks/twitch/use-stream-live-status"
import {
  useTwitchChat,
  type TwitchChatRoomState,
  type TwitchTimelineItem,
} from "@/hooks/twitch/use-twitch-chat"
import {
  canShowDesktopNotifications,
  showDesktopNotification,
} from "@/lib/highlights/desktop-notifications"
import type { ChatBadgeCatalog } from "@/lib/chat/chat-badges"
import type {
  AppConfig,
  ChatSplit,
  ChatSplitLayoutNode,
  SplitLayoutEdge,
  MessageTimestampFormat,
  TwitchAccount,
  TwitchChannel,
} from "@/lib/peepochat/peepochat-config"
import {
  setThirdPartyEmoteFetchOptions,
} from "@/lib/chat/chat-emotes"
import type { ComposerEmoteCatalog } from "@/lib/chat/chat-emote-catalog"
import type { TwitchConnectionState } from "@/lib/twitch/twitch-chat"

export type { TwitchTimelineItem }

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
  isSplitLive: (channelLogins: string[]) => boolean
  liveIndicatorsEnabled: boolean
}

export type PeepochatChatContextValue = {
  connectionState: TwitchConnectionState
  rooms: Record<string, TwitchChatRoomState>
  logs: string[]
  getTimeline: (login: string) => TwitchTimelineItem[]
  getRoom: (login: string) => TwitchChatRoomState | null
  getRoomId: (login: string) => string | null
  getBadgeCatalog: (login: string) => ChatBadgeCatalog
  getComposerEmoteCatalog: (login: string) => ComposerEmoteCatalog
  ensureComposerEmotes: (login: string, roomId: string | null) => void
  isComposerEmotesLoading: (login: string) => boolean
  refreshEmotes: (login: string) => Promise<boolean>
  sendChatMessage: (
    login: string,
    message: string,
    reply?: import("@/lib/twitch/twitch-chat").TwitchChatReply | null
  ) => boolean
  canSendChat: boolean
  hasBadgeSupport: boolean
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

/** @deprecated Prefer `usePeepochatSidebarHighlights` for sidebar-only state. */
export const usePeepochatHighlights = usePeepochatSidebarHighlights

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
  const { account, oauthBusy, login, logout, isOAuthConfigured } = useTwitchAuth({
    config,
    updateConfig,
  })
  const hasAccountValue = account !== null
  const onChatMessageRef = React.useRef<
    ((message: import("@/lib/twitch/twitch-chat").TwitchChatMessage) => void) | null
  >(null)
  const onChatMessagesRef = React.useRef<
    | ((messages: import("@/lib/twitch/twitch-chat").TwitchChatMessage[]) => void)
    | null
  >(null)

  const {
    connectionState,
    rooms,
    logs,
    syncChannels,
    getTimeline,
    getRoom,
    getRoomId,
    setEmoteLoadContext,
    setRecentMessagesEnabled,
    setLiveMessageLimit,
    getComposerEmoteCatalog,
    ensureComposerEmotes,
    isComposerEmotesLoading,
    refreshEmotes,
    sendMessage,
  } = useTwitchChat({ onChatMessageRef, onChatMessagesRef })
  const { getBadgeCatalog, loadBadgesForRoom, hasBadgeSupport } =
    useChatBadges(account)

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

  const highlightActivity = useHighlightActivity({
    config,
    accountLogin: account?.login ?? null,
    visibleChannelLogins,
    isSplitView,
    activeSplitId,
    splits: savedSplits,
    onFocusChannel: (login) => {
      setActiveChannelBase(login)
    },
  })

  React.useEffect(() => {
    onChatMessageRef.current = highlightActivity.handleIncomingMessage
    onChatMessagesRef.current = highlightActivity.handleIncomingMessages
  }, [
    highlightActivity.handleIncomingMessage,
    highlightActivity.handleIncomingMessages,
  ])

  const { isLive: isChannelLive } = useStreamLiveStatus({
    channelLogins,
    enabled: config.highlights.liveIndicatorsEnabled && hasAccountValue,
    accessToken: account?.accessToken,
    clientId: account?.clientId,
    onChannelWentLive: (login, title) => {
      if (!config.highlights.livePushNotificationsEnabled) return
      if (!canShowDesktopNotifications()) return
      if (document.visibilityState !== "hidden") return

      showDesktopNotification({
        title: `#${login} is live`,
        body: title,
        tag: `live:${login}`,
        onClick: () => setActiveChannelBase(login),
      })
    },
  })

  const setActiveChannel = React.useCallback(
    (login: string) => {
      highlightActivity.markChannelRead(login)
      setActiveChannelBase(login)
    },
    [highlightActivity, setActiveChannelBase]
  )

  const selectSplitWithRead = React.useCallback(
    (splitId: string) => {
      highlightActivity.markSplitRead(splitId)
      selectSplit(splitId)
    },
    [highlightActivity, selectSplit]
  )

  React.useEffect(() => {
    if (!ready || needsOnboarding) return
    if (!hasAccountValue) return
    if (channelLogins.length === 0) return

    void syncAllChannels(channelLogins).catch((error) => {
      if (error instanceof Error && error.message !== "Channel list updated") {
        toast.error(error.message)
      }
    })
  }, [
    channelLogins,
    hasAccountValue,
    needsOnboarding,
    ready,
    syncAllChannels,
  ])

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
      })),
    [channels]
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

  React.useEffect(() => {
    setRecentMessagesEnabled(config.chat.recentMessagesEnabled)
  }, [config.chat.recentMessagesEnabled, setRecentMessagesEnabled])

  React.useEffect(() => {
    setLiveMessageLimit(config.chat.maxLiveMessagesPerChannel)
  }, [config.chat.maxLiveMessagesPerChannel, setLiveMessageLimit])

  const emotesOptionsReadyRef = React.useRef(false)
  const emoteProviderFlagsRef = React.useRef("")
  const refreshEmotesRef = React.useRef(refreshEmotes)

  React.useEffect(() => {
    refreshEmotesRef.current = refreshEmotes
  }, [refreshEmotes])

  React.useEffect(() => {
    const flagsKey = [
      config.chat.emotes.bttvEnabled,
      config.chat.emotes.ffzEnabled,
      config.chat.emotes.seventvEnabled,
    ].join(":")

    setThirdPartyEmoteFetchOptions({
      bttvEnabled: config.chat.emotes.bttvEnabled,
      ffzEnabled: config.chat.emotes.ffzEnabled,
      seventvEnabled: config.chat.emotes.seventvEnabled,
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
  ])

  const canSendChat = Boolean(account?.accessToken && connectionState.connected)

  const getBadgeCatalogForChannel = React.useCallback(
    (login: string) => getBadgeCatalog(getRoomId(login)),
    [getBadgeCatalog, getRoomId]
  )

  const handleLogout = React.useCallback(() => {
    void syncChannels([])
    logout()
    requireOnboarding()
  }, [logout, requireOnboarding, syncChannels])

  const autoConnectedRef = React.useRef(false)

  React.useEffect(() => {
    if (!ready || needsOnboarding || autoConnectedRef.current) return
    if (!hasAccountValue) return

    autoConnectedRef.current = true

    if (
      channelLogins.length > 0 &&
      !connectionState.connected &&
      !connectionState.connecting
    ) {
      void syncAllChannels(channelLogins).catch((err) => {
        toast.error(
          err instanceof Error ? err.message : "Connection failed"
        )
      })
    }
  }, [ready, needsOnboarding]) // eslint-disable-line react-hooks/exhaustive-deps

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
        isSplitLive,
      ]
    )

  const chatValue = React.useMemo<PeepochatChatContextValue>(
    () => ({
      connectionState,
      rooms,
      logs,
      getTimeline,
      getRoom,
      getRoomId,
      getBadgeCatalog: getBadgeCatalogForChannel,
      getComposerEmoteCatalog,
      ensureComposerEmotes,
      isComposerEmotesLoading,
      refreshEmotes,
      sendChatMessage: sendMessage,
      canSendChat,
      hasBadgeSupport,
    }),
    [
      connectionState,
      rooms,
      logs,
      getTimeline,
      getRoom,
      getRoomId,
      getBadgeCatalogForChannel,
      getComposerEmoteCatalog,
      ensureComposerEmotes,
      isComposerEmotesLoading,
      refreshEmotes,
      sendMessage,
      canSendChat,
      hasBadgeSupport,
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
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date)
  }

  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })

  if (format === "12-hour-meridiem") {
    return formatter.format(date)
  }

  return formatter
    .formatToParts(date)
    .filter((part) => part.type !== "dayPeriod")
    .map((part) => part.value)
    .join("")
    .trim()
}
