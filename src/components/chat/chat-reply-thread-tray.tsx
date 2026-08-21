import { XIcon } from "lucide-react"

import { ChatBadgeList } from "@/components/chat/chat-badge"
import { ChatMessageBody } from "@/components/chat/chat-message-body"
import { ChatUsername } from "@/components/chat/chat-username"
import { Button } from "@/components/ui/button"
import { useResolvedUsernameColor } from "@/hooks/chat-ui/use-resolved-username-color"
import {
  resolveMessageBadges,
  type ChatBadgeCatalog,
} from "@/lib/chat/chat-badges"
import {
  findMessageInThread,
  type ReplyThread,
  type ReplyThreadRoot,
} from "@/lib/chat/reply-threads"
import type { ResolvedMemberBadge } from "@/lib/chat/rcw-badges"
import type {
  TwitchChatMessage,
  TwitchChatReply,
} from "@/lib/twitch/twitch-chat"
import { cn } from "@/lib/utils"

function ThreadMessageLine({
  channelLogin,
  displayName,
  userName,
  color,
  text,
  emotes,
  badges,
  memberBadge = null,
  unresolvedBadges,
  showBadgeFallback = false,
  isAction = false,
  isSelected = false,
  isSelectable = false,
  onSelect,
}: {
  channelLogin: string
  displayName: string
  userName: string
  color: string | null
  text: string
  emotes?: TwitchChatMessage["emotes"]
  badges: ReturnType<typeof resolveMessageBadges>
  memberBadge?: ResolvedMemberBadge | null
  unresolvedBadges?: TwitchChatMessage["badges"]
  showBadgeFallback?: boolean
  isAction?: boolean
  isSelected?: boolean
  isSelectable?: boolean
  onSelect?: () => void
}) {
  const usernameColor = useResolvedUsernameColor({
    channelLogin,
    userName,
    color,
  })
  const content = (
    <>
      <ChatBadgeList
        badges={badges}
        memberBadge={memberBadge}
        unresolved={unresolvedBadges}
        showFallback={showBadgeFallback}
      />
      <ChatUsername
        displayName={displayName}
        color={color}
        channelLogin={channelLogin}
        userName={userName}
        className="font-semibold"
      />
      {isAction ? null : <span className="text-muted-foreground">: </span>}
      <span
        className={isAction ? "chat-action italic" : "inline"}
        style={isAction && usernameColor ? { color: usernameColor } : undefined}
      >
        {emotes ? (
          <ChatMessageBody
            text={text}
            emotes={emotes}
            channelLogin={channelLogin}
          />
        ) : (
          <span className="chat-message-text">{text}</span>
        )}
      </span>
    </>
  )

  const className = cn(
    "w-full min-w-0 rounded-sm px-1.5 py-1 text-left text-sm leading-5",
    isSelected && "bg-muted/45",
    isSelectable &&
      !isSelected &&
      "cursor-pointer hover:bg-muted/25 focus-visible:bg-muted/25 focus-visible:outline-none",
    isSelectable && isSelected && "cursor-default"
  )

  if (isSelectable && onSelect && !isSelected) {
    return (
      <button
        type="button"
        className={className}
        onClick={onSelect}
        aria-label={`Reply to ${displayName}`}
      >
        {content}
      </button>
    )
  }

  return <div className={className}>{content}</div>
}

function MessageFromChat({
  message,
  isSelected,
  badgeCatalog,
  getMemberBadge,
  showTwitchBadges,
  showMemberBadges,
  showBadgeFallback,
  onSelect,
}: {
  message: TwitchChatMessage
  isSelected: boolean
  badgeCatalog: ChatBadgeCatalog
  getMemberBadge: (userId: string | null) => ResolvedMemberBadge | null
  showTwitchBadges: boolean
  showMemberBadges: boolean
  showBadgeFallback: boolean
  onSelect?: () => void
}) {
  return (
    <ThreadMessageLine
      channelLogin={message.channel}
      displayName={message.displayName}
      userName={message.userName}
      color={message.color}
      text={message.text}
      emotes={message.emotes}
      badges={
        showTwitchBadges
          ? resolveMessageBadges(message.badges, badgeCatalog)
          : []
      }
      memberBadge={showMemberBadges ? getMemberBadge(message.userId) : null}
      unresolvedBadges={message.badges}
      showBadgeFallback={showTwitchBadges && showBadgeFallback}
      isAction={message.flags.isAction}
      isSelected={isSelected}
      isSelectable
      onSelect={onSelect}
    />
  )
}

