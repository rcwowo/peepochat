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

beforeEach(() => {
  fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Network access is not allowed in tests")
  )
})

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled()
  fetchSpy.mockRestore()
})

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
      ["/timeout", "Usage: /timeout <username> [seconds] [reason]"],
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
    test.each(["abc", "0", "-5"])("/slow rejects %p", async (value) => {
      expect(await executeChatCommand(`/slow ${value}`, moderator())).toEqual(
        error(`"${value}" is not a valid number.`)
      )
    })

    test("/followers rejects invalid durations", async () => {
      expect(await executeChatCommand("/followers soon", moderator())).toEqual(
        error('"soon" is not a valid number.')
      )
    })

    test("/commercial rejects invalid lengths", async () => {
      expect(
        await executeChatCommand("/commercial zero", broadcaster())
      ).toEqual(error('"zero" is not a valid number.'))
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
