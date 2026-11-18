import {
  afterEach,
  beforeEach,
  describe,
  expect,
  setSystemTime,
  test,
} from "bun:test"

import {
  classifySendNotice,
  formatSelfTimeoutNoticeMessage,
  isAutomodHoldNoticeText,
  isPersistentSendBlockText,
  isSendRejectionNotice,
  isTimeoutComposerNoticeText,
  parseTimeoutRemainingSeconds,
  timeoutComposerNoticeId,
} from "@/lib/chat/send/send-notice"
import {
  EMPTY_SYSTEM_MESSAGE_META,
  type TwitchSystemMessage,
} from "@/lib/twitch/chat/chat"

const NOW = Date.parse("2024-03-01T10:00:00.000Z")

beforeEach(() => {
  setSystemTime(new Date(NOW))
})

afterEach(() => {
  setSystemTime()
})

function notice(
  text: string,
  overrides: Partial<TwitchSystemMessage> = {}
): TwitchSystemMessage {
  return {
    id: "n",
    channel: "room",
    roomId: null,
    text,
    headline: text,
    details: null,
    receivedAt: new Date(NOW).toISOString(),
    event: "notice",
    level: "info",
    accentColor: null,
    ...EMPTY_SYSTEM_MESSAGE_META,
    badges: [],
    ...overrides,
  }
}

describe("parseTimeoutRemainingSeconds", () => {
  test("reads both Twitch timeout phrasings case-insensitively", () => {
    expect(
      parseTimeoutRemainingSeconds("You are timed out for 42 more seconds.")
    ).toBe(42)
    expect(parseTimeoutRemainingSeconds("Timed out for 600 seconds")).toBe(600)
  })

  test("rejects zero and unrelated text", () => {
    expect(parseTimeoutRemainingSeconds("timed out for 0 seconds")).toBeNull()
    expect(parseTimeoutRemainingSeconds("You are banned.")).toBeNull()
    expect(parseTimeoutRemainingSeconds("timed out for a while")).toBeNull()
  })
})

describe("classifySendNotice", () => {
  test("ignores non-notice events and channel-less notices", () => {
    expect(
      classifySendNotice(
        notice("You are banned", { msgId: "msg_banned", event: "status" })
      )
    ).toBeNull()
    expect(
      classifySendNotice(
        notice("You are banned", { msgId: "msg_banned", channel: null })
      )
    ).toBeNull()
  })

  test("classifies permanent bans by msg-id or text", () => {
    expect(classifySendNotice(notice("Nope", { msgId: "msg_banned" }))).toEqual(
      {
        kind: "ban",
        message: "Nope",
        expiresAt: null,
      }
    )
    expect(
      classifySendNotice(
        notice("You are permanently banned from talking in room.")
      )?.kind
    ).toBe("ban")
  })

  test("prefers the explicit ban duration for timeouts", () => {
    const block = classifySendNotice(
      notice("You are timed out for 5 more seconds.", {
        msgId: "msg_timedout",
        banDurationSeconds: 600,
      })
    )
    expect(block).toEqual({
      kind: "timeout",
      message: "You are timed out for 5 more seconds.",
      expiresAt: NOW + 600_000,
    })
  })

  test("falls back to the remaining seconds in the notice text", () => {
    expect(
      classifySendNotice(
        notice("You are timed out for 42 more seconds.", {
          msgId: "msg_timedout",
          banDurationSeconds: 0,
        })
      )?.expiresAt
    ).toBe(NOW + 42_000)
    expect(
      classifySendNotice(notice("Your timeout has not expired yet."))
    ).toEqual({
      kind: "timeout",
      message: "Your timeout has not expired yet.",
      expiresAt: null,
    })
  })

  test("returns null for unrelated notices", () => {
    expect(
      classifySendNotice(
        notice("This room is in slow mode.", { msgId: "msg_slowmode" })
      )
    ).toBeNull()
  })
})

describe("isSendRejectionNotice", () => {
  test("accepts send blocks and any msg_ notice", () => {
    expect(isSendRejectionNotice(notice("timed out"))).toBe(true)
    expect(
      isSendRejectionNotice(notice("Slow down", { msgId: "msg_slowmode" }))
    ).toBe(true)
  })

  test("rejects informational notices", () => {
    expect(
      isSendRejectionNotice(notice("Slow mode on", { msgId: "slow_on" }))
    ).toBe(false)
    expect(isSendRejectionNotice(notice("hello"))).toBe(false)
    expect(
      isSendRejectionNotice(
        notice("Slow down", { msgId: "msg_slowmode", channel: null })
      )
    ).toBe(false)
  })
})

describe("notice text helpers", () => {
  test("detects automod holds", () => {
    expect(
      isAutomodHoldNoticeText("Your message is being held by AutoMod")
    ).toBe(true)
    expect(isAutomodHoldNoticeText("Held by Auto Mod for review")).toBe(true)
    expect(isAutomodHoldNoticeText("Message sent")).toBe(false)
  })

  test("detects timeout and persistent block text", () => {
    expect(isTimeoutComposerNoticeText("You are TIMED OUT")).toBe(true)
    expect(isTimeoutComposerNoticeText("Your timeout ends soon")).toBe(true)
    expect(isTimeoutComposerNoticeText("You are banned")).toBe(false)

    expect(isPersistentSendBlockText("You are banned from talking in x")).toBe(
      true
    )
    expect(isPersistentSendBlockText("You are permanently banned")).toBe(true)
    expect(isPersistentSendBlockText("This room is in slow mode")).toBe(false)
  })

  test("builds a per-channel timeout notice id", () => {
    expect(timeoutComposerNoticeId(" #SomeRoom ")).toBe("someroom:timeout")
    expect(timeoutComposerNoticeId("#")).toBeNull()
  })

  test("formats whole seconds for self timeouts", () => {
    expect(formatSelfTimeoutNoticeMessage(59.9)).toBe(
      "You are timed out for 59 seconds."
    )
  })
})
