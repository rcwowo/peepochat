import * as React from "react"
import {
  EllipsisIcon,
  ExternalLinkIcon,
  MessagesSquareIcon,
  RefreshCcwIcon,
  XIcon,
} from "lucide-react"

import { ChatComposer } from "@/components/chat/chat-composer"
import { EmoteCardProvider } from "@/components/chat/emote-card-context"
import { ChatMessageRow } from "@/components/chat/chat-message-row"
import { ChatSystemMessage } from "@/components/chat/chat-system-message"
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
  MessageQuickActionsConfig,
  MessageTimestampFormat,
  TwitchAccount,
} from "@/lib/peepochat/peepochat-config"
import { useChannelHighlightedMessageIds } from "@/hooks/chat/use-highlight-activity"
import { usePeepochatChat } from "@/lib/peepochat/peepochat-context"
import { getRecentUserMessageBuckets } from "@/lib/chat/recent-user-messages"
import { cn } from "@/lib/utils"

const CHATVOICE_URL = "https://chatvoice.rcw.lol"
const CHATLOGS_URL = "https://tv.supa.sh/logs"

function reconcileStableRowStripes(
  rowStripes: Map<string, boolean>,
  timeline: TwitchTimelineItem[]
) {
  const visibleIds = timeline.map((entry) => entry.message.id)
  const visibleIdSet = new Set(visibleIds)

  for (const id of rowStripes.keys()) {
    if (!visibleIdSet.has(id)) {
      rowStripes.delete(id)
    }
  }

  const firstKnownIndex = visibleIds.findIndex((id) => rowStripes.has(id))

  if (firstKnownIndex === -1) {
    visibleIds.forEach((id, index) => {
      rowStripes.set(id, index % 2 === 1)
    })
    return rowStripes
  }

  for (let index = firstKnownIndex - 1; index >= 0; index -= 1) {
    const nextStripe = rowStripes.get(visibleIds[index + 1]) ?? false
    rowStripes.set(visibleIds[index], !nextStripe)
  }

  for (let index = firstKnownIndex + 1; index < visibleIds.length; index += 1) {
    const id = visibleIds[index]
    if (!rowStripes.has(id)) {
      const previousStripe = rowStripes.get(visibleIds[index - 1]) ?? false
      rowStripes.set(id, !previousStripe)
    }
  }

  return rowStripes
}

function openExternalTool(url: string) {
  window.open(url, "_blank", "noopener,noreferrer")
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
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold uppercase text-primary">
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
  const { refreshEmotes, getComposerEmoteCatalog } = usePeepochatChat()
  const highlightedMessageIds = useChannelHighlightedMessageIds(channelLogin)
  const composerCatalog = getComposerEmoteCatalog(channelLogin)
  const chatContainerRef = React.useRef<HTMLDivElement>(null)
  const messageListRef = React.useRef<HTMLDivElement>(null)
  const isProgrammaticScrollRef = React.useRef(false)
  const [rowStripeCache] = React.useState(() => new Map<string, boolean>())
  const [isScrollPaused, setIsScrollPaused] = React.useState(false)

  const label = displayName ?? channelLogin
  const rowStripes = React.useMemo(
    () => reconcileStableRowStripes(rowStripeCache, timeline),
    [rowStripeCache, timeline]
  )
  const recentMessagesByUser = React.useMemo(() => {
    return getRecentUserMessageBuckets(timeline)
  }, [timeline])

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = "auto") => {
    const el = chatContainerRef.current
    if (!el) return

    isProgrammaticScrollRef.current = true
    el.scrollTo({ top: el.scrollHeight, behavior })
    requestAnimationFrame(() => {
      isProgrammaticScrollRef.current = false
    })
  }, [])

  const handleChatScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (isProgrammaticScrollRef.current) return

      const el = event.currentTarget
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      const isNearBottom = distanceFromBottom <= 24

      setIsScrollPaused(!isNearBottom)
    },
    []
  )

  React.useLayoutEffect(() => {
    if (!isActive || isScrollPaused) return
    scrollToBottom("auto")
  }, [isActive, timeline, isScrollPaused, scrollToBottom])

  React.useEffect(() => {
    const container = chatContainerRef.current
    const messageList = messageListRef.current
    if (
      !isActive ||
      !container ||
      !messageList ||
      isScrollPaused ||
      typeof ResizeObserver === "undefined"
    ) {
      return
    }

    const observer = new ResizeObserver(() => {
      scrollToBottom("auto")
    })
    observer.observe(messageList)

    return () => {
      observer.disconnect()
    }
  }, [isActive, isScrollPaused, scrollToBottom])

  return (
    <EmoteCardProvider catalog={composerCatalog}>
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
        </div>
        <div
          className="flex shrink-0 items-center gap-2"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {!joined ? (
            <span className="text-xs text-muted-foreground">Connecting…</span>
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
                <DropdownMenuItem onSelect={() => void refreshEmotes(channelLogin)}>
                  Refresh Emotes
                  <RefreshCcwIcon className="ml-auto size-3.5 text-muted-foreground" />
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Tools</DropdownMenuLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onSelect={() =>
                    openExternalTool(`https://www.twitch.tv/${channelLogin}`)
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

      <div className="chat-panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {timeline.length === 0 ? (
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
                {timeline.map((entry) => {
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

                  return (
                    <ChatMessageRow
                      key={entry.message.id}
                      message={entry.message}
                      timestampFormat={timestampFormat}
                      showCopyButton={messageQuickActions.copyEnabled}
                      showReplyButton={messageQuickActions.replyEnabled}
                      account={account}
                      loginWithTwitch={loginWithTwitch}
                      channelRoomId={channelRoomId}
                      selfChatState={selfChatState}
                      recentUserMessages={
                        entry.message.userId
                          ? (recentMessagesByUser.get(`id:${entry.message.userId}`) ?? [])
                          : (recentMessagesByUser.get(
                              `login:${entry.message.userName.toLowerCase()}`
                            ) ?? [])
                      }
                      badgeCatalog={badgeCatalog}
                      getMemberBadge={getMemberBadge}
                      showBadgeFallback={showBadgeFallback}
                      showTwitchBadges={showTwitchBadges}
                      showMemberBadges={showMemberBadges}
                      isHistorical={entry.isHistorical}
                      isAlternateRow={isAlternateRow}
                      pingHighlighted={highlightedMessageIds.has(
                        entry.message.id
                      )}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {timeline.length > 0 && isScrollPaused ? (
            <div className="pointer-events-none absolute right-0 bottom-3 left-0 z-10 flex justify-center px-3">
              <Button
                type="button"
                size="sm"
                className="pointer-events-auto shadow-md"
                onClick={() => {
                  setIsScrollPaused(false)
                  scrollToBottom("smooth")
                }}
              >
                Scrolling Paused
              </Button>
            </div>
          ) : null}
        </div>

        <ChatComposer channelLogin={channelLogin} joined={joined} />
      </div>
    </div>
    </EmoteCardProvider>
  )
}

export const ChatPane = React.memo(ChatPaneInner)
