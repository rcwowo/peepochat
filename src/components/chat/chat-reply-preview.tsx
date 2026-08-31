import { CornerDownRight } from "lucide-react"

import { ChatUsername } from "@/components/chat/chat-username"
import type { TwitchChatReply } from "@/lib/twitch/twitch-chat"
import { cn } from "@/lib/utils"

export function ChatReplyPreview({
  reply,
  channelLogin,
  onClick,
  className,
}: {
  reply: TwitchChatReply
  channelLogin: string
  onClick?: () => void
  className?: string
}) {
  const content = (
    <>
      <CornerDownRight
        className="mt-0.5 size-3.5 shrink-0 scale-x-[-1] text-muted-foreground"
        aria-hidden
      />

      <p className="line-clamp-1 min-w-0 text-xs leading-snug">
        <ChatUsername
          displayName={reply.parentDisplayName}
          color={reply.parentColor}
          channelLogin={channelLogin}
          userName={reply.parentUserName}
          className="font-semibold"
        />
        <span className="text-muted-foreground">: </span>
        <span className="text-muted-foreground">{reply.parentBody}</span>
      </p>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        className={cn(
          "chat-reply flex w-full min-w-0 cursor-pointer items-start gap-1.5 rounded-sm pl-0.5 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none",
          className
        )}
        onClick={onClick}
        aria-label={`Open reply thread from ${reply.parentDisplayName}`}
      >
        {content}
      </button>
    )
  }

  return (
    <div
      className={cn("chat-reply flex items-start gap-1.5 pl-0.5", className)}
    >
      {content}
    </div>
  )
}
