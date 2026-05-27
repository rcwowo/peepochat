import * as React from "react"
import {
  EllipsisIcon,
  ExternalLinkIcon,
  MessagesSquareIcon,
  RefreshCcwIcon,
  XIcon,
} from "lucide-react"

import { ChatComposer } from "@/components/chat/chat-composer"
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
import { EmptyState } from "@/components/dashboard-primitives"
import type { TwitchTimelineItem } from "@/hooks/use-twitch-chat"
import type { ChatBadgeCatalog } from "@/lib/chat-badges"
import type { MessageTimestampFormat } from "@/lib/peepochat-config"
import { usePeeepochat } from "@/lib/peepochat-context"
import { cn } from "@/lib/utils"

const CHATVOICE_URL = "https://chatvoice.rcw.lol"
const CHATLOGS_URL = "https://tv.supa.sh/logs"

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
  badgeCatalog: ChatBadgeCatalog
  showBadgeFallback: boolean
  joined?: boolean
  showRemoveSplit?: boolean
  onRemoveSplit?: () => void
  className?: string
}

export function ChatPane({
  channelLogin,
  displayName,
  profileImageUrl,
  timeline,
  timestampFormat,
  badgeCatalog,
  showBadgeFallback,
  joined = true,
  showRemoveSplit = false,
  onRemoveSplit,
  className,
}: ChatPaneProps) {
  const { refreshEmotes } = usePeeepochat()
  const chatContainerRef = React.useRef<HTMLDivElement>(null)
  const messageListRef = React.useRef<HTMLDivElement>(null)
  const isProgrammaticScrollRef = React.useRef(false)
  const [isScrollPaused, setIsScrollPaused] = React.useState(false)

  const label = displayName ?? channelLogin

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
    if (isScrollPaused) return
    scrollToBottom("auto")
  }, [timeline, isScrollPaused, scrollToBottom])

  React.useEffect(() => {
    const container = chatContainerRef.current
    const messageList = messageListRef.current
    if (
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
  }, [isScrollPaused, scrollToBottom])

  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        className
      )}
    >
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2">
          <ChannelPaneAvatar
            login={channelLogin}
            profileImageUrl={profileImageUrl}
          />
          <span className="truncate text-sm font-medium">{label}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
              onClick={onRemoveSplit}
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
                  if (entry.kind === "system") {
                    return (
                      <ChatSystemMessage
                        key={entry.message.id}
                        message={entry.message}
                        timestampFormat={timestampFormat}
                        isHistorical={entry.isHistorical}
                      />
                    )
                  }

                  return (
                    <ChatMessageRow
                      key={entry.message.id}
                      message={entry.message}
                      timestampFormat={timestampFormat}
                      badgeCatalog={badgeCatalog}
                      showBadgeFallback={showBadgeFallback}
                      isHistorical={entry.isHistorical}
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
  )
}
