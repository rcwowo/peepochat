import * as React from "react"

import { ChatPane } from "@/components/chat/chat-pane"
import { ChatViewActiveProvider } from "@/components/chat/chat-view-active"
import { ChatSplitLayout } from "@/components/chat/chat-split-layout"
import { useChannelRoom } from "@/hooks/chat-ui/use-channel-room"
import { useBadgeCatalog } from "@/hooks/chat-ui/use-badge-catalog"
import { useChatViewActive } from "@/hooks/chat-ui/use-chat-view-active"
import type { TwitchSelfChatState } from "@/lib/twitch/twitch-chat-types"
import type { CachedChatView } from "@/hooks/chat-ui/use-chat-layout"
import type { ResolvedMemberBadge } from "@/lib/chat/rcw-badges"
import type { TwitchLiveStream } from "@/lib/twitch/twitch-api"
import { useChatFontFamily } from "@/hooks/chat-ui/use-chat-font"
import { useResizeActivity } from "@/hooks/use-resize-session"
import { getChatPresentationStyle } from "@/lib/chat/chat-presentation-style"
import {
  type ChatConfig,
  type ChatSplitLayoutNode,
  type SplitLayoutEdge,
  type DeletedMessagesBehavior,
  type MessageQuickActionsConfig,
  type MessageTimestampFormat,
  type TwitchChannel,
} from "@/lib/peepochat/peepochat-config"
import {
  usePeepochatChat,
  usePeepochatLayout,
  usePeepochatPlayer,
  usePeepochatSettings,
} from "@/lib/peepochat/peepochat-context"
import { cn } from "@/lib/utils"

type ChatPaneBindings = {
  timestampFormat: MessageTimestampFormat
  messageQuickActions: MessageQuickActionsConfig
  deletedMessagesBehavior: DeletedMessagesBehavior
  highlightPingedMessages: boolean
  channelMeta: Map<string, TwitchChannel>
  getSelfChatState: (login: string) => TwitchSelfChatState | null
  getMemberBadge: (userId: string | null) => ResolvedMemberBadge | null
  hasBadgeSupport: boolean
  showTwitchBadges: boolean
  showMemberBadges: boolean
  showSuspiciousActivity: boolean
  fontSizePx: number
  emoteScale: number
  messageSeparators: boolean
  account: ReturnType<typeof usePeepochatSettings>["account"]
  loginWithTwitch: ReturnType<typeof usePeepochatSettings>["loginWithTwitch"]
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
  openPlayer: (login: string) => void
}

function SingleChannelPane({
  login,
  bindings,
  active = true,
  onClosePlayer,
  streamInfoMode,
  liveStreamOverride,
}: {
  login: string
  bindings: ChatPaneBindings
  active?: boolean
  onClosePlayer?: () => void
  streamInfoMode?: "interactive" | "mobile"
  liveStreamOverride?: TwitchLiveStream | null
}) {
  const resizeActive = useResizeActivity()
  const meta = bindings.channelMeta.get(login)
  const room = useChannelRoom(login, active && !resizeActive, !resizeActive)
  const badgeCatalog = useBadgeCatalog(room?.roomId ?? null)

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <ChatPane
        channelLogin={login}
        displayName={meta?.displayName}
        profileImageUrl={meta?.profileImageUrl}
        timeline={room?.timeline ?? []}
        timestampFormat={bindings.timestampFormat}
        messageQuickActions={bindings.messageQuickActions}
        deletedMessagesBehavior={bindings.deletedMessagesBehavior}
        highlightPingedMessages={bindings.highlightPingedMessages}
        account={bindings.account}
        loginWithTwitch={bindings.loginWithTwitch}
        channelRoomId={room?.roomId ?? null}
        selfChatState={bindings.getSelfChatState(login)}
        badgeCatalog={badgeCatalog}
        getMemberBadge={bindings.getMemberBadge}
        showBadgeFallback={!bindings.hasBadgeSupport}
        showTwitchBadges={bindings.showTwitchBadges}
        showMemberBadges={bindings.showMemberBadges}
        showSuspiciousActivity={bindings.showSuspiciousActivity}
        fontSizePx={bindings.fontSizePx}
        emoteScale={bindings.emoteScale}
        messageSeparators={bindings.messageSeparators}
        chatModes={room?.chatModes}
        joined={room?.joined ?? false}
        onWatchPlayer={bindings.openPlayer}
        onClosePlayer={onClosePlayer}
        streamInfoMode={streamInfoMode}
        liveStreamOverride={liveStreamOverride}
      />
    </div>
  )
}

