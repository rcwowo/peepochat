import { describe, expect, test } from "bun:test"

import {
  buildReplyThread,
  createComposerReplyFromMessage,
  findMessageInThread,
} from "@/lib/chat/threads/reply-threads"
import type { TwitchChatMessage, TwitchChatReply } from "@/lib/twitch/chat/chat"
import type { TwitchTimelineItem } from "@/lib/twitch/chat/types"

function chat(
  id: string,
  options: {
    at?: number
    user?: string
    text?: string
    reply?: TwitchChatReply | null
  } = {}
): TwitchChatMessage {
  const user = options.user ?? "viewer"
  return {
    id,
    channel: "room",
    roomId: "1",
    sourceRoomId: null,
    userId: `${user}-id`,
    userName: user,
    displayName: user.toUpperCase(),
    text: options.text ?? `message ${id}`,
    color: "#ff0000",
    receivedAt: new Date(
      Date.UTC(2024, 0, 1, 0, 0, options.at ?? 0)
    ).toISOString(),
    badges: [],
    badgeInfo: [],
    emotes: [],
    gifs: [],
    reply: options.reply ?? null,
    bits: null,
    deletedAt: null,
    flags: {
      isBroadcaster: false,
      isModerator: false,
      isSubscriber: false,
      isVip: false,
      isFirst: false,
      isAction: false,
    },
  }
}

function replyTo(
  parent: TwitchChatMessage,
  rootId = parent.reply?.threadRootMessageId ?? parent.id
): TwitchChatReply {
  return {
    parentMessageId: parent.id,
    threadRootMessageId: rootId,
    parentDisplayName: parent.displayName,
    parentUserName: parent.userName,
    parentBody: parent.text,
    parentColor: parent.color,
  }
}

function timeline(...messages: TwitchChatMessage[]): TwitchTimelineItem[] {
  return messages.map((message) => ({ kind: "chat", message }))
}

describe("createComposerReplyFromMessage", () => {
  test("starts a new thread rooted at a top-level message", () => {
    const root = chat("root", { user: "alice", text: "hi" })
    expect(createComposerReplyFromMessage(root)).toEqual({
      parentMessageId: "root",
      threadRootMessageId: "root",
      parentDisplayName: "ALICE",
      parentUserName: "alice",
      parentBody: "hi",
      parentColor: "#ff0000",
    })
  })

  test("keeps the original thread root when replying to a reply", () => {
    const root = chat("root")
    const first = chat("first", { reply: replyTo(root) })
    const composed = createComposerReplyFromMessage(first)
    expect(composed.parentMessageId).toBe("first")
    expect(composed.threadRootMessageId).toBe("root")
  })

  test("falls back to the parent id when the reply has no root id", () => {
    const message = chat("child", {
      reply: { ...replyTo(chat("parent")), threadRootMessageId: "" },
    })
    expect(createComposerReplyFromMessage(message).threadRootMessageId).toBe(
      "parent"
    )
  })
})

describe("buildReplyThread", () => {
  test("collects the root and replies in chronological order", () => {
    const root = chat("root", { at: 1 })
    const late = chat("late", { at: 5, reply: replyTo(root) })
    const early = chat("early", { at: 3, reply: replyTo(root) })
    const unrelated = chat("other", { at: 4 })
    const nested = chat("nested", { at: 6, reply: replyTo(early) })

    const thread = buildReplyThread(
      timeline(late, unrelated, nested, root, early),
      replyTo(early)
    )

    expect(thread.threadId).toBe("root")
    expect(thread.selectedId).toBe("early")
    expect(thread.root).toEqual({ kind: "message", message: root })
    expect(thread.replies.map((message) => message.id)).toEqual([
      "early",
      "late",
      "nested",
    ])
  })

  test("breaks receivedAt ties by message id", () => {
    const root = chat("root", { at: 0 })
    const b = chat("b", { at: 2, reply: replyTo(root) })
    const a = chat("a", { at: 2, reply: replyTo(root) })
    const thread = buildReplyThread(timeline(b, root, a), replyTo(root))
    expect(thread.replies.map((message) => message.id)).toEqual(["a", "b"])
  })

  test("ignores non-chat timeline entries", () => {
    const root = chat("root")
    const entries: TwitchTimelineItem[] = [
      {
        kind: "suspicious",
        message: {
          id: "root",
          messageId: "root",
          channel: "room",
          roomId: null,
          userId: "x",
          userName: "x",
          displayName: "x",
          text: "x",
          emotes: [],
          badges: [],
          color: null,
          bits: null,
          receivedAt: root.receivedAt,
          status: "monitored",
          deletedAt: null,
        },
      },
    ]
    const thread = buildReplyThread(entries, replyTo(root))
    expect(thread.root.kind).toBe("snapshot")
    expect(thread.replies).toEqual([])
  })

  test("builds a root snapshot from a direct reply when the root scrolled away", () => {
    const root = chat("root", { user: "alice", text: "original" })
    const middle = chat("middle", { user: "bob", reply: replyTo(root) })
    const leaf = chat("leaf", { at: 2, reply: replyTo(middle) })

    const thread = buildReplyThread(timeline(middle, leaf), replyTo(middle))

    expect(thread.root).toEqual({
      kind: "snapshot",
      id: "root",
      displayName: "ALICE",
      userName: "alice",
      body: "original",
      color: "#ff0000",
    })
    expect(thread.replies.map((message) => message.id)).toEqual([
      "middle",
      "leaf",
    ])
  })

  test("uses the requested reply for the snapshot when it targets the root", () => {
    const root = chat("root", { user: "alice", text: "gone" })
    const thread = buildReplyThread([], replyTo(root))
    expect(thread.root).toMatchObject({
      kind: "snapshot",
      id: "root",
      userName: "alice",
      body: "gone",
    })
    expect(thread.replies).toEqual([])
  })

  test("includes legacy replies that only reference the parent id", () => {
    const root = chat("root")
    const legacy = chat("legacy", {
      at: 1,
      reply: { ...replyTo(root), threadRootMessageId: "" },
    })
    const thread = buildReplyThread(timeline(root, legacy), replyTo(root))
    expect(thread.replies.map((message) => message.id)).toEqual(["legacy"])
  })
})

describe("findMessageInThread", () => {
  test("finds the root message and replies by id", () => {
    const root = chat("root")
    const child = chat("child", { at: 1, reply: replyTo(root) })
    const thread = buildReplyThread(timeline(root, child), replyTo(root))

    expect(findMessageInThread(thread, "root")).toBe(root)
    expect(findMessageInThread(thread, "child")).toBe(child)
    expect(findMessageInThread(thread, "missing")).toBeNull()
  })

  test("does not match a snapshot root", () => {
    const thread = buildReplyThread([], replyTo(chat("root")))
    expect(findMessageInThread(thread, "root")).toBeNull()
  })
})
