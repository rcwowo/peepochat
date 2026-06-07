import * as React from "react"

import { ChatPane } from "@/components/chat/chat-pane"
import { ChatSplitLayout } from "@/components/chat/chat-split-layout"
import type { TwitchTimelineItem } from "@/hooks/use-twitch-chat"
import type { CachedChatView } from "@/hooks/use-chat-layout"
import type { ChatBadgeCatalog } from "@/lib/chat-badges"
import { useChatFontFamily } from "@/hooks/use-chat-font"
import type {
  ChatConfig,
  ChatSplitLayoutNode,
  SplitLayoutEdge,
  MessageQuickActionsConfig,
  MessageTimestampFormat,
  TwitchChannel,
} from "@/lib/peepochat-config"
import { usePeepochat } from "@/lib/peepochat-context"
import type { TwitchChatRoomState } from "@/hooks/use-twitch-chat"
import { cn } from "@/lib/utils"

type ChatPaneBindings = {
  timestampFormat: MessageTimestampFormat
  messageQuickActions: MessageQuickActionsConfig
  channelMeta: Map<string, TwitchChannel>
  getTimeline: (login: string) => TwitchTimelineItem[]
  getRoom: (login: string) => TwitchChatRoomState | null
  getBadgeCatalog: (login: string) => ChatBadgeCatalog
  hasBadgeSupport: boolean
  removeSplitChannel: (login: string) => void
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

function SingleChannelPane({
  login,
  isActive,
  bindings,
}: {
  login: string
  isActive: boolean
  bindings: ChatPaneBindings
}) {
  const meta = bindings.channelMeta.get(login)
  const room = bindings.getRoom(login)

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <ChatPane
        channelLogin={login}
        displayName={meta?.displayName}
        profileImageUrl={meta?.profileImageUrl}
        timeline={bindings.getTimeline(login)}
        timestampFormat={bindings.timestampFormat}
        messageQuickActions={bindings.messageQuickActions}
        badgeCatalog={bindings.getBadgeCatalog(login)}
        showBadgeFallback={!bindings.hasBadgeSupport}
        joined={room?.joined ?? false}
        isActive={isActive}
      />
    </div>
  )
}

function SplitChannelPanes({
  splitId,
  channels,
  layout,
  isActive,
  bindings,
}: {
  splitId: string
  channels: string[]
  layout?: ChatSplitLayoutNode
  isActive: boolean
  bindings: ChatPaneBindings
}) {
  const renderPane = React.useCallback(
    (login: string, dragHandleProps: React.HTMLAttributes<HTMLDivElement>) => {
      const meta = bindings.channelMeta.get(login)
      const room = bindings.getRoom(login)

      return (
        <ChatPane
          key={login}
          channelLogin={login}
          displayName={meta?.displayName}
          profileImageUrl={meta?.profileImageUrl}
          timeline={bindings.getTimeline(login)}
          timestampFormat={bindings.timestampFormat}
          messageQuickActions={bindings.messageQuickActions}
          badgeCatalog={bindings.getBadgeCatalog(login)}
          showBadgeFallback={!bindings.hasBadgeSupport}
          joined={room?.joined ?? false}
          showRemoveSplit
          onRemoveSplit={bindings.removeSplitChannel}
          isActive={isActive}
          dragHandleProps={dragHandleProps}
        />
      )
    },
    [bindings, isActive]
  )
  const getPanePreview = React.useCallback(
    (login: string) => {
      const meta = bindings.channelMeta.get(login)
      return {
        label: meta?.displayName ?? login,
        profileImageUrl: meta?.profileImageUrl,
      }
    },
    [bindings]
  )

  return (
    <ChatSplitLayout
      splitId={splitId}
      channels={channels}
      layout={layout}
      getPanePreview={getPanePreview}
      renderPane={renderPane}
      onMovePane={bindings.moveSplitPane}
      onResizePath={bindings.resizeSplitPanePath}
    />
  )
}

