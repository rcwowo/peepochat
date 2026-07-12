import * as React from "react"
import {
  EllipsisIcon,
  ExternalLinkIcon,
  MessagesSquareIcon,
  RefreshCcwIcon,
  XIcon,
} from "lucide-react"

import { ChatComposer } from "@/components/chat/chat-composer"
import { ChatHoverTooltipProvider } from "@/components/chat/chat-hover-tooltip"
import { EmoteCardProvider } from "@/components/chat/emote-card-context"
import { UserCardProvider } from "@/components/chat/user-card-context"
import type { UserCardTarget } from "@/hooks/twitch/use-user-card"
import { ChatMessageRow } from "@/components/chat/chat-message-row"
import { ChatSystemMessage } from "@/components/chat/chat-system-message"
import {
  ChatPaneLiveBadge,
  ChatPaneLiveInfoBar,
} from "@/components/chat/chat-pane-live"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/shared/dashboard-primitives"
import type { TwitchTimelineItem } from "@/hooks/twitch/use-twitch-chat"
import type { TwitchSelfChatState } from "@/hooks/twitch/use-twitch-chat"
import type { ChatBadgeCatalog } from "@/lib/chat/chat-badges"
import type { ResolvedMemberBadge } from "@/lib/chat/rcw-badges"
import type {
  DeletedMessagesBehavior,
  MessageQuickActionsConfig,
  MessageTimestampFormat,
  TwitchAccount,
} from "@/lib/peepochat/peepochat-config"
import { useChannelMessageHighlights } from "@/hooks/chat/use-highlight-activity"
import {
  usePeepochatChat,
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
import { useChatScroll } from "@/hooks/chat/use-chat-scroll"
import { cn } from "@/lib/utils"

import { openExternalTool, CHATLOGS_URL } from "@/lib/chat/moderation-tools"
import { maskReplyForBlockedUser } from "@/lib/twitch/blocked-users"

const CHATVOICE_URL = "https://chatvoice.rcw.lol"

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
  joined?: boolean
  isActive?: boolean
  showRemoveSplit?: boolean
  onRemoveSplit?: (channelLogin: string) => void
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
  joined = true,
  isActive = true,
  showRemoveSplit = false,
  onRemoveSplit,
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
  const messageHighlights = useChannelMessageHighlights(channelLogin)
  const composerCatalog = getComposerEmoteCatalog(channelLogin)
  const [rowStripeCache] = React.useState(() => new Map<string, boolean>())
  const [rowStripeTimelineCache] = React.useState<
    RowStripeCache<TwitchTimelineItem>
  >(() => ({ timeline: null }))
  const [recentMessagesCache] = React.useState(
    createRecentUserMessageBucketCache
  )
  const [liveInfoExpanded, setLiveInfoExpanded] = React.useState(false)

  const label = displayName ?? channelLogin
  const isLive = isChannelLive(channelLogin)
  const liveStream = isLive ? getChannelLiveStream(channelLogin) : null
  const [prevIsLive, setPrevIsLive] = React.useState(isLive)

  if (isLive !== prevIsLive) {
    setPrevIsLive(isLive)
    if (!isLive) {
      setLiveInfoExpanded(false)
    }
  }

  const visibleTimeline = React.useMemo(() => {
    if (!hideBlockedUsers) {
      return timeline
    }

    return timeline.filter((entry) => {
      if (entry.kind !== "chat") {
        return true
      }

      return !isUserBlocked(entry.message.userId, entry.message.userName)
    })
  }, [hideBlockedUsers, isUserBlocked, timeline])

  const {
    chatContainerRef,
    messageListRef,
    displayedTimeline,
    isScrollPaused,
    handleChatScroll,
    resumeScroll,
  } = useChatScroll({
    timeline: visibleTimeline,
    isActive,
  })

  const rowStripes = React.useMemo(
    () =>
      updateStableRowStripes(
        rowStripeTimelineCache,
        rowStripeCache,
        displayedTimeline
      ),
    [displayedTimeline, rowStripeCache, rowStripeTimelineCache]
  )
  const recentMessagesByUser = React.useMemo(() => {
    return updateRecentUserMessageBuckets(recentMessagesCache, visibleTimeline)
  }, [recentMessagesCache, visibleTimeline])

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
        <div
          className={cn(
            "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
            className
          )}
        >
          <div
            {...dragHandleProps}
            className={cn(
              "flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-3",
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
                  onToggle={() => setLiveInfoExpanded((expanded) => !expanded)}
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
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`${label} channel options`}
                  >
                    <EllipsisIcon className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel>Channel</DropdownMenuLabel>
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      onSelect={() => void refreshEmotes(channelLogin)}
                    >
                      Refresh Emotes
                      <RefreshCcwIcon className="ml-auto size-3.5 text-muted-foreground" />
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Tools</DropdownMenuLabel>
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      onSelect={() =>
                        openExternalTool(
                          `https://www.twitch.tv/${channelLogin}`
                        )
                      }
                    >
                      View Channel
                      <ExternalLinkIcon className="ml-auto size-3.5 text-muted-foreground" />
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        openExternalTool(
                          `${CHATVOICE_URL}/?channel=${encodeURIComponent(channelLogin)}`
                        )
                      }
                    >
                      Open in Chatvoice
                      <ExternalLinkIcon className="ml-auto size-3.5 text-muted-foreground" />
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        openExternalTool(
                          `${CHATLOGS_URL}?c=${encodeURIComponent(channelLogin)}`
                        )
                      }
                    >
                      View Chatlogs
                      <ExternalLinkIcon className="ml-auto size-3.5 text-muted-foreground" />
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
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
            </div>
          </div>

          {liveInfoExpanded && liveStream ? (
            <ChatPaneLiveInfoBar stream={liveStream} />
          ) : null}

          <div className="chat-panel flex min-h-0 flex-1 flex-col overflow-hidden">
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
                  className="chat-scroll flex h-full flex-col overflow-y-auto overscroll-contain"
                >
                  <div ref={messageListRef} className="mt-auto py-1">
                    {displayedTimeline.map((entry) => {
                      const isAlternateRow =
                        rowStripes.get(entry.message.id) ?? false

                      if (entry.kind === "system") {
                        return (
                          <ChatSystemMessage
                            key={entry.message.id}
                            message={entry.message}
                            timestampFormat={timestampFormat}
                            isHistorical={entry.isHistorical}
                            isAlternateRow={isAlternateRow}
                          />
                        )
                      }

                      const messageHighlight = messageHighlights.get(
                        entry.message.id
                      )
                      const displayMessage =
                        hideBlockedUsers &&
                        entry.message.reply &&
                        isUserBlocked(null, entry.message.reply.parentUserName)
                          ? {
                              ...entry.message,
                              reply: maskReplyForBlockedUser(
                                entry.message.reply
                              ),
                            }
                          : entry.message

                      return (
                        <ChatMessageRow
                          key={entry.message.id}
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
                          pingMatchRange={messageHighlight?.matchRange ?? null}
                        />
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

            <ChatComposer channelLogin={channelLogin} joined={joined} />
          </div>
        </div>
        </ChatHoverTooltipProvider>
      </EmoteCardProvider>
    </UserCardProvider>
  )
}

export const ChatPane = React.memo(ChatPaneInner)
