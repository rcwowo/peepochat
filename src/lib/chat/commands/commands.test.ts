import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import type { Mock } from "bun:test"

import {
  executeChatCommand,
  type ChatCommandContext,
  type ChatCommandResult,
} from "@/lib/chat/commands/commands"
import { CHAT_COMMAND_SCOPES } from "@/lib/chat/commands/scopes"
import type { TwitchAccount } from "@/lib/peepochat/peepochat-config"
import type { TwitchSelfChatState } from "@/lib/twitch/chat/types"

const ALL_SCOPES = Object.values(CHAT_COMMAND_SCOPES)
const BROADCASTER_ID = "500"

function account(scopes: string[] = ALL_SCOPES, id = "100"): TwitchAccount {
  return {
    id,
    login: "tester",
    displayName: "Tester",
    profileImageUrl: "",
    bannerImageUrl: "",
    accessToken: "token",
    clientId: "client",
    scopes,
  }
}

function selfState(isModerator: boolean): TwitchSelfChatState {
  return {
    channel: "channel",
    roomId: BROADCASTER_ID,
    displayName: "Tester",
    color: null,
    badges: [],
    isBroadcaster: false,
    isModerator,
    isSubscriber: false,
    isVip: false,
  }
}

function context(overrides: Partial<ChatCommandContext> = {}) {
  return {
    account: account(),
    channelLogin: "channel",
    broadcasterId: BROADCASTER_ID,
    selfState: selfState(false),
    ...overrides,
  } satisfies ChatCommandContext
}

const viewer = (scopes?: string[]) => context({ account: account(scopes) })
const moderator = (scopes?: string[]) =>
  context({ account: account(scopes), selfState: selfState(true) })
const broadcaster = (scopes?: string[]) =>
  context({ account: account(scopes, BROADCASTER_ID) })

function error(message: string): ChatCommandResult {
  return { handled: true, kind: "feedback", level: "error", message }
}

function missingScope(scope: string) {
  return error(
    `Missing permission (${scope}). Sign out and sign back in to grant updated scopes.`
  )
}

let fetchSpy: Mock<typeof fetch>
let allowFetch = false

beforeEach(() => {
  allowFetch = false
  fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Network access is not allowed in tests")
  )
})

afterEach(() => {
  if (!allowFetch) {
    expect(fetchSpy).not.toHaveBeenCalled()
  }
  fetchSpy.mockRestore()
})

type HelixRequest = { method: string; path: string; body: unknown }

function mockHelix(users: Array<{ id: string; login: string }> = []) {
  allowFetch = true
  const requests: HelixRequest[] = []

  const respond = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    requests.push({
      method: init?.method ?? "GET",
      path: url.pathname,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    })

    if (url.pathname === "/helix/users") {
      const logins = url.searchParams.getAll("login")
      return Response.json({
        data: users
          .filter((user) => logins.includes(user.login))
          .map((user) => ({ ...user, display_name: user.login })),
      })
    }

    return new Response(null, { status: 204 })
  }
  fetchSpy.mockImplementation(respond as unknown as typeof fetch)

  return requests
}

function lastWrite(requests: HelixRequest[]) {
  return requests.filter((request) => request.method !== "GET").at(-1)
}

