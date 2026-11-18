import {
  afterEach,
  beforeEach,
  describe,
  expect,
  setSystemTime,
  test,
} from "bun:test"

import {
  createSystemMessageFromChannelModerate,
  parseChannelModerateAction,
} from "@/lib/twitch/eventsub/moderate"

const MESSAGE_TIMESTAMP = "2024-05-01T12:00:00.000Z"

function moderateEvent(
  action: string,
  target: Record<string, unknown> | null,
  overrides: Record<string, unknown> = {}
) {
  return {
    broadcaster_user_id: "1001",
    broadcaster_user_login: "streamer",
    broadcaster_user_name: "Streamer",
    source_broadcaster_user_id: null,
    moderator_user_id: "3003",
    moderator_user_login: "modlogin",
    moderator_user_name: "ModName",
    action,
    [action]: target,
    ...overrides,
  }
}

const target = {
  user_id: "2002",
  user_login: "baduser",
  user_name: "BadUser",
  reason: "spam",
}

describe("parseChannelModerateAction", () => {
  test("parses a timeout and derives its duration from expires_at", () => {
    const parsed = parseChannelModerateAction({
      event: moderateEvent("timeout", {
        ...target,
        expires_at: "2024-05-01T12:10:00.000Z",
      }),
      channelLogin: null,
      messageTimestamp: MESSAGE_TIMESTAMP,
    })

    expect(parsed).toEqual({
      kind: "timeout",
      channelLogin: "streamer",
      targetUserId: "2002",
      targetUserName: "baduser",
      targetDisplayName: "BadUser",
      banDurationSeconds: 600,
      moderatorUserId: "3003",
      moderatorUserName: "modlogin",
      moderatorDisplayName: "ModName",
    })
  })

  test("rounds sub-second durations and rejects expired or invalid timestamps", () => {
    const durationFor = (expiresAt: string, messageTimestamp?: string) =>
      parseChannelModerateAction({
        event: moderateEvent("timeout", { ...target, expires_at: expiresAt }),
        channelLogin: null,
        messageTimestamp: messageTimestamp ?? MESSAGE_TIMESTAMP,
      })!.banDurationSeconds

    expect(durationFor("2024-05-01T12:00:59.600Z")).toBe(60)
    expect(durationFor("2024-05-01T11:59:00.000Z")).toBeNull()
    expect(durationFor("not a date")).toBeNull()
    expect(durationFor("")).toBeNull()
  })

  describe("without a message timestamp", () => {
    beforeEach(() => {
      setSystemTime(new Date(MESSAGE_TIMESTAMP))
    })

    afterEach(() => {
      setSystemTime()
    })

    test("measures the duration from now", () => {
      const parsed = parseChannelModerateAction({
        event: moderateEvent("timeout", {
          ...target,
          expires_at: "2024-05-01T12:05:00.000Z",
        }),
        channelLogin: null,
      })

      expect(parsed!.banDurationSeconds).toBe(300)
    })

    test("measures the duration from now when the timestamp is invalid", () => {
      const parsed = parseChannelModerateAction({
        event: moderateEvent("timeout", {
          ...target,
          expires_at: "2024-05-01T12:05:00.000Z",
        }),
        channelLogin: null,
        messageTimestamp: "garbage",
      })

      expect(parsed!.banDurationSeconds).toBe(300)
    })
  })

  test("maps shared chat actions onto their base kind using the shared payload key", () => {
    const kinds = [
      ["shared_chat_timeout", "timeout"],
      ["shared_chat_ban", "ban"],
      ["shared_chat_untimeout", "untimeout"],
      ["shared_chat_unban", "unban"],
    ] as const

    for (const [action, kind] of kinds) {
      const parsed = parseChannelModerateAction({
        event: moderateEvent(action, target, { timeout: null, ban: null }),
        channelLogin: null,
        messageTimestamp: MESSAGE_TIMESTAMP,
      })

      expect(parsed!.kind).toBe(kind)
      expect(parsed!.targetUserName).toBe("baduser")
    }
  })

  test("only reports a duration for timeouts", () => {
    const parsed = parseChannelModerateAction({
      event: moderateEvent("ban", {
        ...target,
        expires_at: "2024-05-01T12:10:00.000Z",
      }),
      channelLogin: null,
      messageTimestamp: MESSAGE_TIMESTAMP,
    })

    expect(parsed!.banDurationSeconds).toBeNull()
  })

  test("ignores unsupported actions", () => {
    for (const action of ["clear", "delete", "warn", "slow", "vip", ""]) {
      expect(
        parseChannelModerateAction({
          event: moderateEvent(action, target),
          channelLogin: null,
        })
      ).toBeNull()
    }
  })

  test("requires a target, a moderator and a channel", () => {
    expect(
      parseChannelModerateAction({
        event: moderateEvent("ban", null),
        channelLogin: null,
      })
    ).toBeNull()
    expect(
      parseChannelModerateAction({
        event: moderateEvent("ban", { user_id: "1", user_login: " " }),
        channelLogin: null,
      })
    ).toBeNull()
    expect(
      parseChannelModerateAction({
        event: moderateEvent("ban", target, {
          moderator_user_login: "",
          moderator_user_name: "",
        }),
        channelLogin: null,
      })
    ).toBeNull()
    expect(
      parseChannelModerateAction({
        event: moderateEvent("ban", target, { broadcaster_user_login: "" }),
        channelLogin: null,
      })
    ).toBeNull()
  })

  test("derives missing logins from display names", () => {
    const parsed = parseChannelModerateAction({
      event: moderateEvent(
        "ban",
        { user_name: "OnlyDisplay" },
        { moderator_user_login: "", moderator_user_name: "ModOnly" }
      ),
      channelLogin: "#Chan",
    })

    expect(parsed).toMatchObject({
      channelLogin: "chan",
      targetUserId: null,
      targetUserName: "onlydisplay",
      targetDisplayName: "OnlyDisplay",
      moderatorUserName: "modonly",
      moderatorDisplayName: "ModOnly",
    })
  })
})

describe("createSystemMessageFromChannelModerate", () => {
  test("creates a mod action system message keyed by the EventSub message id", () => {
    const message = createSystemMessageFromChannelModerate({
      event: moderateEvent("timeout", {
        ...target,
        expires_at: "2024-05-01T12:00:30.000Z",
      }),
      channelLogin: null,
      messageId: "evt-123",
      messageTimestamp: MESSAGE_TIMESTAMP,
    })

    expect(message).toMatchObject({
      id: "streamer:eventsub:mod_action:evt-123",
      channel: "streamer",
      roomId: "1001",
      text: "ModName timed out BadUser for 30s.",
      receivedAt: MESSAGE_TIMESTAMP,
      event: "mod_action",
      modActionKind: "timeout",
      banDurationSeconds: 30,
      actor: { userId: "3003", userName: "modlogin", displayName: "ModName" },
      target: { userId: "2002", userName: "baduser", displayName: "BadUser" },
    })
  })

  test("uses the provided room id over the broadcaster id", () => {
    const message = createSystemMessageFromChannelModerate({
      event: moderateEvent("unban", target),
      channelLogin: "streamer",
      roomId: "override",
      messageId: "evt-1",
      messageTimestamp: MESSAGE_TIMESTAMP,
    })

    expect(message!.roomId).toBe("override")
    expect(message!.text).toBe("ModName unbanned BadUser.")
  })

  test("returns null for unsupported actions", () => {
    expect(
      createSystemMessageFromChannelModerate({
        event: moderateEvent("emoteonly", null),
        channelLogin: null,
      })
    ).toBeNull()
  })
})
