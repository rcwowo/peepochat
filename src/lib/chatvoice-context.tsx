import * as React from "react"
import { toast } from "sonner"

import { useChatLayout } from "@/hooks/use-chat-layout"
import { useChatvoiceConfig } from "@/hooks/use-chatvoice-config"
import { useTwitchAuth } from "@/hooks/use-twitch-auth"
import { useTwitchChannels } from "@/hooks/use-twitch-channels"
import { useChatBadges } from "@/hooks/use-chat-badges"
import {
  useTwitchChat,
  type TwitchChatRoomState,
  type TwitchTimelineItem,
} from "@/hooks/use-twitch-chat"
import type { ChatBadgeCatalog } from "@/lib/chat-badges"
import type {
  AppConfig,
  ChatSplit,
  MessageTimestampFormat,
  TwitchAccount,
  TwitchChannel,
} from "@/lib/chatvoice-config"
import { getAccount, hasAccount } from "@/lib/chatvoice-config"
import type { ComposerEmoteCatalog } from "@/lib/chat-emote-catalog"
import type { TwitchConnectionState } from "@/lib/twitch-chat"

export type { TwitchTimelineItem }

export type ChatvoiceConfigContextValue = {
  config: AppConfig
  ready: boolean
  needsOnboarding: boolean
  completeOnboarding: () => void
  requireOnboarding: () => void
  updateConfig: ReturnType<typeof useChatvoiceConfig>["updateConfig"]
  restoreBackup: ReturnType<typeof useChatvoiceConfig>["restoreBackup"]
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

export type ChatvoiceChatContextValue = {
  connectionState: TwitchConnectionState
  rooms: Record<string, TwitchChatRoomState>
  logs: string[]
  savedSplits: ChatSplit[]
  activeSplitId: string | null
  sidebarOrder: string[]
  splitChannels: string[]
  isSplitView: boolean
  channelsInSplits: Set<string>
  visibleChannelLogins: string[]
  getTimeline: (login: string) => TwitchTimelineItem[]
  getRoom: (login: string) => TwitchChatRoomState | null
  getRoomId: (login: string) => string | null
  getBadgeCatalog: (login: string) => ChatBadgeCatalog
  getComposerEmoteCatalog: (login: string) => ComposerEmoteCatalog
  ensureComposerEmotes: (login: string, roomId: string | null) => void
  sendChatMessage: (login: string, message: string) => boolean
  canSendChat: boolean
  hasBadgeSupport: boolean
  selectSplit: (splitId: string) => void
  openSplitView: (channels: string[]) => void
  addSplitChannel: (login: string) => void
  removeSplitChannel: (login: string) => void
  unsplit: (splitId: string) => void
  reorderSidebar: (activeId: string, overId: string) => void
}

export type ChatvoiceContextValue = ChatvoiceConfigContextValue &
  ChatvoiceChatContextValue

const ChatvoiceConfigContext =
  React.createContext<ChatvoiceConfigContextValue | null>(null)
const ChatvoiceChatContext =
  React.createContext<ChatvoiceChatContextValue | null>(null)

export function useChatvoiceSettings() {
  const context = React.useContext(ChatvoiceConfigContext)
  if (!context) {
    throw new Error(
      "useChatvoiceSettings must be used within a ChatvoiceProvider"
    )
  }
  return context
}

export function useChatvoice() {
  const config = React.useContext(ChatvoiceConfigContext)
  const chat = React.useContext(ChatvoiceChatContext)
  if (!config || !chat) {
    throw new Error("useChatvoice must be used within a ChatvoiceProvider")
  }
  return { ...config, ...chat }
}

export function ChatvoiceProvider({ children }: { children: React.ReactNode }) {
  const {
    config,
    ready,
    needsOnboarding,
    completeOnboarding,
    requireOnboarding,
    updateConfig,
    restoreBackup,
  } = useChatvoiceConfig()
  const { account, oauthBusy, login, logout, isOAuthConfigured } = useTwitchAuth({
    config,
    updateConfig,
  })
  const {
    connectionState,
    rooms,
    logs,
    syncChannels,
    getTimeline,
    getRoom,
    getRoomId,
    setEmoteLoadContext,
    getComposerEmoteCatalog,
    ensureComposerEmotes,
    sendMessage,
  } = useTwitchChat()
  const { getBadgeCatalog, loadBadgesForRoom, hasBadgeSupport } =
    useChatBadges(account)

  const connectOptions = React.useMemo(
    () => {
      const twitchAccount = getAccount(config)
      return {
        accessToken: twitchAccount?.accessToken,
        nick: twitchAccount?.login,
      }
    },
    [config]
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
    sidebarOrder,
    splitChannels,
    isSplitView,
    channelsInSplits,
    visibleChannelLogins,
    navigateToChannel,
    selectSplit,
    openSplitView,
    addSplitChannel,
    removeSplitChannel,
    unsplit,
    reorderSidebar,
  } = useChatLayout({ config, updateConfig })

  const {
    channels,
    activeChannelLogin,
    setActiveChannel: setActiveChannelLogin,
    addChannel,
    removeChannel,
  } = useTwitchChannels({
    config,
    updateConfig,
    onActiveChannelChange: navigateToChannel,
  })

  const setActiveChannel = React.useCallback(
    (login: string) => {
      setActiveChannelLogin(login)
    },
    [setActiveChannelLogin]
  )

  const channelLogins = React.useMemo(
    () => channels.map((channel) => channel.login),
    [channels]
  )

  React.useEffect(() => {
    if (!ready || needsOnboarding) return
    if (!hasAccount(config)) return
    if (channelLogins.length === 0) return

    void syncAllChannels(channelLogins).catch((error) => {
      if (error instanceof Error && error.message !== "Channel list updated") {
        toast.error(error.message)
      }
    })
  }, [channelLogins, config, needsOnboarding, ready, syncAllChannels])

  React.useEffect(() => {
    for (const login of visibleChannelLogins) {
      loadBadgesForRoom(getRoomId(login))
    }
  }, [getRoomId, loadBadgesForRoom, visibleChannelLogins])

  const channelHints = React.useMemo(
    () =>
      channels.map((channel) => ({
        login: channel.login,
        displayName: channel.displayName,
        profileImageUrl: channel.profileImageUrl,
      })),
    [channels]
  )

  React.useEffect(() => {
    setEmoteLoadContext({
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
    account?.displayName,
    account?.id,
    account?.login,
    channelHints,
    setEmoteLoadContext,
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
    if (!hasAccount(config)) return

    autoConnectedRef.current = true

    if (
      channelLogins.length > 0 &&
      config.twitch.autoConnect &&
      !connectionState.connected &&
      !connectionState.connecting
    ) {
      toast.promise(syncAllChannels(channelLogins), {
        loading: "Connecting to Twitch chat…",
        success: "Connected to Twitch chat",
        error: (err) =>
          err instanceof Error ? err.message : "Connection failed",
      })
    }
  }, [ready, needsOnboarding]) // eslint-disable-line react-hooks/exhaustive-deps

  const configValue = React.useMemo<ChatvoiceConfigContextValue>(
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

  const chatValue = React.useMemo<ChatvoiceChatContextValue>(
    () => ({
      connectionState,
      rooms,
      logs,
      savedSplits,
      activeSplitId,
      sidebarOrder,
      splitChannels,
      isSplitView,
      channelsInSplits,
      visibleChannelLogins,
      getTimeline,
      getRoom,
      getRoomId,
      getBadgeCatalog: getBadgeCatalogForChannel,
      getComposerEmoteCatalog,
      ensureComposerEmotes,
      sendChatMessage: sendMessage,
      canSendChat,
      hasBadgeSupport,
      selectSplit,
      openSplitView,
      addSplitChannel,
      removeSplitChannel,
      unsplit,
      reorderSidebar,
    }),
    [
      connectionState,
      rooms,
      logs,
      savedSplits,
      activeSplitId,
      sidebarOrder,
      splitChannels,
      isSplitView,
      channelsInSplits,
      visibleChannelLogins,
      getTimeline,
      getRoom,
      getRoomId,
      getBadgeCatalogForChannel,
      getComposerEmoteCatalog,
      ensureComposerEmotes,
      sendMessage,
      canSendChat,
      hasBadgeSupport,
      selectSplit,
      openSplitView,
      addSplitChannel,
      removeSplitChannel,
      unsplit,
      reorderSidebar,
    ]
  )

  return (
    <ChatvoiceConfigContext.Provider value={configValue}>
      <ChatvoiceChatContext.Provider value={chatValue}>
        {children}
      </ChatvoiceChatContext.Provider>
    </ChatvoiceConfigContext.Provider>
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
