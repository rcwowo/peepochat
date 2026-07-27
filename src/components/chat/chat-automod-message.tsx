import * as React from "react"
import { ShieldAlert } from "lucide-react"
import { toast } from "sonner"

import { ChatMessageBody } from "@/components/chat/chat-message-body"
import { ChatModerationBanner } from "@/components/chat/chat-moderation-banner"
import { ChatUsername } from "@/components/chat/chat-username"
import { Button } from "@/components/ui/button"
import type {
  MessageTimestampFormat,
  TwitchAccount,
} from "@/lib/peepochat/peepochat-config"
import { manageHeldAutomodMessage } from "@/lib/twitch/twitch-api"
import type {
  TwitchAutomodHeldMessage,
  TwitchAutomodHeldStatus,
} from "@/lib/twitch/twitch-chat-types"

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

  if (localStatus !== null && message.status !== "pending") {
    setLocalStatus(null)
  }

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
    <ChatModerationBanner
      contentClassName="chat-automod"
      borderClassName="border-[var(--chat-automod-border)]"
      icon={ShieldAlert}
      iconClassName="text-[var(--chat-automod-border)]"
      title="AutoMod"
      receivedAt={message.receivedAt}
      timestampFormat={timestampFormat}
      isHistorical={isHistorical}
      isAlternateRow={isAlternateRow}
      headerTrailing={
        canAct ? (
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
        ) : null
      }
    >
      <ChatUsername displayName={message.displayName} color={message.color} />
      <span className="text-muted-foreground">: </span>
      <ChatMessageBody text={message.text} emotes={message.emotes} />
    </ChatModerationBanner>
  )
}

export const ChatAutomodMessage = React.memo(ChatAutomodMessageInner)
