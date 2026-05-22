import * as React from "react"
import { MessagesSquareIcon } from "lucide-react"

import { ChatMessageRow } from "@/components/chat/chat-message-row"
import { ChatSystemMessage } from "@/components/chat/chat-system-message"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/dashboard-primitives"
import { useChatvoice } from "@/lib/chatvoice-context"

export function ChatPage() {
  const { config, connectionState, timeline, badgeCatalog, hasBadgeSupport } =
    useChatvoice()

  const chatContainerRef = React.useRef<HTMLDivElement>(null)
  const messageListRef = React.useRef<HTMLDivElement>(null)
  const isProgrammaticScrollRef = React.useRef(false)
  const [isScrollPaused, setIsScrollPaused] = React.useState(false)
  const timestampFormat = config.chat.messageTimestampFormat

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
    <div className="flex h-full min-h-0 flex-col">
      <h2 className="mb-1 h-5 shrink-0 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Chat
        {connectionState.connected && connectionState.channel ? (
          <span className="ml-1.5 font-normal text-muted-foreground/70 normal-case">
            #{connectionState.channel}
          </span>
        ) : null}
      </h2>
      <div className="chat-panel relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border">
        {timeline.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={MessagesSquareIcon}
              title="No messages yet"
              description="Once connected, chat messages will appear here."
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
                    />
                  )
                }

                return (
                  <ChatMessageRow
                    key={entry.message.id}
                    message={entry.message}
                    timestampFormat={timestampFormat}
                    badgeCatalog={badgeCatalog}
                    showBadgeFallback={!hasBadgeSupport}
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
    </div>
  )
}
