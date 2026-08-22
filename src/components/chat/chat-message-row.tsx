import * as React from "react"
import {
  BanIcon,
  ClockIcon,
  CopyIcon,
  CornerUpLeftIcon,
  MessageCirclePlusIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { ChatBadgeList } from "@/components/chat/chat-badge"
import { ChatMessageBody } from "@/components/chat/chat-message-body"
import { ChatReplyPreview } from "@/components/chat/chat-reply-preview"
import { UserCardPopover } from "@/components/chat/user-card-popover"
import { Button } from "@/components/ui/button"
import { useResolvedUsernameColor } from "@/hooks/chat-ui/use-resolved-username-color"
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
import { createComposerReplyFromMessage } from "@/lib/chat/reply-threads"
import {
  adjustHighlightRangesForReplyStrip,
  getReplyDisplayContent,
} from "@/lib/chat/strip-reply-mention"
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
import type { TwitchSelfChatState } from "@/lib/twitch/twitch-chat-types"
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
  searchHighlightRanges = null,
  channelLabel = null,
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
  searchHighlightRanges?: PingMatchRange[] | null
  channelLabel?: string | null
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
  const usernameColor = useResolvedUsernameColor({
    channelLogin: message.channel,
    userName: message.userName,
    color: message.color,
  })
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
  const displayContent = React.useMemo(
    () => getReplyDisplayContent(message.text, message.emotes, message.reply),
    [message.emotes, message.reply, message.text]
  )
  const displayPingMatchRange = React.useMemo(() => {
    if (
      !pingHighlighted ||
      !pingMatchRange ||
      displayContent.stripOffset === 0
    ) {
      return pingHighlighted ? pingMatchRange : null
    }

    return (
      adjustHighlightRangesForReplyStrip(
        [pingMatchRange],
        displayContent.stripOffset
      )?.[0] ?? null
    )
  }, [displayContent.stripOffset, pingHighlighted, pingMatchRange])
  const displaySearchHighlightRanges = React.useMemo(
    () =>
      adjustHighlightRangesForReplyStrip(
        searchHighlightRanges,
        displayContent.stripOffset
      ),
    [displayContent.stripOffset, searchHighlightRanges]
  )

  const userCardTarget = React.useMemo(
    () => ({
      userId: message.userId,
      userName: message.userName,
      displayName: message.displayName,
      color: message.color,
      flags: message.flags,
      channelLogin: message.channel,
    }),
    [
      message.channel,
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

  const startReply = () => {
    window.dispatchEvent(
      new CustomEvent("peepochat:composer-reply", {
        detail: {
          channelLogin: message.channel,
          reply: createComposerReplyFromMessage(message),
        },
      })
    )
  }

  const messageContent = (
    <>
      {message.reply ? (
        <div className="mb-0.5">
          <ChatReplyPreview
            reply={message.reply}
            channelLogin={message.channel}
            onClick={showReplyButton ? startReply : undefined}
          />
        </div>
      ) : null}

      <div className="chat-message-size min-w-0">
        {channelLabel ? (
          <span className="mr-1.5 text-xs text-muted-foreground">
            #{channelLabel}
          </span>
        ) : null}
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
        <UserCardPopover target={userCardTarget} />
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
                text={displayContent.text}
                emotes={displayContent.emotes}
                pingMatchRange={displayPingMatchRange}
                highlightRanges={displaySearchHighlightRanges}
                channelLogin={message.channel}
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
              text={displayContent.text}
              emotes={displayContent.emotes}
              pingMatchRange={displayPingMatchRange}
              highlightRanges={displaySearchHighlightRanges}
              channelLogin={message.channel}
            />
          </span>
        )}
      </div>
    </>
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
                onClick={startReply}
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

      {message.flags.isFirst ? (
        <div className="chat-first-message -mx-3 border-l-4 border-[var(--chat-first-message-border)]">
          <span className="chat-announcement-header flex items-center px-3 py-1 text-xs font-medium">
            <MessageCirclePlusIcon
              className="mr-2 size-3.5 shrink-0 text-[var(--chat-first-message-border)]"
              aria-hidden
            />
            First Message
          </span>

          <div className="chat-announcement-body px-3 py-1.5">
            {messageContent}
          </div>
        </div>
      ) : (
        messageContent
      )}
    </div>
  )
}

export const ChatMessageRow = React.memo(ChatMessageRowInner)