function SplitChatPane({
  login,
  bindings,
  dragHandleProps,
}: {
  login: string
  bindings: ChatPaneBindings
  dragHandleProps: React.HTMLAttributes<HTMLDivElement>
}) {
  const isActive = useChatViewActive()
  const resizeActive = useResizeActivity()
  const meta = bindings.channelMeta.get(login)
  const room = useChannelRoom(login, isActive && !resizeActive, !resizeActive)
  const badgeCatalog = useBadgeCatalog(room?.roomId ?? null)

  return (
    <ChatPane
      channelLogin={login}
      displayName={meta?.displayName}
      profileImageUrl={meta?.profileImageUrl}
      timeline={room?.timeline ?? []}
      timestampFormat={bindings.timestampFormat}
      messageQuickActions={bindings.messageQuickActions}
      deletedMessagesBehavior={bindings.deletedMessagesBehavior}
      highlightPingedMessages={bindings.highlightPingedMessages}
      account={bindings.account}
      loginWithTwitch={bindings.loginWithTwitch}
      channelRoomId={room?.roomId ?? null}
      selfChatState={bindings.getSelfChatState(login)}
      badgeCatalog={badgeCatalog}
      getMemberBadge={bindings.getMemberBadge}
      showBadgeFallback={!bindings.hasBadgeSupport}
      showTwitchBadges={bindings.showTwitchBadges}
      showMemberBadges={bindings.showMemberBadges}
      showSuspiciousActivity={bindings.showSuspiciousActivity}
      fontSizePx={bindings.fontSizePx}
      emoteScale={bindings.emoteScale}
      messageSeparators={bindings.messageSeparators}
      chatModes={room?.chatModes}
      joined={room?.joined ?? false}
      onWatchPlayer={bindings.openPlayer}
      showRemoveSplit
      onRemoveSplit={bindings.removeSplitChannel}
      dragHandleProps={dragHandleProps}
    />
  )
}

function SplitChannelPanes({
  splitId,
  channels,
  layout,
  bindings,
}: {
  splitId: string
  channels: string[]
  layout?: ChatSplitLayoutNode
  bindings: ChatPaneBindings
}) {
  const renderPane = React.useCallback(
    (login: string, dragHandleProps: React.HTMLAttributes<HTMLDivElement>) => (
      <SplitChatPane
        key={login}
        login={login}
        bindings={bindings}
        dragHandleProps={dragHandleProps}
      />
    ),
    [bindings]
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

const CachedChatViewLayer = React.memo(function CachedChatViewLayer({
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
        "absolute inset-0 flex min-h-0 min-w-0 contain-content",
        isActive ? "z-10" : "pointer-events-none z-0 opacity-0"
      )}
      aria-hidden={!isActive}
      inert={!isActive}
    >
      <ChatViewActiveProvider isActive={isActive}>
        {view.kind === "channel" ? (
          <SingleChannelPane
            login={view.login}
            bindings={bindings}
            active={isActive}
          />
        ) : (
          <SplitChannelPanes
            splitId={view.splitId}
            channels={view.channels}
            layout={view.layout}
            bindings={bindings}
          />
        )}
      </ChatViewActiveProvider>
    </div>
  )
})

function useChatPresentationProps(chat: ChatConfig) {
  const cssFontFamily = useChatFontFamily(chat.fontFamily)

  const style = React.useMemo(
    () =>
      getChatPresentationStyle(
        { fontSizePx: chat.fontSizePx, emoteScale: chat.emoteScale },
        cssFontFamily
      ),
    [chat.emoteScale, chat.fontSizePx, cssFontFamily]
  )

  const className = cn(
    "chat-presentation flex h-full min-h-0 min-w-0 flex-1",
    chat.alternatingRowBackgrounds && "chat-presentation--alternating-rows",
    chat.messageSeparators && "chat-presentation--message-separators"
  )

  return { style, className }
}

