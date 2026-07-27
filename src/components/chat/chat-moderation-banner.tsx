import type { LucideIcon } from "lucide-react"
import * as React from "react"

import { ChatTimestamp } from "@/components/chat/chat-timestamp"
import type { MessageTimestampFormat } from "@/lib/peepochat/peepochat-config"
import { cn } from "@/lib/utils"

export function ChatModerationBanner({
  contentClassName,
  borderClassName,
  icon: Icon,
  iconClassName,
  title,
  headerTrailing,
  receivedAt,
  timestampFormat,
  isHistorical = false,
  isAlternateRow = false,
  deletedClassName,
  children,
}: {
  contentClassName?: string
  borderClassName: string
  icon: LucideIcon
  iconClassName?: string
  title: React.ReactNode
  headerTrailing?: React.ReactNode
  receivedAt: string
  timestampFormat: MessageTimestampFormat
  isHistorical?: boolean
  isAlternateRow?: boolean
  deletedClassName?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "chat-message group px-3 leading-5",
        isHistorical && "chat-message--historical",
        isAlternateRow && "chat-message--alternate",
        deletedClassName
      )}
    >
      <div
        className={cn("-mx-3 border-l-4", contentClassName, borderClassName)}
      >
        <span className="chat-announcement-header flex items-center gap-2 px-3 py-1 text-xs font-medium">
          <span className="inline-flex min-w-0 items-center">
            <Icon
              className={cn("mr-2 size-3.5 shrink-0", iconClassName)}
              aria-hidden
            />
            {title}
          </span>
          {headerTrailing}
        </span>

        <span className="chat-message-size chat-announcement-body block px-3 py-1.5">
          <ChatTimestamp
            receivedAt={receivedAt}
            timestampFormat={timestampFormat}
          />
          {children}
        </span>
      </div>
    </div>
  )
}
