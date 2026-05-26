import { ChatBadgeList } from "@/components/chat/chat-badge"
import { ChatMessageBody } from "@/components/chat/chat-message-body"
import { ChatReplyPreview } from "@/components/chat/chat-reply-preview"
import {
  resolveMessageBadges,
  type ChatBadgeCatalog,
} from "@/lib/chat-badges"
import { getReadableUsernameColor } from "@/lib/chat-username"
import type { MessageTimestampFormat } from "@/lib/chatvoice-config"
import { formatMessageTimestamp } from "@/lib/chatvoice-context"
import type { TwitchChatMessage } from "@/lib/twitch-chat"

export function ChatMessageRow({
  message,
  timestampFormat,
  badgeCatalog,
  showBadgeFallback = false,
}: {
  message: TwitchChatMessage
  timestampFormat: MessageTimestampFormat
  badgeCatalog: ChatBadgeCatalog
  showBadgeFallback?: boolean
}) {
  const timestamp = formatMessageTimestamp(message.receivedAt, timestampFormat)
  const badges = resolveMessageBadges(message.badges, badgeCatalog)
  const usernameColor = getReadableUsernameColor(message.color)

  return (
    <div className="chat-message group px-3 py-1 leading-5">
      {message.reply ? (
        <div className="chat-reply mb-0.5">
          <ChatReplyPreview reply={message.reply} />
        </div>
      ) : null}

      <div className="min-w-0 text-[13px] leading-5">
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
        <span
          className="chat-username font-semibold"
          style={usernameColor ? { color: usernameColor } : undefined}
        >
          {message.displayName}
        </span>
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
