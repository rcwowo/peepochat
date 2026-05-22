import { CornerDownRight } from "lucide-react"

import { ChatUsername } from "@/components/chat/chat-username"
import type { TwitchChatReply } from "@/lib/twitch-chat"

export function ChatReplyPreview({ reply }: { reply: TwitchChatReply }) {
  return (
    <div className="chat-reply mb-0.5 flex items-start gap-1.5 pl-0.5">
      <CornerDownRight
        className="mt-0.5 size-3.5 shrink-0 scale-x-[-1] text-muted-foreground"
        aria-hidden
      />

      <p className="line-clamp-2 min-w-0 text-xs leading-snug">
        <ChatUsername
          displayName={reply.parentDisplayName}
          color={reply.parentColor}
          className="font-semibold"
        />
        <span className="text-muted-foreground">: </span>
        <span className="text-muted-foreground">{reply.parentBody}</span>
      </p>
    </div>
  )
}
