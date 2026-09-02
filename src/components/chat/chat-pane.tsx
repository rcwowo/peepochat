import * as React from "react"
import {
  EllipsisIcon,
  ExternalLinkIcon,
  MessagesSquareIcon,
  PlayIcon,
  RefreshCcwIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"

import { ChatComposer } from "@/components/chat/chat-composer"
import { ChatChattersPanel } from "@/components/chat/chat-chatters-panel"
import { ChatModesMenu } from "@/components/chat/chat-modes-panel"
import { ChatHoverTooltipProvider } from "@/components/chat/chat-hover-tooltip"
import { useChatViewActive } from "@/hooks/chat-ui/use-chat-view-active"
import { EmoteCardProvider } from "@/components/chat/emote-card-context"
import { UserCardProvider } from "@/components/chat/user-card-context"
import type { UserCardTarget } from "@/lib/chat/user-card"
import { ChatAutomodMessage } from "@/components/chat/chat-automod-message"
import { ChatMessageRow } from "@/components/chat/chat-message-row"
import { ChatSuspiciousMessage } from "@/components/chat/chat-suspicious-message"
import { ChatSystemMessage } from "@/components/chat/chat-system-message"
import {
  ChatPaneLiveBadge,
  ChatPaneLiveInfoBar,
} from "@/components/chat/chat-pane-live"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  MenuPanelActions,
  MenuPanelItem,
  MenuPanelProvider,
  MenuPanelSeparator,
  menuPanelContentClassName,
} from "@/components/ui/menu-panel"
import { EmptyState } from "@/components/chat/empty-state"
import type {
  TwitchSelfChatState,
  TwitchTimelineItem,
} from "@/lib/twitch/twitch-chat-types"
import type { ChatBadgeCatalog } from "@/lib/chat/chat-badges"
import type { TwitchChatModes } from "@/lib/chat/chat-modes"
import type { ResolvedMemberBadge } from "@/lib/chat/rcw-badges"
import type {
  DeletedMessagesBehavior,
  MessageQuickActionsConfig,
  MessageTimestampFormat,
  TwitchAccount,
} from "@/lib/peepochat/peepochat-config"
import type { TwitchLiveStream } from "@/lib/twitch/twitch-api"
import { useChannelMessageHighlights } from "@/hooks/chat-ui/use-highlight-activity"
import {
  usePeepochatChat,
  usePeepochatPlayer,
  usePeepochatSidebarHighlights,
} from "@/lib/peepochat/peepochat-context"
import {
  createRecentUserMessageBucketCache,
  updateRecentUserMessageBuckets,
} from "@/lib/chat/recent-user-messages"
import {
  updateStableRowStripes,
  type RowStripeCache,
} from "@/lib/chat/chat-row-stripes"
import { getChatPresentationMetrics } from "@/lib/chat/chat-presentation-style"
import { useChatScroll } from "@/hooks/chat-ui/use-chat-scroll"
import { useHotkeyRegistry } from "@/hooks/use-hotkey-registry"
import { useResizeActivity } from "@/hooks/use-resize-session"
import { cn } from "@/lib/utils"

import { openExternalTool, CHATLOGS_URL } from "@/lib/chat/moderation-tools"
import { maskReplyForBlockedUser } from "@/lib/twitch/blocked-users"

const CHATVOICE_URL = "https://chatvoice.rcw.lol"

function ChatPaneHotkeyRegistration({
  channelLogin,
  toggleEmotePicker,
  toggleViewerList,
  focusComposer,
}: {
  channelLogin: string
  toggleEmotePicker: () => boolean
  toggleViewerList: () => boolean
  focusComposer: () => void
}) {
  const isActive = useChatViewActive()
  const { registerPane } = useHotkeyRegistry()

  React.useEffect(() => {
    if (!isActive) {
      return
    }

    return registerPane(channelLogin, {
      toggleEmotePicker,
      toggleViewerList,
      focusComposer,
    })
  }, [
    channelLogin,
    focusComposer,
    isActive,
    registerPane,
    toggleEmotePicker,
    toggleViewerList,
  ])

  return null
}

function ChannelPaneAvatar({
  login,
  profileImageUrl,
}: {
  login: string
  profileImageUrl?: string
}) {
  if (profileImageUrl) {
    return (
      <img
        src={profileImageUrl}
        alt=""
        className="size-6 shrink-0 rounded-full object-cover"
      />
    )
  }

  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary uppercase">
      {login.slice(0, 2)}
    </span>
  )
}

