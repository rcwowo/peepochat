import * as React from "react"
import {
  BanIcon,
  ClockIcon,
  CopyIcon,
  CornerUpLeftIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { ChatBadgeList } from "@/components/chat/chat-badge"
import { ChatMessageBody } from "@/components/chat/chat-message-body"
import { ChatReplyPreview } from "@/components/chat/chat-reply-preview"
import { UserCardPopover } from "@/components/chat/user-card-popover"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  resolveMessageBadges,
  type ChatBadgeCatalog,
} from "@/lib/chat/chat-badges"
import { getReadableUsernameColor } from "@/lib/chat/chat-username"
import {
  canDeleteMessageInChannel,
  canModerateTarget,
} from "@/lib/chat/moderation-permissions"
import { MODERATION_TIMEOUT_PRESETS } from "@/lib/chat/moderation-tools"
import type { PingMatchRange } from "@/lib/highlights/highlight-rules"
import type {
  DeletedMessagesBehavior,
  MessageQuickActionsConfig,
  MessageTimestampFormat,
  TwitchAccount,
} from "@/lib/peepochat/peepochat-config"
import {
  formatMessageTimestamp,
  usePeepochatChat,
} from "@/lib/peepochat/peepochat-context"
import type { ResolvedMemberBadge } from "@/lib/chat/rcw-badges"
import type { TwitchSelfChatState } from "@/hooks/twitch/use-twitch-chat"
import { banTwitchUser, deleteTwitchChatMessage } from "@/lib/twitch/twitch-api"
import type { TwitchChatMessage } from "@/lib/twitch/twitch-chat"
import { cn } from "@/lib/utils"

const QUICK_ACTION_BUTTON_CLASS =
  "cursor-pointer text-muted-foreground hover:text-foreground"
const QUICK_ACTION_DESTRUCTIVE_BUTTON_CLASS =
  "cursor-pointer text-muted-foreground hover:text-destructive"

