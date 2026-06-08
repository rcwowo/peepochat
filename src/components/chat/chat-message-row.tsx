import * as React from "react"

import { ChatBadgeList } from "@/components/chat/chat-badge"
import { ChatMessageBody } from "@/components/chat/chat-message-body"
import { ChatReplyPreview } from "@/components/chat/chat-reply-preview"
import { UserCardPopover } from "@/components/chat/user-card-popover"
import { Button } from "@/components/ui/button"
import type {
  TwitchSelfChatState,
} from "@/hooks/twitch/use-twitch-chat"
import {
  resolveMessageBadges,
  type ChatBadgeCatalog,
} from "@/lib/chat/chat-badges"
import { getReadableUsernameColor } from "@/lib/chat/chat-username"
import type {
  MessageTimestampFormat,
  TwitchAccount,
} from "@/lib/peepochat/peepochat-config"
import { formatMessageTimestamp } from "@/lib/peepochat/peepochat-context"
import type { TwitchChatMessage } from "@/lib/twitch/twitch-chat"
import { cn } from "@/lib/utils"
import { CopyIcon, CornerUpLeftIcon } from "lucide-react"

function ChatMessageRowInner({
  message,
  timestampFormat,
  badgeCatalog,
  showBadgeFallback = false,
  isHistorical = false,
  isAlternateRow = false,
  showCopyButton = true,
  showReplyButton = true,
  pingHighlighted = false,
  account,
  loginWithTwitch,
  channelRoomId,
  selfChatState,
  recentUserMessages,
}: {
  message: TwitchChatMessage
  timestampFormat: MessageTimestampFormat
  badgeCatalog: ChatBadgeCatalog
  showBadgeFallback?: boolean
  isHistorical?: boolean
  isAlternateRow?: boolean
  showCopyButton?: boolean
  showReplyButton?: boolean
  pingHighlighted?: boolean
  account: TwitchAccount | null
  loginWithTwitch: () => void
  channelRoomId: string | null
  selfChatState: TwitchSelfChatState | null
  recentUserMessages: TwitchChatMessage[]
}) {
  const timestamp = formatMessageTimestamp(message.receivedAt, timestampFormat)
  const badges = resolveMessageBadges(message.badges, badgeCatalog)
  const usernameColor = getReadableUsernameColor(message.color)
  const showQuickActions = showCopyButton || showReplyButton
  const userCardTarget = React.useMemo(
    () => ({
      userId: message.userId,
      userName: message.userName,
      displayName: message.displayName,
      color: message.color,
      flags: message.flags,
    }),
    [
      message.color,
      message.displayName,
      message.flags,
      message.userId,
      message.userName,
    ]
  )

  return (
    <div
      className={cn(
        "chat-message group relative px-3 py-1 leading-5",
        isHistorical && "chat-message--historical",
        isAlternateRow && "chat-message--alternate",
        pingHighlighted && "chat-message--ping-highlight"
      )}
    >
      {showQuickActions ? (
        <div className="pointer-events-none absolute top-0 right-2 z-10 -translate-y-1/2 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
          <div className="pointer-events-auto flex items-center gap-1 rounded-md bg-background/80 p-0.5 shadow-sm ring-1 ring-border/40 backdrop-blur-sm">
            {showCopyButton ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Copy message"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  void navigator.clipboard?.writeText(message.text)
                }}
              >
                <CopyIcon className="size-3.5" />
              </Button>
            ) : null}
            {showReplyButton ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Reply"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("peepochat:composer-reply", {
                      detail: {
                        channelLogin: message.channel,
                        reply: {
                          parentMessageId: message.id,
                          parentDisplayName: message.displayName,
                          parentUserName: message.userName,
                          parentBody: message.text,
                          parentColor: message.color,
                        },
                      },
                    })
                  )
                }}
              >
                <CornerUpLeftIcon className="size-3.5" />
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {message.reply ? (
        <div className="chat-reply mb-0.5">
          <ChatReplyPreview reply={message.reply} />
        </div>
      ) : null}

      <div className="chat-message-size min-w-0">
        {timestamp ? (
          <time
            className="chat-timestamp mr-1.5 inline whitespace-nowrap text-xs tabular-nums select-none"
            dateTime={message.receivedAt}
          >
            {timestamp}
          </time>
        ) : null}
        <ChatBadgeList
          badges={badges}
          unresolved={message.badges}
          showFallback={showBadgeFallback}
        />
        <UserCardPopover
          target={userCardTarget}
          account={account}
          channelLogin={message.channel}
          channelRoomId={channelRoomId}
          selfChatState={selfChatState}
          recentMessages={recentUserMessages}
          loginWithTwitch={loginWithTwitch}
        />
        {message.flags.isAction ? null : (
          <span className="chat-colon text-muted-foreground">: </span>
        )}
        <span
          className={message.flags.isAction ? "chat-action italic" : "inline"}
          style={
            message.flags.isAction && usernameColor
              ? { color: usernameColor }
              : undefined
          }
        >
          <ChatMessageBody text={message.text} emotes={message.emotes} />
        </span>
      </div>
    </div>
  )
}

export const ChatMessageRow = React.memo(ChatMessageRowInner)
