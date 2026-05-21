import * as React from "react"
import { toast } from "sonner"

import { useChatvoiceConfig } from "@/hooks/use-chatvoice-config"
import { useTwitchChat, type TwitchTimelineItem } from "@/hooks/use-twitch-chat"
import type { AppConfig, MessageTimestampFormat } from "@/lib/chatvoice-config"
import type { TwitchConnectionState } from "@/lib/twitch-chat"

export type ChatvoiceConfigContextValue = {
  config: AppConfig
  ready: boolean
  needsOnboarding: boolean
  completeOnboarding: () => void
  updateConfig: ReturnType<typeof useChatvoiceConfig>["updateConfig"]
  restoreBackup: ReturnType<typeof useChatvoiceConfig>["restoreBackup"]
}

export type ChatvoiceChatContextValue = {
  connectionState: TwitchConnectionState
  timeline: TwitchTimelineItem[]
  logs: string[]
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
    updateConfig,
    restoreBackup,
  } = useChatvoiceConfig()
  const {
    connectionState,
    timeline,
    logs,
    startConnection: startChatConnection,
    stopConnection: stopChatConnection,
  } = useTwitchChat()

  const startConnection = React.useCallback(
    (channel: string) => startChatConnection(channel),
    [startChatConnection]
  )

  const stopConnection = React.useCallback(() => {
    stopChatConnection()
  }, [stopChatConnection])

  const autoConnectedRef = React.useRef(false)

  React.useEffect(() => {
    if (!ready || needsOnboarding || autoConnectedRef.current) return
    autoConnectedRef.current = true

    const channel = config.twitch.channel.trim()
    if (
      channel &&
      config.twitch.autoConnect &&
      !connectionState.connected &&
      !connectionState.connecting
    ) {
      toast.promise(startConnection(channel), {
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
      updateConfig,
      restoreBackup,
    }),
    [
      config,
      ready,
      needsOnboarding,
      completeOnboarding,
      updateConfig,
      restoreBackup,
    ]
  )

  const chatValue = React.useMemo<ChatvoiceChatContextValue>(
    () => ({
      connectionState,
      timeline,
      logs,
      startConnection,
      stopConnection,
    }),
    [connectionState, timeline, logs, startConnection, stopConnection]
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