function ThreadRootLine({
  channelLogin,
  root,
  isSelected,
  badgeCatalog,
  getMemberBadge,
  showTwitchBadges,
  showMemberBadges,
  showBadgeFallback,
  onSelect,
}: {
  channelLogin: string
  root: ReplyThreadRoot
  isSelected: boolean
  badgeCatalog: ChatBadgeCatalog
  getMemberBadge: (userId: string | null) => ResolvedMemberBadge | null
  showTwitchBadges: boolean
  showMemberBadges: boolean
  showBadgeFallback: boolean
  onSelect?: () => void
}) {
  if (root.kind === "message") {
    return (
      <MessageFromChat
        message={root.message}
        isSelected={isSelected}
        badgeCatalog={badgeCatalog}
        getMemberBadge={getMemberBadge}
        showTwitchBadges={showTwitchBadges}
        showMemberBadges={showMemberBadges}
        showBadgeFallback={showBadgeFallback}
        onSelect={onSelect}
      />
    )
  }

  return (
    <ThreadMessageLine
      channelLogin={channelLogin}
      displayName={root.displayName}
      userName={root.userName}
      color={root.color}
      text={root.body}
      badges={[]}
      isSelected={isSelected}
      isSelectable
      onSelect={onSelect}
    />
  )
}

function replyFromMessage(
  message: TwitchChatMessage,
  threadId: string
): TwitchChatReply {
  return {
    parentMessageId: message.id,
    threadRootMessageId: threadId,
    parentDisplayName: message.displayName,
    parentUserName: message.userName,
    parentBody: message.text,
    parentColor: message.color,
  }
}

function resolveReplyTarget(thread: ReplyThread, selectedId: string) {
  const selectedMessage = findMessageInThread(thread, selectedId)

  if (selectedMessage) {
    return {
      displayName: selectedMessage.displayName,
      userName: selectedMessage.userName,
      color: selectedMessage.color,
    }
  }

  if (thread.root.kind === "message") {
    return {
      displayName: thread.root.message.displayName,
      userName: thread.root.message.userName,
      color: thread.root.message.color,
    }
  }

  return {
    displayName: thread.root.displayName,
    userName: thread.root.userName,
    color: thread.root.color,
  }
}

export function ChatReplyThreadTray({
  channelLogin,
  thread,
  badgeCatalog,
  getMemberBadge,
  showTwitchBadges,
  showMemberBadges,
  showBadgeFallback,
  onClose,
  onSelectReply,
}: {
  channelLogin: string
  thread: ReplyThread
  badgeCatalog: ChatBadgeCatalog
  getMemberBadge: (userId: string | null) => ResolvedMemberBadge | null
  showTwitchBadges: boolean
  showMemberBadges: boolean
  showBadgeFallback: boolean
  onClose: () => void
  onSelectReply: (reply: TwitchChatReply) => void
}) {
  const replyTarget = resolveReplyTarget(thread, thread.selectedId)

  const selectRoot = () => {
    if (thread.root.kind === "message") {
      onSelectReply(replyFromMessage(thread.root.message, thread.threadId))
      return
    }

    onSelectReply({
      parentMessageId: thread.root.id,
      threadRootMessageId: thread.threadId,
      parentDisplayName: thread.root.displayName,
      parentUserName: thread.root.userName,
      parentBody: thread.root.body,
      parentColor: thread.root.color,
    })
  }

  return (
    <div className="px-2 pt-2">
      <div className="overflow-hidden rounded-md border border-border/60 bg-muted/20">
        <div className="flex items-center justify-between gap-2 border-b border-border/50 px-2 py-1.5">
          <div className="min-w-0 text-[11px] font-medium text-muted-foreground">
            Replying to{" "}
            <ChatUsername
              displayName={`@${replyTarget.displayName}`}
              color={replyTarget.color}
              channelLogin={channelLogin}
              userName={replyTarget.userName}
              className="inline font-medium"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Cancel reply"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>

        <div className="max-h-[18.5rem] space-y-0.5 overflow-y-auto px-1.5 py-1.5">
          <ThreadRootLine
            channelLogin={channelLogin}
            root={thread.root}
            isSelected={
              thread.root.kind === "message"
                ? thread.root.message.id === thread.selectedId
                : thread.root.id === thread.selectedId
            }
            badgeCatalog={badgeCatalog}
            getMemberBadge={getMemberBadge}
            showTwitchBadges={showTwitchBadges}
            showMemberBadges={showMemberBadges}
            showBadgeFallback={showBadgeFallback}
            onSelect={selectRoot}
          />
          {thread.replies.map((message) => (
            <MessageFromChat
              key={message.id}
              message={message}
              isSelected={message.id === thread.selectedId}
              badgeCatalog={badgeCatalog}
              getMemberBadge={getMemberBadge}
              showTwitchBadges={showTwitchBadges}
              showMemberBadges={showMemberBadges}
              showBadgeFallback={showBadgeFallback}
              onSelect={() =>
                onSelectReply(replyFromMessage(message, thread.threadId))
              }
            />
          ))}
        </div>
      </div>
    </div>
  )
}
