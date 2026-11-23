import {
  afterEach,
  beforeEach,
  describe,
  expect,
  setSystemTime,
  test,
} from "bun:test"

import {
  automodHeldTimelineId,
  createUserAutomodHeldNotice,
  createUserAutomodUpdateSystemMessage,
  parseAutomodHeldMessage,
  parseAutomodUpdateStatus,
  parseUserMessageHoldEvent,
  parseUserMessageUpdateEvent,
  userAutomodHeldNoticeId,
} from "@/lib/twitch/eventsub/automod"

const NOW = new Date("2024-05-01T12:00:00.000Z")

function holdEvent(overrides: Record<string, unknown> = {}) {
  return {
    broadcaster_user_id: "1001",
    broadcaster_user_login: "streamer",
    broadcaster_user_name: "Streamer",
    user_id: "2002",
    user_login: "Chatter",
    user_name: "ChatterName",
    message_id: " held-1 ",
    message: {
      text: "you are bad Kappa",
      fragments: [
        { type: "text", text: "you are bad " },
        { type: "emote", text: "Kappa", emote: { id: "25" } },
      ],
    },
    reason: "automod",
    automod: { category: "insults", level: 2, boundaries: [] },
    held_at: "2024-05-01T11:59:00.000Z",
    ...overrides,
  }
}

beforeEach(() => {
  setSystemTime(NOW)
})

afterEach(() => {
  setSystemTime()
})

describe("parseAutomodHeldMessage", () => {
  test("converts an automod.message.hold v2 event", () => {
    const message = parseAutomodHeldMessage({
      event: holdEvent(),
      channelLogin: null,
    })

    expect(message).toEqual({
      id: "streamer:automod:held-1",
      messageId: "held-1",
      channel: "streamer",
      roomId: "1001",
      userId: "2002",
      userName: "chatter",
      displayName: "ChatterName",
      text: "you are bad Kappa",
      emotes: [
        {
          id: "25",
          code: "Kappa",
          provider: "twitch",
          imageUrl: expect.stringContaining("/emoticons/v2/25/"),
          start: 12,
          end: 16,
        },
      ],
      badges: [],
      color: null,
      bits: null,
      receivedAt: "2024-05-01T11:59:00.000Z",
      heldAt: "2024-05-01T11:59:00.000Z",
      status: "pending",
    })
  })

  test("prefers the explicit channel and room id and accepts a status", () => {
    const message = parseAutomodHeldMessage({
      event: holdEvent(),
      channelLogin: "#OtherChan",
      roomId: "9",
      status: "approved",
    })

    expect(message).toMatchObject({
      id: "otherchan:automod:held-1",
      channel: "otherchan",
      roomId: "9",
      status: "approved",
    })
  })

  test("supports v1 events with a string message", () => {
    const message = parseAutomodHeldMessage({
      event: holdEvent({
        message: "Kappa bad",
        fragments: { emotes: [{ text: "Kappa", id: "25" }] },
        user_name: "",
      }),
      channelLogin: null,
    })

    expect(message).toMatchObject({
      text: "Kappa bad",
      displayName: "chatter",
      emotes: [{ code: "Kappa", start: 0, end: 4 }],
    })
  })

  test("uses the current time when held_at is missing", () => {
    const message = parseAutomodHeldMessage({
      event: holdEvent({ held_at: "" }),
      channelLogin: null,
    })

    expect(message!.heldAt).toBe(NOW.toISOString())
  })

  test("rejects events missing required fields or with blank text", () => {
    const invalid = [
      holdEvent({ broadcaster_user_login: "" }),
      holdEvent({ message_id: "  " }),
      holdEvent({ user_id: "" }),
      holdEvent({ user_login: "", user_name: "" }),
      holdEvent({ message: { text: "   ", fragments: [] } }),
    ]

    for (const event of invalid) {
      expect(parseAutomodHeldMessage({ event, channelLogin: null })).toBeNull()
    }
  })
})