function CachedChatViewLayer({
  view,
  isActive,
  bindings,
}: {
  view: CachedChatView
  isActive: boolean
  bindings: ChatPaneBindings
}) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex min-h-0 min-w-0",
        !isActive && "hidden"
      )}
      aria-hidden={!isActive}
    >
      {view.kind === "channel" ? (
        <SingleChannelPane
          login={view.login}
          isActive={isActive}
          bindings={bindings}
        />
      ) : (
        <SplitChannelPanes
          splitId={view.splitId}
          channels={view.channels}
          layout={view.layout}
          isActive={isActive}
          bindings={bindings}
        />
      )}
    </div>
  )
}

function useChatPresentationProps(chat: ChatConfig) {
  const cssFontFamily = useChatFontFamily(chat.fontFamily)

  const style = React.useMemo(
    () =>
      ({
        "--chat-font-size": `${chat.fontSizePx}px`,
        ...(cssFontFamily ? { fontFamily: cssFontFamily } : {}),
      }) as React.CSSProperties,
    [chat.fontSizePx, cssFontFamily]
  )

  const className = cn(
    "chat-presentation flex h-full min-h-0 min-w-0 flex-1",
    chat.alternatingRowBackgrounds && "chat-presentation--alternating-rows",
    chat.messageSeparators && "chat-presentation--message-separators"
  )

  return { style, className }
}

export function ChatPage() {
  const {
    config,
    channels,
    activeChannelLogin,
    activeSplitId,
    activeSplitLayout,
    isSplitView,
    splitChannels,
    visibleChannelLogins,
    keepChatViewsMounted,
    cachedChatViews,
    activeChatViewKey,
    getTimeline,
    getRoom,
    getBadgeCatalog,
    hasBadgeSupport,
    removeSplitChannel,
    moveSplitPane,
    resizeSplitPanePath,
  } = usePeepochat()

  const timestampFormat = config.chat.messageTimestampFormat
  const messageQuickActions = config.chat.messageQuickActions
  const chatPresentation = useChatPresentationProps(config.chat)

  const channelMeta = React.useMemo(() => {
    return new Map(channels.map((channel) => [channel.login, channel]))
  }, [channels])

  const bindings = React.useMemo<ChatPaneBindings>(
    () => ({
      timestampFormat,
      messageQuickActions,
      channelMeta,
      getTimeline,
      getRoom,
      getBadgeCatalog,
      hasBadgeSupport,
      removeSplitChannel,
      moveSplitPane,
      resizeSplitPanePath,
    }),
    [
      timestampFormat,
      messageQuickActions,
      channelMeta,
      getTimeline,
      getRoom,
      getBadgeCatalog,
      hasBadgeSupport,
      removeSplitChannel,
      moveSplitPane,
      resizeSplitPanePath,
    ]
  )

  if (visibleChannelLogins.length === 0) {
    return (
      <div
        className={cn(
          chatPresentation.className,
          "items-center justify-center text-sm text-muted-foreground"
        )}
        style={chatPresentation.style}
      >
        Add a channel from the sidebar to start chatting.
      </div>
    )
  }

  if (keepChatViewsMounted && cachedChatViews.length > 0) {
    return (
      <div
        className={cn(chatPresentation.className, "relative")}
        style={chatPresentation.style}
      >
        {cachedChatViews.map((view) => (
          <CachedChatViewLayer
            key={view.key}
            view={view}
            isActive={view.key === activeChatViewKey}
            bindings={bindings}
          />
        ))}
      </div>
    )
  }

  if (isSplitView && activeSplitId) {
    return (
      <div
        className={chatPresentation.className}
        style={chatPresentation.style}
      >
        <SplitChannelPanes
          splitId={activeSplitId}
          channels={splitChannels}
          layout={activeSplitLayout}
          isActive
          bindings={bindings}
        />
      </div>
    )
  }

  return (
    <div
      className={chatPresentation.className}
      style={chatPresentation.style}
    >
      <SingleChannelPane
        login={activeChannelLogin}
        isActive
        bindings={bindings}
      />
    </div>
  )
}
