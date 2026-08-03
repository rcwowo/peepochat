import type { TwitchTimelineItem } from "@/lib/twitch/twitch-chat-types"
import type {
  TwitchChatMessage,
  TwitchChatReply,
} from "@/lib/twitch/twitch-chat"

export type ReplyThreadRootSnapshot = {
  kind: "snapshot"
  id: string
  displayName: string
  userName: string
  body: string
  color: string | null
}

export type ReplyThreadRootMessage = {
  kind: "message"
  message: TwitchChatMessage
}

export type ReplyThreadRoot = ReplyThreadRootSnapshot | ReplyThreadRootMessage

export type ReplyThread = {
  threadId: string
  root: ReplyThreadRoot
  replies: TwitchChatMessage[]
  selectedId: string
}

export function getThreadIdFromReply(reply: TwitchChatReply): string {
  return reply.threadRootMessageId || reply.parentMessageId
}

export function getThreadIdForMessage(message: TwitchChatMessage): string {
  if (message.reply) {
    return getThreadIdFromReply(message.reply)
  }
  return message.id
}

export function createComposerReplyFromMessage(
  message: TwitchChatMessage
): TwitchChatReply {
  return {
    parentMessageId: message.id,
    threadRootMessageId: getThreadIdForMessage(message),
    parentDisplayName: message.displayName,
    parentUserName: message.userName,
    parentBody: message.text,
    parentColor: message.color,
  }
}

function isThreadMember(message: TwitchChatMessage, threadId: string): boolean {
  if (message.id === threadId) {
    return true
  }

  if (!message.reply) {
    return false
  }

  if (message.reply.threadRootMessageId === threadId) {
    return true
  }

  return message.reply.parentMessageId === threadId
}

function createRootSnapshot(
  threadId: string,
  members: readonly TwitchChatMessage[],
  fallbackReply: TwitchChatReply
): ReplyThreadRootSnapshot {
  const rootDescribingReply =
    members.find((message) => message.reply?.parentMessageId === threadId)
      ?.reply ??
    (fallbackReply.parentMessageId === threadId ? fallbackReply : null)

  if (rootDescribingReply) {
    return {
      kind: "snapshot",
      id: threadId,
      displayName: rootDescribingReply.parentDisplayName,
      userName: rootDescribingReply.parentUserName,
      body: rootDescribingReply.parentBody,
      color: rootDescribingReply.parentColor,
    }
  }

  return {
    kind: "snapshot",
    id: threadId,
    displayName: fallbackReply.parentDisplayName,
    userName: fallbackReply.parentUserName,
    body: fallbackReply.parentBody,
    color: fallbackReply.parentColor,
  }
}

function compareByReceivedAt(a: TwitchChatMessage, b: TwitchChatMessage) {
  const timeDelta = Date.parse(a.receivedAt) - Date.parse(b.receivedAt)
  if (timeDelta !== 0) {
    return timeDelta
  }
  return a.id.localeCompare(b.id)
}

export function findMessageInThread(
  thread: ReplyThread,
  messageId: string
): TwitchChatMessage | null {
  if (thread.root.kind === "message" && thread.root.message.id === messageId) {
    return thread.root.message
  }

  return thread.replies.find((message) => message.id === messageId) ?? null
}

export function buildReplyThread(
  timeline: readonly TwitchTimelineItem[],
  reply: TwitchChatReply
): ReplyThread {
  const threadId = getThreadIdFromReply(reply)
  const selectedId = reply.parentMessageId
  const members: TwitchChatMessage[] = []

  for (const entry of timeline) {
    if (entry.kind !== "chat") {
      continue
    }
    if (isThreadMember(entry.message, threadId)) {
      members.push(entry.message)
    }
  }

  members.sort(compareByReceivedAt)

  const rootMessage = members.find((message) => message.id === threadId)
  const replies = members.filter((message) => message.id !== threadId)

  return {
    threadId,
    root: rootMessage
      ? { kind: "message", message: rootMessage }
      : createRootSnapshot(threadId, members, reply),
    replies,
    selectedId,
  }
}