describe("parseAutomodUpdateStatus", () => {
  test("parses resolved statuses case-insensitively", () => {
    expect(
      parseAutomodUpdateStatus({
        message_id: "m1",
        status: " Approved ",
        broadcaster_user_login: "Streamer",
      })
    ).toEqual({ messageId: "m1", status: "approved", channelLogin: "streamer" })
  })

  test("ignores pending, unknown statuses and missing ids", () => {
    expect(
      parseAutomodUpdateStatus({ message_id: "m1", status: "pending" })
    ).toBeNull()
    expect(
      parseAutomodUpdateStatus({ message_id: "m1", status: "maybe" })
    ).toBeNull()
    expect(parseAutomodUpdateStatus({ status: "denied" })).toBeNull()
  })

  test("returns a null channel when the broadcaster login is missing", () => {
    expect(
      parseAutomodUpdateStatus({ message_id: "m1", status: "expired" })
    ).toEqual({ messageId: "m1", status: "expired", channelLogin: null })
  })
})

describe("channel.chat.user_message_hold / update", () => {
  test("parses hold events", () => {
    expect(
      parseUserMessageHoldEvent({
        broadcaster_user_id: " 1001 ",
        broadcaster_user_login: "Streamer",
        user_id: "3",
        message_id: "m1",
        message: { text: "hi", fragments: [] },
      })
    ).toEqual({
      messageId: "m1",
      channelLogin: "streamer",
      broadcasterUserId: "1001",
    })
    expect(parseUserMessageHoldEvent({ message_id: "" })).toBeNull()
  })

  test("parses update events and ignores pending ones", () => {
    expect(
      parseUserMessageUpdateEvent({
        broadcaster_user_id: "1001",
        broadcaster_user_login: "streamer",
        message_id: "m1",
        status: "denied",
      })
    ).toEqual({
      messageId: "m1",
      status: "denied",
      channelLogin: "streamer",
      broadcasterUserId: "1001",
    })
    expect(
      parseUserMessageUpdateEvent({ message_id: "m1", status: "pending" })
    ).toBeNull()
  })
})

describe("held notice ids", () => {
  test("normalizes the channel and trims the message id", () => {
    expect(automodHeldTimelineId("#Chan", " m1 ")).toBe("chan:automod:m1")
    expect(userAutomodHeldNoticeId(" #Chan", " m1 ")).toBe(
      "chan:automod:held:m1"
    )
  })

  test("returns null for blank inputs", () => {
    expect(userAutomodHeldNoticeId("#", "m1")).toBeNull()
    expect(userAutomodHeldNoticeId("chan", " ")).toBeNull()
    expect(
      createUserAutomodHeldNotice({ channelLogin: "chan", messageId: "" })
    ).toBeNull()
  })

  test("creates the held notice", () => {
    expect(
      createUserAutomodHeldNotice({ channelLogin: "Chan", messageId: "m1" })
    ).toEqual({
      id: "chan:automod:held:m1",
      message: "Your message was held for review by Automod.",
    })
  })
})

describe("createUserAutomodUpdateSystemMessage", () => {
  test("creates a distinct message per resolved status", () => {
    const texts = (["approved", "denied", "expired"] as const).map((status) =>
      createUserAutomodUpdateSystemMessage({
        channelLogin: "#Chan",
        roomId: "1",
        messageId: "m1",
        status,
        receivedAt: "2024-05-01T00:00:00.000Z",
      })
    )

    expect(texts.map((message) => message!.id)).toEqual([
      "chan:eventsub:mod_action:automod_user:m1:approved",
      "chan:eventsub:mod_action:automod_user:m1:denied",
      "chan:eventsub:mod_action:automod_user:m1:expired",
    ])
    expect(texts.map((message) => message!.text)).toEqual([
      "Your message was approved and sent.",
      "Your message was denied by a moderator.",
      "Your held message expired without a review.",
    ])
    expect(texts[0]).toMatchObject({
      channel: "chan",
      roomId: "1",
      event: "mod_action",
      level: "info",
      receivedAt: "2024-05-01T00:00:00.000Z",
      actor: null,
    })
  })

  test("returns null for pending status or blank identifiers", () => {
    expect(
      createUserAutomodUpdateSystemMessage({
        channelLogin: "chan",
        messageId: "m1",
        status: "pending",
      })
    ).toBeNull()
    expect(
      createUserAutomodUpdateSystemMessage({
        channelLogin: "chan",
        messageId: " ",
        status: "approved",
      })
    ).toBeNull()
  })

  test("defaults the room id and received time", () => {
    const message = createUserAutomodUpdateSystemMessage({
      channelLogin: "chan",
      messageId: "m1",
      status: "approved",
      receivedAt: "  ",
    })

    expect(message!.roomId).toBeNull()
    expect(message!.receivedAt).toBe(NOW.toISOString())
  })
})