function ChatMessageRowInner({
  message,
  timestampFormat,
  badgeCatalog,
  getMemberBadge,
  showBadgeFallback = false,
  showTwitchBadges = true,
  showMemberBadges = true,
  isHistorical = false,
  isAlternateRow = false,
  messageQuickActions,
  deletedMessagesBehavior,
  account,
  channelRoomId,
  selfChatState,
  pingHighlighted = false,
  pingMatchRange = null,
  recentUserMessages,
}: {
  message: TwitchChatMessage
  timestampFormat: MessageTimestampFormat
  badgeCatalog: ChatBadgeCatalog
  getMemberBadge: (userId: string | null) => ResolvedMemberBadge | null
  showBadgeFallback?: boolean
  showTwitchBadges?: boolean
  showMemberBadges?: boolean
  isHistorical?: boolean
  isAlternateRow?: boolean
  messageQuickActions: MessageQuickActionsConfig
  deletedMessagesBehavior: DeletedMessagesBehavior
  account: TwitchAccount | null
  channelRoomId: string | null
  selfChatState: TwitchSelfChatState | null
  pingHighlighted?: boolean
  pingMatchRange?: PingMatchRange | null
  recentUserMessages: TwitchChatMessage[]
}) {
  const [pendingAction, setPendingAction] = React.useState<
    "delete" | "timeout" | "ban" | null
  >(null)
  const pendingActionRef = React.useRef<"delete" | "timeout" | "ban" | null>(
    null
  )
  const { markChatMessageDeleted } = usePeepochatChat()
  const isDeleted = message.deletedAt !== null
  const timestamp = formatMessageTimestamp(message.receivedAt, timestampFormat)
  const badges = showTwitchBadges
    ? resolveMessageBadges(message.badges, badgeCatalog)
    : []
  const memberBadge = showMemberBadges ? getMemberBadge(message.userId) : null
  const usernameColor = getReadableUsernameColor(message.color)
  const moderationTarget = React.useMemo(
    () => ({
      userId: message.userId,
      userName: message.userName,
      isBroadcaster: message.flags.isBroadcaster,
      isModerator: message.flags.isModerator,
    }),
    [
      message.flags.isBroadcaster,
      message.flags.isModerator,
      message.userId,
      message.userName,
    ]
  )
  const canDeleteMessage =
    messageQuickActions.deleteEnabled &&
    !isDeleted &&
    canDeleteMessageInChannel({
      account,
      broadcasterId: channelRoomId,
      channelLogin: message.channel,
      selfState: selfChatState,
    })
  const canBanOrTimeout = canModerateTarget({
    account,
    broadcasterId: channelRoomId,
    channelLogin: message.channel,
    selfState: selfChatState,
    target: moderationTarget,
  })
  const showTimeoutButton =
    messageQuickActions.timeoutEnabled && canBanOrTimeout
  const showBanButton = messageQuickActions.banEnabled && canBanOrTimeout
  const showReplyButton = messageQuickActions.replyEnabled && !isDeleted
  const showQuickActions =
    messageQuickActions.copyEnabled ||
    showReplyButton ||
    canDeleteMessage ||
    showTimeoutButton ||
    showBanButton
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

  const runModerationAction = React.useCallback(
    async (
      action: "delete" | "timeout" | "ban",
      options?: { durationSeconds?: number }
    ) => {
      if (!account || !channelRoomId || pendingActionRef.current) {
        return
      }

      pendingActionRef.current = action
      setPendingAction(action)
      try {
        if (action === "delete") {
          await deleteTwitchChatMessage({
            broadcasterId: channelRoomId,
            moderatorId: account.id,
            messageId: message.id,
            accessToken: account.accessToken,
            clientId: account.clientId,
          })
          markChatMessageDeleted(message.channel, message.id)
          toast.success("Message deleted.")
          return
        }

        if (!message.userId) {
          throw new Error("User ID is not available for this message.")
        }

        if (action === "ban") {
          await banTwitchUser({
            broadcasterId: channelRoomId,
            moderatorId: account.id,
            userId: message.userId,
            accessToken: account.accessToken,
            clientId: account.clientId,
          })
          toast.success(`Banned ${message.displayName}.`)
          return
        }

        await banTwitchUser({
          broadcasterId: channelRoomId,
          moderatorId: account.id,
          userId: message.userId,
          accessToken: account.accessToken,
          clientId: account.clientId,
          durationSeconds: options?.durationSeconds,
        })
        toast.success(`Timed out ${message.displayName}.`)
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Moderation action failed."
        )
      } finally {
        pendingActionRef.current = null
        setPendingAction(null)
      }
    },
    [
      account,
      channelRoomId,
      markChatMessageDeleted,
      message.channel,
      message.displayName,
      message.id,
      message.userId,
    ]
  )

  return (
    <div
      className={cn(
        "chat-message group relative px-3 leading-5",
        isHistorical && "chat-message--historical",
        isAlternateRow && "chat-message--alternate",
        pingHighlighted && "chat-message--ping-highlight",
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
      {showQuickActions ? (
        <div className="pointer-events-none absolute top-0 right-2 z-10 -translate-y-1/2 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
          <div className="pointer-events-auto flex cursor-pointer items-center gap-1 rounded-md bg-background/80 p-0.5 shadow-sm ring-1 ring-border/40 backdrop-blur-sm">
            {messageQuickActions.copyEnabled ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Copy message"
                className={QUICK_ACTION_BUTTON_CLASS}
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
                className={QUICK_ACTION_BUTTON_CLASS}
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
            {canDeleteMessage ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Delete message"
                className={QUICK_ACTION_DESTRUCTIVE_BUTTON_CLASS}
                disabled={pendingAction !== null}
                onClick={() => void runModerationAction("delete")}
              >
                <Trash2Icon className="size-3.5" />
              </Button>
            ) : null}
            {showTimeoutButton ? (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Timeout user"
                    className={QUICK_ACTION_BUTTON_CLASS}
                    disabled={pendingAction !== null}
                  >
                    <ClockIcon className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-24">
                  {MODERATION_TIMEOUT_PRESETS.map((preset) => (
                    <DropdownMenuItem
                      key={preset.label}
                      className="cursor-pointer"
                      onSelect={() =>
                        void runModerationAction("timeout", {
                          durationSeconds: preset.seconds,
                        })
                      }
                    >
                      {preset.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {showBanButton ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Ban user"
                className={QUICK_ACTION_DESTRUCTIVE_BUTTON_CLASS}
                disabled={pendingAction !== null}
                onClick={() => void runModerationAction("ban")}
              >
                <BanIcon className="size-3.5" />
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
            className="chat-timestamp mr-1.5 inline text-xs whitespace-nowrap tabular-nums select-none"
            dateTime={message.receivedAt}
          >
            {timestamp}
          </time>
        ) : null}
        <ChatBadgeList
          badges={badges}
          memberBadge={memberBadge}
          unresolved={message.badges}
          showFallback={showTwitchBadges && showBadgeFallback}
        />
        <UserCardPopover
          target={userCardTarget}
          recentMessages={recentUserMessages}
        />
        {message.flags.isAction ? null : (
          <span className="chat-colon text-muted-foreground">: </span>
        )}
        {isDeleted && deletedMessagesBehavior === "show-on-hover" ? (
          <>
            <span className="text-muted-foreground italic group-hover:hidden">
              Message was deleted.
            </span>
            <span
              className={cn(
                "hidden group-hover:inline",
                message.flags.isAction ? "chat-action italic" : undefined
              )}
              style={
                message.flags.isAction && usernameColor
                  ? { color: usernameColor }
                  : undefined
              }
            >
              <ChatMessageBody
                text={message.text}
                emotes={message.emotes}
                pingMatchRange={pingHighlighted ? pingMatchRange : null}
              />
            </span>
          </>
        ) : (
          <span
            className={message.flags.isAction ? "chat-action italic" : "inline"}
            style={
              message.flags.isAction && usernameColor
                ? { color: usernameColor }
                : undefined
            }
          >
            <ChatMessageBody
              text={message.text}
              emotes={message.emotes}
              pingMatchRange={pingHighlighted ? pingMatchRange : null}
            />
          </span>
        )}
      </div>
    </div>
  )
}

export const ChatMessageRow = React.memo(ChatMessageRowInner)
