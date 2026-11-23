import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  setSystemTime,
  test,
} from "bun:test"

import {
  requestChatMessageJump,
  subscribeToChatMessageJumps,
  takeChatMessageJump,
} from "@/lib/chat/threads/message-jump"

const START = new Date("2024-01-01T00:00:00.000Z")

beforeEach(() => {
  setSystemTime(START)
})

afterEach(() => {
  setSystemTime(new Date(START.getTime() + 60_000))
  takeChatMessageJump("")
  setSystemTime()
})

describe("chat message jumps", () => {
  test("hands the request to the matching channel exactly once", () => {
    requestChatMessageJump("#SomeRoom", "msg-1")

    expect(takeChatMessageJump("other")).toBeNull()
    expect(takeChatMessageJump(" someroom ")).toMatchObject({
      channelLogin: "someroom",
      messageId: "msg-1",
      requestedAt: START.getTime(),
    })
    expect(takeChatMessageJump("someroom")).toBeNull()
  })

  test("a newer request replaces the pending one with a new id", () => {
    requestChatMessageJump("room", "first")
    const firstId = takeChatMessageJump("room")!.id
    requestChatMessageJump("room", "second")
    requestChatMessageJump("room", "third")

    const taken = takeChatMessageJump("room")
    expect(taken!.messageId).toBe("third")
    expect(taken!.id).toBeGreaterThan(firstId)
  })

  test("expires requests after the TTL", () => {
    requestChatMessageJump("room", "msg")
    setSystemTime(new Date(START.getTime() + 3000))
    expect(takeChatMessageJump("other")).toBeNull()
    expect(takeChatMessageJump("room")).not.toBeNull()

    setSystemTime(START)
    requestChatMessageJump("room", "msg")
    setSystemTime(new Date(START.getTime() + 3001))
    expect(takeChatMessageJump("room")).toBeNull()
    setSystemTime(START)
    expect(takeChatMessageJump("room")).toBeNull()
  })

  test("notifies subscribers until they unsubscribe", () => {
    const listener = mock(() => {})
    const unsubscribe = subscribeToChatMessageJumps(listener)

    requestChatMessageJump("room", "a")
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    requestChatMessageJump("room", "b")
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
