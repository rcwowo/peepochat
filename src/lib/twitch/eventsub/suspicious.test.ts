import {
  afterEach,
  beforeEach,
  describe,
  expect,
  setSystemTime,
  test,
} from "bun:test"

import {
  createSystemMessageFromSuspiciousUserUpdate,
  parseSuspiciousUserMessage,
} from "@/lib/twitch/eventsub/suspicious"

const NOW = new Date("2024-05-01T12:00:00.000Z")

beforeEach(() => {
  setSystemTime(NOW)
})

afterEach(() => {
  setSystemTime()
})

function suspiciousMessageEvent(overrides: Record<string, unknown> = {}) {
  return {
    broadcaster_user_id: "1001",
    broadcaster_user_name: "Streamer",
    broadcaster_user_login: "streamer",
    user_id: "2002",
    user_name: "SusUser",
    user_login: "SusUser",
    low_trust_status: "active_monitoring",
    shared_ban_channel_ids: [],
    types: ["manually_added"],
    ban_evasion_evaluation: "unknown",
    message: {
      message_id: " msg-1 ",
      text: "hello 😀 Kappa",
      fragments: [
        { type: "text", text: "hello 😀 " },
        { type: "emote", text: "Kappa", emote: { id: "25" } },
      ],
    },
    badges: [{ set_id: "subscriber", id: "3", info: "3" }],
    ...overrides,
  }
}

function suspiciousUpdateEvent(overrides: Record<string, unknown> = {}) {
  return {
    broadcaster_user_id: "1001",
    broadcaster_user_name: "Streamer",
    broadcaster_user_login: "streamer",
    moderator_user_id: "3003",
    moderator_user_name: "ModName",
    moderator_user_login: "ModLogin",
    user_id: "2002",
    user_name: "SusUser",
    user_login: "SusUser",
    low_trust_status: "restricted",
    ...overrides,
  }
}

describe("parseSuspiciousUserMessage", () => {
  test("converts a monitored user's message", () => {
    const message = parseSuspiciousUserMessage({
      event: suspiciousMessageEvent(),
      channelLogin: null,
      receivedAt: "2024-05-01T11:00:00.000Z",
    })

    expect(message).toEqual({
      id: "msg-1",
      messageId: "msg-1",
      channel: "streamer",
      roomId: "1001",
      userId: "2002",
      userName: "sususer",
      displayName: "SusUser",
      text: "hello 😀 Kappa",
      emotes: [
        {
          id: "25",
          code: "Kappa",
          provider: "twitch",
          imageUrl: expect.stringContaining("/emoticons/v2/25/"),
          start: 9,
          end: 13,
        },
      ],
      badges: [{ set: "subscriber", version: "3" }],
      color: null,
      bits: null,
      receivedAt: "2024-05-01T11:00:00.000Z",
      status: "monitored",
      deletedAt: null,
    })
    expect(message!.text.slice(9, 14)).toBe("Kappa")
  })

  test("maps restricted status and defaults the received time", () => {
    const message = parseSuspiciousUserMessage({
      event: suspiciousMessageEvent({ low_trust_status: "RESTRICTED" }),
      channelLogin: "#Chan",
      roomId: "9",
    })

    expect(message).toMatchObject({
      channel: "chan",
      roomId: "9",
      status: "restricted",
      receivedAt: NOW.toISOString(),
    })
  })

  test("rejects messages with no status, id, user or text", () => {
    const invalid = [
      suspiciousMessageEvent({ low_trust_status: "none" }),
      suspiciousMessageEvent({ low_trust_status: "unknown" }),
      suspiciousMessageEvent({ message: { text: "hi", fragments: [] } }),
      suspiciousMessageEvent({ user_id: "" }),
      suspiciousMessageEvent({ user_login: "", user_name: "" }),
      suspiciousMessageEvent({
        message: { message_id: "m", text: "  ", fragments: [] },
      }),
      suspiciousMessageEvent({ message: "plain string" }),
      suspiciousMessageEvent({ broadcaster_user_login: "" }),
    ]

    for (const event of invalid) {
      expect(
        parseSuspiciousUserMessage({ event, channelLogin: null })
      ).toBeNull()
    }
  })
})

describe("createSystemMessageFromSuspiciousUserUpdate", () => {
  test("describes each status change", () => {
    const cases = [
      [
        "active_monitoring",
        "ModName added SusUser as a monitored suspicious chatter.",
        "suspicious_monitored",
      ],
      [
        "restricted",
        "ModName added SusUser as a restricted suspicious chatter.",
        "suspicious_restricted",
      ],
      [
        "none",
        "ModName removed SusUser from the suspicious user list.",
        "suspicious_removed",
      ],
    ] as const

    for (const [status, text, kind] of cases) {
      const message = createSystemMessageFromSuspiciousUserUpdate({
        event: suspiciousUpdateEvent({ low_trust_status: status }),
        channelLogin: null,
        messageId: "evt-1",
        messageTimestamp: "2024-05-01T11:00:00.000Z",
      })

      expect(message).toMatchObject({
        id: "streamer:eventsub:mod_action:suspicious_update:evt-1",
        channel: "streamer",
        roomId: "1001",
        text,
        headline: text,
        modActionKind: kind,
        event: "mod_action",
        receivedAt: "2024-05-01T11:00:00.000Z",
        actor: {
          userId: "3003",
          userName: "modlogin",
          displayName: "ModName",
          color: null,
        },
        target: {
          userId: "2002",
          userName: "sususer",
          displayName: "SusUser",
          color: null,
        },
      })
    }
  })

  test("builds a fallback id without an EventSub message id", () => {
    const message = createSystemMessageFromSuspiciousUserUpdate({
      event: suspiciousUpdateEvent(),
      channelLogin: null,
      messageId: "  ",
    })

    expect(message!.id).toBe(
      `streamer:eventsub:mod_action:suspicious_update:restricted:sususer:${NOW.toISOString()}`
    )
  })

  test("falls back to display names when logins are missing", () => {
    const message = createSystemMessageFromSuspiciousUserUpdate({
      event: suspiciousUpdateEvent({
        moderator_user_login: "",
        user_login: "",
        user_id: "",
      }),
      channelLogin: null,
    })

    expect(message!.actor).toMatchObject({
      userName: "modname",
      displayName: "ModName",
    })
    expect(message!.target).toMatchObject({
      userId: null,
      userName: "sususer",
      displayName: "SusUser",
    })
  })

  test("rejects unknown statuses and missing participants", () => {
    const invalid = [
      suspiciousUpdateEvent({ low_trust_status: "" }),
      suspiciousUpdateEvent({ low_trust_status: "banned" }),
      suspiciousUpdateEvent({
        moderator_user_login: "",
        moderator_user_name: "",
      }),
      suspiciousUpdateEvent({ user_login: "", user_name: "" }),
      suspiciousUpdateEvent({ broadcaster_user_login: "" }),
    ]

    for (const event of invalid) {
      expect(
        createSystemMessageFromSuspiciousUserUpdate({
          event,
          channelLogin: null,
        })
      ).toBeNull()
    }
  })
})
