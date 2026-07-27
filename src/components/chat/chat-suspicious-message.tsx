import * as React from "react"
import { ShieldAlert } from "lucide-react"

import { ChatMessageBody } from "@/components/chat/chat-message-body"
import { ChatUsername } from "@/components/chat/chat-username"
import type { MessageTimestampFormat } from "@/lib/peepochat/peepochat-config"
import { formatMessageTimestamp } from "@/lib/peepochat/peepochat-context"
import type {
  TwitchSuspiciousUserMessage,
  TwitchSuspiciousUserStatus,
} from "@/lib/twitch/twitch-chat-types"
import { cn } from "@/lib/utils"

function ChatTimestamp({
  receivedAt,
  timestampFormat,
}: {
  receivedAt: string
  timestampFormat: MessageTimestampFormat
}) {
  const timestamp = formatMessageTimestamp(receivedAt, timestampFormat)
  if (!timestamp) {
    return null
  }

  return (
    <time
      className="chat-timestamp mr-1.5 inline-block align-top text-xs tabular-nums select-none"
      dateTime={receivedAt}
    >
      {timestamp}
    </time>
  )
}

function statusLabel(status: TwitchSuspiciousUserStatus): string {
  switch (status) {
    case "monitored":
      return "Monitored User"
    case "restricted":
      return "Restricted User"
  }
}

function ChatSuspiciousMessageInner({
  message,
  timestampFormat,
  isHistorical = false,
  isAlternateRow = false,
}: {
  message: TwitchSuspiciousUserMessage
  timestampFormat: MessageTimestampFormat
  isHistorical?: boolean
  isAlternateRow?: boolean
}) {
  const isDeleted = message.deletedAt !== null

  return (
    <div
      className={cn(
        "chat-message group px-3 leading-5",
        isHistorical && "chat-message--historical",
        isAlternateRow && "chat-message--alternate",
        isDeleted && "chat-message--deleted-strikethrough"
      )}
    >
      <div className="chat-suspicious -mx-3 border-l-4 border-[var(--chat-automod-border)]">
        <span className="chat-announcement-header flex items-center gap-2 px-3 py-1 text-xs font-medium">
          <span className="inline-flex min-w-0 items-center">
            <ShieldAlert
              className="mr-2 size-3.5 shrink-0 text-[var(--chat-automod-border)]"
              aria-hidden
            />
            {statusLabel(message.status)}
          </span>
        </span>

        <span className="chat-message-size chat-announcement-body block px-3 py-1.5">
          <ChatTimestamp
            receivedAt={message.receivedAt}
            timestampFormat={timestampFormat}
          />
          <ChatUsername
            displayName={message.displayName}
            color={message.color}
          />
          <span className="text-muted-foreground">: </span>
          <ChatMessageBody text={message.text} emotes={message.emotes} />
        </span>
      </div>
    </div>
  )
}

export const ChatSuspiciousMessage = React.memo(ChatSuspiciousMessageInner)
