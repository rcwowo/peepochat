import * as React from "react"

import { ChatPane } from "@/components/chat/chat-pane"
import { ChatSplitLayout } from "@/components/chat/chat-split-layout"
import type { TwitchTimelineItem } from "@/hooks/twitch/use-twitch-chat"
import type { TwitchSelfChatState } from "@/hooks/twitch/use-twitch-chat"
import type { CachedChatView } from "@/hooks/chat/use-chat-layout"
import type { ChatBadgeCatalog } from "@/lib/chat/chat-badges"
import type { ResolvedMemberBadge } from "@/lib/chat/rcw-badges"
import { useChatFontFamily } from "@/hooks/chat/use-chat-font"
import {
  CHAT_EMOTE_SCALE_DEFAULT,
  type ChatConfig,
  type ChatSplitLayoutNode,
  type SplitLayoutEdge,
  type MessageQuickActionsConfig,
  type MessageTimestampFormat,
  type TwitchChannel,
} from "@/lib/peepochat/peepochat-config"
import { usePeepochat } from "@/lib/peepochat/peepochat-context"
import type { TwitchChatRoomState } from "@/hooks/twitch/use-twitch-chat"
import { cn } from "@/lib/utils"

type ChatPaneBindings = {
  timestampFormat: MessageTimestampFormat
  messageQuickActions: MessageQuickActionsConfig
  channelMeta: Map<string, TwitchChannel>
  getTimeline: (login: string) => TwitchTimelineItem[]
  getRoom: (login: string) => TwitchChatRoomState | null
  getRoomId: (login: string) => string | null
  getSelfChatState: (login: string) => TwitchSelfChatState | null
  getBadgeCatalog: (login: string) => ChatBadgeCatalog
  getMemberBadge: (userId: string | null) => ResolvedMemberBadge | null
  hasBadgeSupport: boolean
  showTwitchBadges: boolean
  showMemberBadges: boolean
  account: ReturnType<typeof usePeepochat>["account"]
  loginWithTwitch: ReturnType<typeof usePeepochat>["loginWithTwitch"]
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
        account={bindings.account}
        loginWithTwitch={bindings.loginWithTwitch}
        channelRoomId={bindings.getRoomId(login)}
        selfChatState={bindings.getSelfChatState(login)}
        badgeCatalog={bindings.getBadgeCatalog(login)}
        getMemberBadge={bindings.getMemberBadge}
        showBadgeFallback={!bindings.hasBadgeSupport}
        showTwitchBadges={bindings.showTwitchBadges}
        showMemberBadges={bindings.showMemberBadges}
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
          account={bindings.account}
          loginWithTwitch={bindings.loginWithTwitch}
          channelRoomId={bindings.getRoomId(login)}
          selfChatState={bindings.getSelfChatState(login)}
          badgeCatalog={bindings.getBadgeCatalog(login)}
          getMemberBadge={bindings.getMemberBadge}
          showBadgeFallback={!bindings.hasBadgeSupport}
          showTwitchBadges={bindings.showTwitchBadges}
          showMemberBadges={bindings.showMemberBadges}
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
    () => {
      const emoteScale = chat.emoteScale / CHAT_EMOTE_SCALE_DEFAULT

      return {
        "--chat-font-size": `${chat.fontSizePx}px`,
        "--chat-emote-size": `${Math.round(28 * emoteScale)}px`,
        "--chat-emote-margin": `${(-0.35 * emoteScale).toFixed(3)}rem`,
        ...(cssFontFamily ? { fontFamily: cssFontFamily } : {}),
      } as React.CSSProperties
    },
    [chat.emoteScale, chat.fontSizePx, cssFontFamily]
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
    getRoomId,
    getSelfChatState,
    getBadgeCatalog,
    getMemberBadge,
    hasBadgeSupport,
    account,
    loginWithTwitch,
    removeSplitChannel,
    moveSplitPane,
    resizeSplitPanePath,
  } = usePeepochat()

  const timestampFormat = config.chat.messageTimestampFormat
  const messageQuickActions = config.chat.messageQuickActions
  const showTwitchBadges = config.chat.badges.twitchEnabled
  const showMemberBadges = config.chat.badges.owoMemberEnabled
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
      getRoomId,
      getSelfChatState,
      getBadgeCatalog,
      getMemberBadge,
      hasBadgeSupport,
      showTwitchBadges,
      showMemberBadges,
      account,
      loginWithTwitch,
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
      getRoomId,
      getSelfChatState,
      getBadgeCatalog,
      getMemberBadge,
      hasBadgeSupport,
      showTwitchBadges,
      showMemberBadges,
      account,
      loginWithTwitch,
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
