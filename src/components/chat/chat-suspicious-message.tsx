import * as React from "react"
import { ShieldAlert } from "lucide-react"

import { ChatMessageBody } from "@/components/chat/chat-message-body"
import { ChatModerationBanner } from "@/components/chat/chat-moderation-banner"
import { ChatUsername } from "@/components/chat/chat-username"
import type {
  DeletedMessagesBehavior,
  MessageTimestampFormat,
} from "@/lib/peepochat/peepochat-config"
import type {
  TwitchSuspiciousUserMessage,
  TwitchSuspiciousUserStatus,
} from "@/lib/twitch/twitch-chat-types"
import { cn } from "@/lib/utils"

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
  deletedMessagesBehavior,
  isHistorical = false,
  isAlternateRow = false,
}: {
  message: TwitchSuspiciousUserMessage
  timestampFormat: MessageTimestampFormat
  deletedMessagesBehavior: DeletedMessagesBehavior
  isHistorical?: boolean
  isAlternateRow?: boolean
}) {
  const isDeleted = message.deletedAt !== null
  const showOnHover = isDeleted && deletedMessagesBehavior === "show-on-hover"

  return (
    <ChatModerationBanner
      contentClassName="chat-suspicious"
      borderClassName="border-[var(--chat-automod-border)]"
      icon={ShieldAlert}
      iconClassName="text-[var(--chat-automod-border)]"
      title={statusLabel(message.status)}
      receivedAt={message.receivedAt}
      timestampFormat={timestampFormat}
      isHistorical={isHistorical}
      isAlternateRow={isAlternateRow}
      deletedClassName={cn(
        isDeleted &&
          deletedMessagesBehavior !== "remove" &&
          "chat-message--historical",
        isDeleted &&
          deletedMessagesBehavior === "strikethrough" &&
          "chat-message--deleted-strikethrough",
        isDeleted &&
          deletedMessagesBehavior === "show-on-hover" &&
          "chat-message--deleted-hover"
      )}
    >
      <ChatUsername displayName={message.displayName} color={message.color} />
      <span className="text-muted-foreground">: </span>
      {showOnHover ? (
        <>
          <span className="text-muted-foreground italic group-hover:hidden">
            Message was deleted.
          </span>
          <span className="hidden group-hover:inline">
            <ChatMessageBody text={message.text} emotes={message.emotes} />
          </span>
        </>
      ) : (
        <span className={cn(isDeleted && "inline")}>
          <ChatMessageBody text={message.text} emotes={message.emotes} />
        </span>
      )}
    </ChatModerationBanner>
  )
}

export const ChatSuspiciousMessage = React.memo(ChatSuspiciousMessageInner)