type ChatPaneProps = {
  channelLogin: string
  displayName?: string
  profileImageUrl?: string
  timeline: TwitchTimelineItem[]
  timestampFormat: MessageTimestampFormat
  messageQuickActions: MessageQuickActionsConfig
  deletedMessagesBehavior: DeletedMessagesBehavior
  highlightPingedMessages: boolean
  account: TwitchAccount | null
  loginWithTwitch: () => void
  channelRoomId: string | null
  selfChatState: TwitchSelfChatState | null
  badgeCatalog: ChatBadgeCatalog
  getMemberBadge: (userId: string | null) => ResolvedMemberBadge | null
  showBadgeFallback: boolean
  showTwitchBadges: boolean
  showMemberBadges: boolean
  showSuspiciousActivity: boolean
  fontSizePx: number
  emoteScale: number
  messageSeparators: boolean
  chatModes?: TwitchChatModes
  joined?: boolean
  showRemoveSplit?: boolean
  onRemoveSplit?: (channelLogin: string) => void
  onWatchPlayer?: (channelLogin: string) => void
  onClosePlayer?: () => void
  streamInfoMode?: "interactive" | "mobile"
  liveStreamOverride?: TwitchLiveStream | null
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>
  className?: string
}

function ChatPaneInner({
  channelLogin,
  displayName,
  profileImageUrl,
  timeline,
  timestampFormat,
  messageQuickActions,
  deletedMessagesBehavior,
  highlightPingedMessages,
  account,
  loginWithTwitch,
  channelRoomId,
  selfChatState,
  badgeCatalog,
  getMemberBadge,
  showBadgeFallback,
  showTwitchBadges,
  showMemberBadges,
  showSuspiciousActivity,
  fontSizePx,
  emoteScale,
  messageSeparators,
  chatModes,
  joined = true,
  showRemoveSplit = false,
  onRemoveSplit,
  onWatchPlayer,
  onClosePlayer,
  streamInfoMode = "interactive",
  liveStreamOverride,
  dragHandleProps,
  className,
}: ChatPaneProps) {
  const {
    refreshEmotes,
    getComposerEmoteCatalog,
    hideBlockedUsers,
    isUserBlocked,
    blockUser,
    unblockUser,
  } = usePeepochatChat()
  const { isChannelLive, getChannelLiveStream } =
    usePeepochatSidebarHighlights()
  const { playerChannelLogin } = usePeepochatPlayer()
  const isWatching = playerChannelLogin === channelLogin
  const messageHighlights = useChannelMessageHighlights(channelLogin)
  const composerCatalog = getComposerEmoteCatalog(channelLogin)
  const [rowStripeCache] = React.useState(() => new Map<string, boolean>())
  const [rowStripeTimelineCache] = React.useState<
    RowStripeCache<TwitchTimelineItem>
  >(() => ({ timeline: null }))
  const [recentMessagesCache] = React.useState(
    createRecentUserMessageBucketCache
  )
  const [liveInfoExpanded, setLiveInfoExpanded] = React.useState(
    streamInfoMode === "mobile"
  )
  const [chattersOpen, setChattersOpen] = React.useState(false)
  const [emotePickerOpen, setEmotePickerOpen] = React.useState(false)
  const emotePickerOpenRef = React.useRef(false)
  const chattersOpenRef = React.useRef(false)
  const composerInputRef = React.useRef<HTMLTextAreaElement | null>(null)
  const chatPanelRef = React.useRef<HTMLDivElement | null>(null)
  const { rememberFocusedPane } = useHotkeyRegistry()
  const isActive = useChatViewActive()
  const resizeActive = useResizeActivity()

  React.useLayoutEffect(() => {
    const panel = chatPanelRef.current
    if (!panel || !resizeActive) {
      return
    }

    const rect = panel.getBoundingClientRect()
    panel.style.width = `${rect.width}px`
    panel.style.height = `${rect.height}px`
    panel.style.flex = "none"

    return () => {
      panel.style.removeProperty("width")
      panel.style.removeProperty("height")
      panel.style.removeProperty("flex")
    }
  }, [resizeActive])

  React.useEffect(() => {
    emotePickerOpenRef.current = emotePickerOpen
    chattersOpenRef.current = chattersOpen
  }, [chattersOpen, emotePickerOpen])

  const toggleEmotePicker = React.useCallback(() => {
    const next = !emotePickerOpenRef.current
    emotePickerOpenRef.current = next
    setEmotePickerOpen(next)
    return next
  }, [])

  const toggleViewerList = React.useCallback(() => {
    const next = !chattersOpenRef.current
    chattersOpenRef.current = next
    setChattersOpen(next)
    return next
  }, [])

  const focusComposer = React.useCallback(() => {
    composerInputRef.current?.focus()
  }, [])

  const label = displayName ?? channelLogin
  const isLive =
    liveStreamOverride !== undefined
      ? liveStreamOverride !== null
      : isChannelLive(channelLogin)
  const liveStream =
    liveStreamOverride !== undefined
      ? liveStreamOverride
      : isLive
        ? getChannelLiveStream(channelLogin)
        : null
  const visibleTimeline = React.useMemo(() => {
    if (hideBlockedUsers || !showSuspiciousActivity) {
      return timeline.filter((entry) => {
        if (entry.kind === "suspicious" && !showSuspiciousActivity) {
          return false
        }

        if (
          hideBlockedUsers &&
          (entry.kind === "chat" || entry.kind === "suspicious")
        ) {
          return !isUserBlocked(entry.message.userId, entry.message.userName)
        }

        return true
      })
    }

    return timeline
  }, [hideBlockedUsers, isUserBlocked, showSuspiciousActivity, timeline])

  const scrollLayout = React.useMemo(
    () => ({
      metrics: getChatPresentationMetrics({
        fontSizePx,
        emoteScale,
      }),
      timestampFormat,
      messageSeparators,
      showTwitchBadges,
    }),
    [
      emoteScale,
      fontSizePx,
      messageSeparators,
      showTwitchBadges,
      timestampFormat,
    ]
  )

  const {
    chatContainerRef,
    displayedTimeline,
    virtualizer,
    isScrollPaused,
    handleChatScroll,
    resumeScroll,
    notifyComposerResize,
  } = useChatScroll({
    timeline: visibleTimeline,
    channelLogin,
    layout: scrollLayout,
  })

  const rowStripes = React.useMemo(
    () =>
      isActive
        ? updateStableRowStripes(
            rowStripeTimelineCache,
            rowStripeCache,
            displayedTimeline
          )
        : rowStripeCache,
    [displayedTimeline, isActive, rowStripeCache, rowStripeTimelineCache]
  )
  const recentMessagesByUser = React.useMemo(() => {
    if (!isActive) {
      return recentMessagesCache.buckets
    }
    return updateRecentUserMessageBuckets(recentMessagesCache, visibleTimeline)
  }, [isActive, recentMessagesCache, visibleTimeline])

  const getRecentMessagesForUser = React.useCallback(
    (target: UserCardTarget) => {
      if (target.userId) {
        return recentMessagesByUser.get(`id:${target.userId}`) ?? []
      }
      return (
        recentMessagesByUser.get(`login:${target.userName.toLowerCase()}`) ?? []
      )
    },
    [recentMessagesByUser]
  )

  return (
    <UserCardProvider
      account={account}
      channelLogin={channelLogin}
      channelRoomId={channelRoomId}
      selfChatState={selfChatState}
      loginWithTwitch={loginWithTwitch}
      getRecentMessages={getRecentMessagesForUser}
      timestampFormat={timestampFormat}
      isUserBlocked={isUserBlocked}
      blockUser={blockUser}
      unblockUser={unblockUser}
    >
      <EmoteCardProvider catalog={composerCatalog}>
        <ChatHoverTooltipProvider>
          <ChatPaneHotkeyRegistration
            channelLogin={channelLogin}
            toggleEmotePicker={toggleEmotePicker}
            toggleViewerList={toggleViewerList}
            focusComposer={focusComposer}
          />
          <div
            className={cn(
              "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
              className
            )}
          >
            <div
              {...dragHandleProps}
              className={cn(
                "flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border bg-sidebar px-3",
                dragHandleProps?.className
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <ChannelPaneAvatar
                  login={channelLogin}
                  profileImageUrl={profileImageUrl}
                />
                <span className="truncate text-sm font-medium">{label}</span>
                {isLive ? (
                  <ChatPaneLiveBadge
                    expanded={liveInfoExpanded}
                    className={streamInfoMode === "mobile" ? "md:hidden" : ""}
                    onToggle={() =>
                      setLiveInfoExpanded((expanded) => !expanded)
                    }
                  />
                ) : null}
              </div>
              <div
                className="flex shrink-0 items-center gap-2"
                onPointerDown={(event) => event.stopPropagation()}
              >
                {!joined ? (
                  <span className="text-xs text-muted-foreground">
                    Connecting…
                  </span>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      data-chatters-trigger={channelLogin}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`${label} channel options`}
                    >
                      <EllipsisIcon className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className={menuPanelContentClassName()}
                  >
                    <MenuPanelProvider kind="dropdown">
                      <MenuPanelActions
                        actions={[
                          {
                            icon: UsersIcon,
                            label: "Chatters",
                            onSelect: () => {
                              window.requestAnimationFrame(() => {
                                setChattersOpen(true)
                              })
                            },
                          },
                          ...(onWatchPlayer
                            ? [
                                {
                                  icon: PlayIcon,
                                  label: "Watch",
                                  disabled: isWatching,
                                  onSelect: () => onWatchPlayer(channelLogin),
                                },
                              ]
                            : []),
                        ]}
                      />
                      <MenuPanelSeparator />
                      <MenuPanelItem
                        icon={RefreshCcwIcon}
                        label="Reload emotes"
                        onSelect={() => void refreshEmotes(channelLogin)}
                      />
                      <MenuPanelSeparator />
                      <MenuPanelItem
                        icon={ExternalLinkIcon}
                        label="Open channel page"
                        onSelect={() =>
                          openExternalTool(
                            `https://www.twitch.tv/${channelLogin}`
                          )
                        }
                      />
                      <MenuPanelItem
                        icon={ExternalLinkIcon}
                        label="Open chatlogs"
                        onSelect={() =>
                          openExternalTool(
                            `${CHATLOGS_URL}?c=${encodeURIComponent(channelLogin)}`
                          )
                        }
                      />
                      <MenuPanelItem
                        icon={ExternalLinkIcon}
                        label="Open in Chatvoice"
                        onSelect={() =>
                          openExternalTool(
                            `${CHATVOICE_URL}/?channel=${encodeURIComponent(channelLogin)}`
                          )
                        }
                      />
                    </MenuPanelProvider>
                  </DropdownMenuContent>
                </DropdownMenu>
                <ChatModesMenu
                  channelLogin={channelLogin}
                  channelRoomId={channelRoomId}
                  account={account}
                  selfChatState={selfChatState}
                  modes={chatModes}
                />
                {showRemoveSplit && onRemoveSplit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Remove #${channelLogin} from split`}
                    onClick={() => onRemoveSplit(channelLogin)}
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                ) : null}
                {onClosePlayer ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Close player"
                    onClick={onClosePlayer}
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>

            {liveInfoExpanded && liveStream ? (
              <ChatPaneLiveInfoBar
                stream={liveStream}
                className={streamInfoMode === "mobile" ? "md:hidden" : ""}
              />
            ) : null}

            <div
              ref={chatPanelRef}
              className="chat-panel flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <div className="relative min-h-0 flex-1 overflow-hidden">
                {displayedTimeline.length === 0 ? (
                  <div className="flex h-full items-center justify-center p-4">
                    <EmptyState
                      icon={MessagesSquareIcon}
                      title="No messages yet"
                      description={
                        joined
                          ? "Messages will appear here once chat activity starts."
                          : `Connecting to #${channelLogin}…`
                      }
                    />
                  </div>
                ) : (
                  <div
                    ref={chatContainerRef}
                    onScroll={handleChatScroll}
                    className="chat-scroll h-full overflow-y-auto overscroll-contain"
                  >
                    <div
                      className="relative w-full"
                      style={{ height: virtualizer.getTotalSize() }}
                    >
                      {virtualizer.getVirtualItems().map((virtualItem) => {
                        const entry = displayedTimeline[virtualItem.index]
                        if (!entry) {
                          return null
                        }

                        const isAlternateRow =
                          rowStripes.get(entry.message.id) ?? false

                        let row: React.ReactNode

                        if (entry.kind === "system") {
                          row = (
                            <ChatSystemMessage
                              message={entry.message}
                              timestampFormat={timestampFormat}
                              badgeCatalog={badgeCatalog}
                              showTwitchBadges={showTwitchBadges}
                              showBadgeFallback={showBadgeFallback}
                              isHistorical={entry.isHistorical}
                              isAlternateRow={isAlternateRow}
                            />
                          )
                        } else if (entry.kind === "automod") {
                          row = (
                            <ChatAutomodMessage
                              message={entry.message}
                              timestampFormat={timestampFormat}
                              account={account}
                              badgeCatalog={badgeCatalog}
                              showTwitchBadges={showTwitchBadges}
                              showBadgeFallback={showBadgeFallback}
                              isHistorical={entry.isHistorical}
                              isAlternateRow={isAlternateRow}
                            />
                          )
                        } else if (entry.kind === "suspicious") {
                          row = (
                            <ChatSuspiciousMessage
                              message={entry.message}
                              timestampFormat={timestampFormat}
                              deletedMessagesBehavior={deletedMessagesBehavior}
                              badgeCatalog={badgeCatalog}
                              showTwitchBadges={showTwitchBadges}
                              showBadgeFallback={showBadgeFallback}
                              isHistorical={entry.isHistorical}
                              isAlternateRow={isAlternateRow}
                            />
                          )
                        } else {
                          const messageHighlight = messageHighlights.get(
                            entry.message.id
                          )
                          const displayMessage =
                            hideBlockedUsers &&
                            entry.message.reply &&
                            isUserBlocked(
                              null,
                              entry.message.reply.parentUserName
                            )
                              ? {
                                  ...entry.message,
                                  reply: maskReplyForBlockedUser(
                                    entry.message.reply
                                  ),
                                }
                              : entry.message

                          row = (
                            <ChatMessageRow
                              message={displayMessage}
                              timestampFormat={timestampFormat}
                              messageQuickActions={messageQuickActions}
                              deletedMessagesBehavior={deletedMessagesBehavior}
                              account={account}
                              channelRoomId={channelRoomId}
                              selfChatState={selfChatState}
                              badgeCatalog={badgeCatalog}
                              getMemberBadge={getMemberBadge}
                              showBadgeFallback={showBadgeFallback}
                              showTwitchBadges={showTwitchBadges}
                              showMemberBadges={showMemberBadges}
                              isHistorical={entry.isHistorical}
                              isAlternateRow={isAlternateRow}
                              pingHighlighted={
                                highlightPingedMessages &&
                                messageHighlight !== undefined
                              }
                              pingMatchRange={
                                messageHighlight?.matchRange ?? null
                              }
                            />
                          )
                        }

                        return (
                          <div
                            key={virtualItem.key}
                            data-index={virtualItem.index}
                            ref={virtualizer.measureElement}
                            className="absolute top-0 left-0 w-full"
                            style={{
                              transform: `translateY(${virtualItem.start}px)`,
                            }}
                          >
                            {row}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {displayedTimeline.length > 0 && isScrollPaused ? (
                  <div className="pointer-events-none absolute right-0 bottom-3 left-0 z-10 flex justify-center px-3">
                    <Button
                      type="button"
                      size="sm"
                      className="pointer-events-auto shadow-md"
                      onClick={() => resumeScroll("smooth")}
                    >
                      Scrolling Paused
                    </Button>
                  </div>
                ) : null}
              </div>

              <ChatComposer
                channelLogin={channelLogin}
                joined={joined}
                onLayoutChange={notifyComposerResize}
                emotePickerOpen={emotePickerOpen}
                onEmotePickerOpenChange={setEmotePickerOpen}
                account={account}
                active={isActive}
                showTwitchBadges={showTwitchBadges}
                showMemberBadges={showMemberBadges}
                composerInputRef={composerInputRef}
                onComposerFocus={() => rememberFocusedPane(channelLogin)}
              />
            </div>
            <ChatChattersPanel
              channelLogin={channelLogin}
              open={isActive && chattersOpen}
              onOpenChange={setChattersOpen}
            />
          </div>
        </ChatHoverTooltipProvider>
      </EmoteCardProvider>
    </UserCardProvider>
  )
}

export const ChatPane = React.memo(ChatPaneInner)