describe("executeChatCommand", () => {
  test("ignores input that is not a slash command", async () => {
    expect(await executeChatCommand("hello /ban", context())).toEqual({
      handled: false,
    })
  })

  test("rejects unknown commands before checking the account", async () => {
    expect(
      await executeChatCommand("/Frobnicate now", context({ account: null }))
    ).toEqual(error("Unknown command: /frobnicate"))
  })

  test("requires a signed-in account", async () => {
    expect(
      await executeChatCommand("/ban someone", context({ account: null }))
    ).toEqual(error("Sign in with Twitch to use chat commands."))
  })

  test("requires channel information for channel commands", async () => {
    expect(
      await executeChatCommand("/me waves", context({ broadcasterId: null }))
    ).toEqual(error("Channel information is not available yet."))
  })

  test("validates user commands without channel information", async () => {
    const ctx = context({ broadcasterId: null })

    expect(await executeChatCommand("/user", ctx)).toEqual(
      error("Usage: /user <username>")
    )
    expect(await executeChatCommand("/block", ctx)).toEqual(
      error("Usage: /block <username>")
    )
    expect(await executeChatCommand("/unblock   ", ctx)).toEqual(
      error("Usage: /unblock <username>")
    )
  })

  test.each(["/user @", "/block @", "/unblock @"])(
    "%s requires a username after the @",
    async (input) => {
      expect(
        await executeChatCommand(input, context({ broadcasterId: null }))
      ).toEqual(error("A username is required."))
    }
  )

  test("requires the block scope for block and unblock", async () => {
    const ctx = context({ account: account([]), broadcasterId: null })
    const expected = missingScope(CHAT_COMMAND_SCOPES.blockedUsersManage)

    expect(await executeChatCommand("/block someone", ctx)).toEqual(expected)
    expect(await executeChatCommand("/unblock someone", ctx)).toEqual(expected)
  })

  describe("/me", () => {
    test("requires an action", async () => {
      expect(await executeChatCommand("/me", viewer())).toEqual(
        error("Usage: /me <action>")
      )
    })

    test("returns the action text with inner spacing preserved", async () => {
      expect(
        await executeChatCommand("  /ME  waves   hello  ", viewer([]))
      ).toEqual({ handled: true, kind: "me", text: "waves   hello" })
    })
  })

  describe("moderator-only commands", () => {
    test.each([
      ["/announce hi", "You must be a moderator to send announcements."],
      ["/ban someone", "You must be a moderator to use this command."],
      ["/timeout someone 5", "You must be a moderator to use this command."],
      ["/unban someone", "You must be a moderator to use this command."],
      ["/untimeout someone", "You must be a moderator to use this command."],
      ["/clear", "You must be a moderator to clear chat."],
      ["/slow 5", "You must be a moderator to update chat settings."],
      ["/followers", "You must be a moderator to update chat settings."],
      ["/emoteonlyoff", "You must be a moderator to update chat settings."],
      ["/shoutout someone", "You must be a moderator to send a shoutout."],
      ["/so someone", "You must be a moderator to send a shoutout."],
      [
        "/marker clip",
        "You must be the broadcaster or a moderator to add a marker.",
      ],
    ])("%s rejects viewers", async (input, message) => {
      expect(await executeChatCommand(input, viewer())).toEqual(error(message))
    })

    test("checks moderator status before scopes", async () => {
      expect(await executeChatCommand("/clear", viewer([]))).toEqual(
        error("You must be a moderator to clear chat.")
      )
    })

    test("treats the broadcaster as a moderator", async () => {
      expect(await executeChatCommand("/clear", broadcaster([]))).toEqual(
        missingScope(CHAT_COMMAND_SCOPES.chatMessages)
      )
    })

    test.each([
      ["/announce hi", CHAT_COMMAND_SCOPES.announcements],
      ["/ban someone", CHAT_COMMAND_SCOPES.bannedUsers],
      ["/untimeout someone", CHAT_COMMAND_SCOPES.bannedUsers],
      ["/clear", CHAT_COMMAND_SCOPES.chatMessages],
      ["/uniquechat", CHAT_COMMAND_SCOPES.chatSettings],
      ["/so someone", CHAT_COMMAND_SCOPES.shoutouts],
      ["/marker", CHAT_COMMAND_SCOPES.broadcast],
    ])("%s requires %s", async (input, scope) => {
      expect(await executeChatCommand(input, moderator([]))).toEqual(
        missingScope(scope)
      )
    })

    test.each([
      ["/ban", "Usage: /ban <username> [reason]"],
      ["/timeout", "Usage: /timeout <username> [duration] [reason]"],
      ["/unban", "Usage: /unban <username>"],
      ["/untimeout", "Usage: /untimeout <username>"],
      ["/shoutout", "Usage: /shoutout <username>"],
      ["/so", "Usage: /shoutout <username>"],
    ])("%s without a username shows usage", async (input, message) => {
      expect(await executeChatCommand(input, moderator())).toEqual(
        error(message)
      )
    })

    test.each(["/ban @", "/timeout @ 60", "/unban @", "/so @"])(
      "%s requires a username after the @",
      async (input) => {
        expect(await executeChatCommand(input, moderator())).toEqual(
          error("A username is required.")
        )
      }
    )
  })

  describe("/announce", () => {
    test("requires a message", async () => {
      expect(await executeChatCommand("/announce", moderator())).toEqual(
        error("Usage: /announce [color] <message>")
      )
    })

    test("requires a message after a color", async () => {
      expect(await executeChatCommand("/announce BLUE  ", moderator())).toEqual(
        error("Usage: /announce [color] <message>")
      )
    })
  })

  describe("numeric arguments", () => {
    test.each(["abc", "-5", "10abc", "1.5", "10s"])(
      "/slow rejects %p",
      async (value) => {
        expect(await executeChatCommand(`/slow ${value}`, moderator())).toEqual(
          error(`"${value}" is not a valid number.`)
        )
      }
    )

    test.each(["0", "2", "121"])(
      "/slow rejects %p as out of range",
      async (value) => {
        expect(await executeChatCommand(`/slow ${value}`, moderator())).toEqual(
          error("Slow mode wait time must be between 3 and 120 seconds.")
        )
      }
    )

    test.each([
      ["/slow", 30],
      ["/slow 3", 3],
      ["/slow 120", 120],
    ])("%s sets a %p second wait time", async (input, seconds) => {
      const requests = mockHelix()

      expect(await executeChatCommand(input, moderator())).toEqual({
        handled: true,
        kind: "feedback",
        message: "Updated chat setting (slow).",
      })
      expect(lastWrite(requests)).toEqual({
        method: "PATCH",
        path: "/helix/chat/settings",
        body: { slow_mode: true, slow_mode_wait_time: seconds },
      })
    })

    test.each(["soon", "10x", "90s", "10 foo"])(
      "/followers rejects %p",
      async (value) => {
        expect(
          await executeChatCommand(`/followers ${value}`, moderator())
        ).toEqual(
          error(
            `"${value}" is not a valid duration. Use minutes or a number with a unit (m, h, d, w, mo), e.g. 1w.`
          )
        )
      }
    )

    test.each(["129601", "4mo", "13w"])(
      "/followers rejects %p as out of range",
      async (value) => {
        expect(
          await executeChatCommand(`/followers ${value}`, moderator())
        ).toEqual(
          error(
            "Followers-only duration must be between 0 minutes and 3 months."
          )
        )
      }
    )

    test.each([
      ["/followers", 0],
      ["/followers 0", 0],
      ["/followers 30", 30],
      ["/followers 1h", 60],
      ["/followers 1 week", 10080],
      ["/followers 5 days 12 hours", 7920],
      ["/followers 3mo", 129600],
    ])("%s sets a %p minute duration", async (input, minutes) => {
      const requests = mockHelix()

      expect(await executeChatCommand(input, moderator())).toEqual({
        handled: true,
        kind: "feedback",
        message: "Updated chat setting (followers).",
      })
      expect(lastWrite(requests)).toEqual({
        method: "PATCH",
        path: "/helix/chat/settings",
        body: { follower_mode: true, follower_mode_duration: minutes },
      })
    })

    test.each(["zero", "30abc", "-30"])(
      "/commercial rejects %p",
      async (value) => {
        expect(
          await executeChatCommand(`/commercial ${value}`, broadcaster())
        ).toEqual(error(`"${value}" is not a valid number.`))
      }
    )
  })

  describe("/timeout", () => {
    const target = { id: "42", login: "someone" }

    test.each(["10x", "1.5h", "-5", "+5", "10m5"])(
      "rejects the malformed duration %p",
      async (value) => {
        expect(
          await executeChatCommand(
            `/timeout someone ${value} spam`,
            moderator()
          )
        ).toEqual(
          error(
            `"${value}" is not a valid duration. Use seconds or a number with a unit (s, m, h, d, w), e.g. 10m.`
          )
        )
      }
    )

    test.each(["0", "0s", "3w", "1209601", "15d"])(
      "rejects the out of range duration %p",
      async (value) => {
        expect(
          await executeChatCommand(`/timeout someone ${value}`, moderator())
        ).toEqual(
          error("Timeout duration must be between 1 second and 2 weeks.")
        )
      }
    )

    test("checks the username before the duration", async () => {
      expect(await executeChatCommand("/timeout @ 10x", moderator())).toEqual(
        error("A username is required.")
      )
    })

    test.each([
      ["90", 90],
      ["10m", 600],
      ["10M", 600],
      ["1h", 3600],
      ["1d2h", 93600],
      ["2w", 1209600],
    ])("times out for %p as %p seconds", async (value, seconds) => {
      const requests = mockHelix([target])

      expect(
        await executeChatCommand(
          `/timeout @someone ${value} being  rude`,
          moderator()
        )
      ).toEqual({
        handled: true,
        kind: "feedback",
        message: "Timed out someone.",
      })
      expect(lastWrite(requests)).toEqual({
        method: "POST",
        path: "/helix/moderation/bans",
        body: {
          data: { user_id: "42", duration: seconds, reason: "being  rude" },
        },
      })
    })

    test("treats a non-duration first word as the reason", async () => {
      const requests = mockHelix([target])

      await executeChatCommand("/timeout someone being rude", moderator())
      expect(lastWrite(requests)?.body).toEqual({
        data: { user_id: "42", duration: 600, reason: "being rude" },
      })
    })

    test("uses the default duration without arguments", async () => {
      const requests = mockHelix([target])

      await executeChatCommand("/timeout someone", moderator())
      expect(lastWrite(requests)?.body).toEqual({
        data: { user_id: "42", duration: 600 },
      })
    })

    test("does not parse durations for /ban", async () => {
      const requests = mockHelix([target])

      await executeChatCommand("/ban someone 10m spam", moderator())
      expect(lastWrite(requests)?.body).toEqual({
        data: { user_id: "42", reason: "10m spam" },
      })
    })
  })

  describe("broadcaster-only commands", () => {
    test.each([
      ["/commercial", "Only the broadcaster can start a commercial."],
      ["/mod someone", "Only the broadcaster can manage moderators."],
      ["/unmod someone", "Only the broadcaster can manage moderators."],
      ["/vip someone", "Only the broadcaster can manage VIPs."],
      ["/unvip someone", "Only the broadcaster can manage VIPs."],
      ["/raid someone", "Only the broadcaster can start a raid."],
      ["/unraid", "Only the broadcaster can cancel a raid."],
    ])("%s rejects moderators", async (input, message) => {
      expect(await executeChatCommand(input, moderator())).toEqual(
        error(message)
      )
    })

    test.each([
      ["/commercial", CHAT_COMMAND_SCOPES.commercial],
      ["/mod someone", CHAT_COMMAND_SCOPES.moderators],
      ["/vip someone", CHAT_COMMAND_SCOPES.vips],
      ["/raid someone", CHAT_COMMAND_SCOPES.raids],
      ["/unraid", CHAT_COMMAND_SCOPES.raids],
    ])("%s requires %s", async (input, scope) => {
      expect(await executeChatCommand(input, broadcaster([]))).toEqual(
        missingScope(scope)
      )
    })

    test.each([
      ["/mod", "Usage: /mod <username>"],
      ["/unmod", "Usage: /unmod <username>"],
      ["/vip", "Usage: /vip <username>"],
      ["/unvip", "Usage: /unvip <username>"],
      ["/raid", "Usage: /raid <username>"],
    ])("%s without a username shows usage", async (input, message) => {
      expect(await executeChatCommand(input, broadcaster())).toEqual(
        error(message)
      )
    })

    test.each(["/mod @", "/vip @", "/raid @"])(
      "%s requires a username after the @",
      async (input) => {
        expect(await executeChatCommand(input, broadcaster())).toEqual(
          error("A username is required.")
        )
      }
    )
  })
})