export function ChatPage({
  active = true,
  channelOverride,
  onClosePlayer,
  streamInfoMode,
  liveStreamOverride,
}: {
  active?: boolean
  channelOverride?: string
  onClosePlayer?: () => void
  streamInfoMode?: "interactive" | "mobile"
  liveStreamOverride?: TwitchLiveStream | null
} = {}) {
  const { config, channels, activeChannelLogin, account, loginWithTwitch } =
    usePeepochatSettings()
  const {
    activeSplitId,
    activeSplitLayout,
    isSplitView,
    splitChannels,
    visibleChannelLogins,
    keepChatViewsMounted,
    cachedChatViews,
    activeChatViewKey,
    removeSplitChannel,
    moveSplitPane,
    resizeSplitPanePath,
  } = usePeepochatLayout()
  const { getSelfChatState, getMemberBadge, hasBadgeSupport } =
    usePeepochatChat()
  const { openPlayer } = usePeepochatPlayer()

  const timestampFormat = config.chat.messageTimestampFormat
  const messageQuickActions = config.chat.messageQuickActions
  const deletedMessagesBehavior = config.chat.deletedMessagesBehavior
  const highlightPingedMessages = config.highlights.highlightPingedMessages
  const showTwitchBadges = config.chat.badges.twitchEnabled
  const showMemberBadges = config.chat.badges.owoMemberEnabled
  const showSuspiciousActivity = config.chat.showSuspiciousActivity
  const fontSizePx = config.chat.fontSizePx
  const emoteScale = config.chat.emoteScale
  const messageSeparators = config.chat.messageSeparators
  const chatPresentation = useChatPresentationProps(config.chat)

  const channelMeta = React.useMemo(() => {
    return new Map(channels.map((channel) => [channel.login, channel]))
  }, [channels])

  const bindings = React.useMemo<ChatPaneBindings>(
    () => ({
      timestampFormat,
      messageQuickActions,
      deletedMessagesBehavior,
      highlightPingedMessages,
      channelMeta,
      getSelfChatState,
      getMemberBadge,
      hasBadgeSupport,
      showTwitchBadges,
      showMemberBadges,
      showSuspiciousActivity,
      fontSizePx,
      emoteScale,
      messageSeparators,
      account,
      loginWithTwitch,
      removeSplitChannel,
      moveSplitPane,
      resizeSplitPanePath,
      openPlayer,
    }),
    [
      timestampFormat,
      messageQuickActions,
      deletedMessagesBehavior,
      highlightPingedMessages,
      channelMeta,
      getSelfChatState,
      getMemberBadge,
      hasBadgeSupport,
      showTwitchBadges,
      showMemberBadges,
      showSuspiciousActivity,
      fontSizePx,
      emoteScale,
      messageSeparators,
      account,
      loginWithTwitch,
      removeSplitChannel,
      moveSplitPane,
      resizeSplitPanePath,
      openPlayer,
    ]
  )

  if (channelOverride) {
    return (
      <div
        className={chatPresentation.className}
        style={chatPresentation.style}
      >
        <ChatViewActiveProvider isActive={active}>
          <SingleChannelPane
            login={channelOverride}
            bindings={bindings}
            active={active}
            onClosePlayer={onClosePlayer}
            streamInfoMode={streamInfoMode}
            liveStreamOverride={liveStreamOverride}
          />
        </ChatViewActiveProvider>
      </div>
    )
  }

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
            isActive={active && view.key === activeChatViewKey}
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
        <ChatViewActiveProvider isActive={active}>
          <SplitChannelPanes
            splitId={activeSplitId}
            channels={splitChannels}
            layout={activeSplitLayout}
            bindings={bindings}
          />
        </ChatViewActiveProvider>
      </div>
    )
  }

  return (
    <div className={chatPresentation.className} style={chatPresentation.style}>
      <ChatViewActiveProvider isActive={active}>
        <SingleChannelPane
          key={activeChannelLogin}
          login={activeChannelLogin}
          bindings={bindings}
          active={active}
        />
      </ChatViewActiveProvider>
    </div>
  )
}
