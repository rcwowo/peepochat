import * as React from "react"
import { ShieldAlert } from "lucide-react"
import { toast } from "sonner"

import { ChatMessageBody } from "@/components/chat/chat-message-body"
import { ChatUsername } from "@/components/chat/chat-username"
import { Button } from "@/components/ui/button"
import type {
  MessageTimestampFormat,
  TwitchAccount,
} from "@/lib/peepochat/peepochat-config"
import { formatMessageTimestamp } from "@/lib/peepochat/peepochat-context"
import { manageHeldAutomodMessage } from "@/lib/twitch/twitch-api"
import type {
  TwitchAutomodHeldMessage,
  TwitchAutomodHeldStatus,
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

function resolvedStatusLabel(status: TwitchAutomodHeldStatus): string | null {
  switch (status) {
    case "approved":
      return "Approved"
    case "denied":
      return "Denied"
    case "expired":
      return "Expired"
    default:
      return null
  }
}

function ChatAutomodMessageInner({
  message,
  timestampFormat,
  account,
  isHistorical = false,
  isAlternateRow = false,
}: {
  message: TwitchAutomodHeldMessage
  timestampFormat: MessageTimestampFormat
  account: TwitchAccount | null
  isHistorical?: boolean
  isAlternateRow?: boolean
}) {
  const [localStatus, setLocalStatus] =
    React.useState<TwitchAutomodHeldStatus | null>(null)
  const [pendingAction, setPendingAction] = React.useState<
    "ALLOW" | "DENY" | null
  >(null)
  const pendingActionRef = React.useRef<"ALLOW" | "DENY" | null>(null)
  const effectiveStatus = localStatus ?? message.status
  const statusLabel = resolvedStatusLabel(effectiveStatus)
  const canAct =
    Boolean(account) &&
    effectiveStatus === "pending" &&
    !isHistorical &&
    Boolean(account?.scopes.includes("moderator:manage:automod"))

  const resolveHeldMessage = React.useCallback(
    async (action: "ALLOW" | "DENY") => {
      if (!account || pendingActionRef.current) return

      pendingActionRef.current = action
      setPendingAction(action)

      try {
        await manageHeldAutomodMessage({
          moderatorUserId: account.id,
          msgId: message.messageId,
          action,
          accessToken: account.accessToken,
          clientId: account.clientId,
        })
        setLocalStatus(action === "ALLOW" ? "approved" : "denied")
      } catch (error) {
        const fallback =
          action === "ALLOW"
            ? "Could not approve AutoMod message."
            : "Could not deny AutoMod message."
        toast.error(error instanceof Error ? error.message : fallback)
      } finally {
        pendingActionRef.current = null
        setPendingAction(null)
      }
    },
    [account, message.messageId]
  )

  return (
    <div
      className={cn(
        "chat-message group px-3 leading-5",
        isHistorical && "chat-message--historical",
        isAlternateRow && "chat-message--alternate"
      )}
    >
      <div className="chat-automod -mx-3 border-l-4 border-[var(--chat-automod-border)]">
        <span className="chat-announcement-header flex items-center gap-2 px-3 py-1 text-xs font-medium">
          <span className="inline-flex min-w-0 items-center">
            <ShieldAlert
              className="mr-2 size-3.5 shrink-0 text-[var(--chat-automod-border)]"
              aria-hidden
            />
            AutoMod
          </span>
          {canAct ? (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1">
              <Button
                type="button"
                size="xs"
                variant="secondary"
                className="h-5 px-1.5 text-[10px]"
                disabled={pendingAction !== null}
                onClick={() => {
                  void resolveHeldMessage("ALLOW")
                }}
              >
                {pendingAction === "ALLOW" ? "…" : "Approve"}
              </Button>
              <Button
                type="button"
                size="xs"
                variant="destructive"
                className="h-5 px-1.5 text-[10px]"
                disabled={pendingAction !== null}
                onClick={() => {
                  void resolveHeldMessage("DENY")
                }}
              >
                {pendingAction === "DENY" ? "…" : "Deny"}
              </Button>
            </span>
          ) : statusLabel ? (
            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
              {statusLabel}
            </span>
          ) : null}
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

export const ChatAutomodMessage = React.memo(ChatAutomodMessageInner)
