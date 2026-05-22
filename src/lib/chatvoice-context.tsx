import * as React from "react"
import { toast } from "sonner"

import { useChatvoiceConfig } from "@/hooks/use-chatvoice-config"
import { useTwitchAuth } from "@/hooks/use-twitch-auth"
import { useTwitchChannels } from "@/hooks/use-twitch-channels"
import { useChatBadges } from "@/hooks/use-chat-badges"
import { useTwitchChat, type TwitchTimelineItem } from "@/hooks/use-twitch-chat"
import type { ChatBadgeCatalog } from "@/lib/chat-badges"
import type {
  AppConfig,
  MessageTimestampFormat,
  TwitchAccount,
  TwitchChannel,
} from "@/lib/chatvoice-config"
import {
  getAccount,
  getActiveChannelLogin,
  hasAccount,
} from "@/lib/chatvoice-config"
import type { TwitchConnectionState } from "@/lib/twitch-chat"

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
  timeline: TwitchTimelineItem[]
  logs: string[]
  badgeCatalog: ChatBadgeCatalog
  hasBadgeSupport: boolean
  startConnection: (channel: string) => Promise<string>
  stopConnection: () => void
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
    timeline,
    logs,
    activeRoomId,
    startConnection: startChatConnection,
    stopConnection: stopChatConnection,
  } = useTwitchChat()
  const { catalog: badgeCatalog, loadBadgesForRoom, hasBadgeSupport } =
    useChatBadges(account)

  React.useEffect(() => {
    loadBadgesForRoom(activeRoomId)
  }, [activeRoomId, loadBadgesForRoom])

  const connectToChannel = React.useCallback(
    (channel: string) => {
      const twitchAccount = getAccount(config)
      return startChatConnection(channel, {
        accessToken: twitchAccount?.accessToken,
        nick: twitchAccount?.login,
      })
    },
    [config, startChatConnection]
  )

  const {
    channels,
    activeChannelLogin,
    setActiveChannel,
    addChannel,
    removeChannel,
  } = useTwitchChannels({
    config,
    updateConfig,
    onActiveChannelChange: (login) => {
      toast.promise(connectToChannel(login), {
        loading: `Connecting to #${login}…`,
        success: (ch) => `Connected to #${ch}`,
        error: (err) =>
          err instanceof Error ? err.message : "Connection failed",
      })
    },
  })

  const startConnection = React.useCallback(
    (channel: string) => connectToChannel(channel),
    [connectToChannel]
  )

  const stopConnection = React.useCallback(() => {
    stopChatConnection()
  }, [stopChatConnection])

  const handleLogout = React.useCallback(() => {
    stopConnection()
    logout()
    requireOnboarding()
  }, [logout, requireOnboarding, stopConnection])

  const autoConnectedRef = React.useRef(false)

  React.useEffect(() => {
    if (!ready || needsOnboarding || autoConnectedRef.current) return
    if (!hasAccount(config)) return

    autoConnectedRef.current = true

    const channel = getActiveChannelLogin(config)
    if (
      channel &&
      config.twitch.autoConnect &&
      !connectionState.connected &&
      !connectionState.connecting
    ) {
      toast.promise(connectToChannel(channel), {
        loading: `Connecting to #${channel}…`,
        success: (ch) => `Connected to #${ch}`,
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
      timeline,
      logs,
      badgeCatalog,
      hasBadgeSupport,
      startConnection,
      stopConnection,
    }),
    [
      connectionState,
      timeline,
      logs,
      badgeCatalog,
      hasBadgeSupport,
      startConnection,
      stopConnection,
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
