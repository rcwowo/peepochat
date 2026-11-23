import { describe, expect, test } from "bun:test"

import {
  isIrcClearChatLine,
  isIrcClearMsgLine,
  isIrcJoinLine,
  isIrcNoticeLine,
  isIrcPongLine,
  isIrcPrivmsgLine,
  isIrcRoomStateLine,
  isIrcUsernoticeLine,
  isIrcUserStateLine,
  isIrcWelcomeLine,
  parseIrcAuthFailureNotice,
  parseIrcJoinChannel,
  splitTaggedLine,
} from "@/lib/twitch/chat/irc-line"

describe("splitTaggedLine", () => {
  test("splits tags from the command body", () => {
    const parsed = splitTaggedLine(
      "@badge-info=;badges=broadcaster/1;color=#FF0000;display-name=Streamer :streamer!streamer@streamer.tmi.twitch.tv PRIVMSG #streamer :hello world"
    )

    expect(parsed).not.toBeNull()
    expect(parsed!.rest).toBe(
      ":streamer!streamer@streamer.tmi.twitch.tv PRIVMSG #streamer :hello world"
    )
    expect(parsed!.tags.get("badges")).toBe("broadcaster/1")
    expect(parsed!.tags.get("color")).toBe("#FF0000")
    expect(parsed!.tags.get("badge-info")).toBe("")
  })

  test("keeps tag values raw without unescaping them", () => {
    const parsed = splitTaggedLine(
      String.raw`@system-msg=a\sb\:c\\d :tmi.twitch.tv USERNOTICE #chan`
    )

    expect(parsed!.tags.get("system-msg")).toBe(String.raw`a\sb\:c\\d`)
  })

  test("splits only on the first equals sign of each tag", () => {
    const parsed = splitTaggedLine(
      "@reply-parent-msg-body=a=b=c;id=1 :tmi.twitch.tv PRIVMSG #chan :x"
    )

    expect(parsed!.tags.get("reply-parent-msg-body")).toBe("a=b=c")
    expect(parsed!.tags.get("id")).toBe("1")
  })

  test("treats tags without a value as empty strings", () => {
    const parsed = splitTaggedLine("@vip;mod=1 :tmi.twitch.tv PRIVMSG #chan :x")

    expect(parsed!.tags.has("vip")).toBe(true)
    expect(parsed!.tags.get("vip")).toBe("")
    expect(parsed!.tags.get("mod")).toBe("1")
  })

  test("keeps the trailing message intact including spaces and colons", () => {
    const parsed = splitTaggedLine(
      "@id=1 :a!a@a PRIVMSG #chan :one : two  三 😀"
    )

    expect(parsed!.rest).toBe(":a!a@a PRIVMSG #chan :one : two  三 😀")
  })

  test("returns null when there is no command body", () => {
    expect(splitTaggedLine("@id=1;mod=0")).toBeNull()
  })
})

describe("isIrcWelcomeLine", () => {
  test("matches RPL_WELCOME", () => {
    expect(
      isIrcWelcomeLine(":tmi.twitch.tv 001 justinfan123 :Welcome, GLHF!")
    ).toBe(true)
  })

  test("ignores 001 appearing in tags or chat text", () => {
    const tagged = splitTaggedLine(
      "@user-id=100135110;room-id=1001 :a!a@a PRIVMSG #chan :001 is my favourite number"
    )

    expect(isIrcWelcomeLine(tagged!.rest)).toBe(false)
    expect(isIrcWelcomeLine(":tmi.twitch.tv 002 justinfan123 :Your host")).toBe(
      false
    )
  })
})

describe("isIrcPongLine", () => {
  test("matches prefixed and bare PONG replies", () => {
    expect(
      isIrcPongLine(":tmi.twitch.tv PONG tmi.twitch.tv :tmi.twitch.tv")
    ).toBe(true)
    expect(isIrcPongLine("PONG :tmi.twitch.tv")).toBe(true)
    expect(isIrcPongLine("PONG")).toBe(true)
  })

  test("does not match chat text mentioning PONG", () => {
    expect(isIrcPongLine(":a!a@a PRIVMSG #chan :PONG")).toBe(false)
    expect(isIrcPongLine("PONGS")).toBe(false)
  })
})

describe("JOIN lines", () => {
  test("detects joins and extracts the channel", () => {
    const rest =
      ":justinfan123!justinfan123@justinfan123.tmi.twitch.tv JOIN #forsen"

    expect(isIrcJoinLine(rest)).toBe(true)
    expect(parseIrcJoinChannel(rest)).toBe("forsen")
  })

  test("returns null for non-join lines", () => {
    expect(isIrcJoinLine(":a!a@a PRIVMSG #chan :JOIN #other")).toBe(false)
    expect(parseIrcJoinChannel(":a!a@a PRIVMSG #chan :JOIN #other")).toBeNull()
  })
})

describe("command classification", () => {
  const cases = [
    {
      rest: ":tmi.twitch.tv ROOMSTATE #chan",
      expected: "roomstate",
    },
    {
      rest: ":tmi.twitch.tv USERSTATE #chan",
      expected: "userstate",
    },
    {
      rest: ":a!a@a.tmi.twitch.tv PRIVMSG #chan :hi",
      expected: "privmsg",
    },
    {
      rest: ":tmi.twitch.tv USERNOTICE #chan :resub message",
      expected: "usernotice",
    },
    {
      rest: ":tmi.twitch.tv NOTICE #chan :This room is in slow mode.",
      expected: "notice",
    },
    {
      rest: ":tmi.twitch.tv CLEARMSG #chan :bad words",
      expected: "clearmsg",
    },
    {
      rest: ":tmi.twitch.tv CLEARCHAT #chan :someone",
      expected: "clearchat",
    },
  ] as const

  const classifiers = {
    roomstate: isIrcRoomStateLine,
    userstate: isIrcUserStateLine,
    privmsg: isIrcPrivmsgLine,
    usernotice: isIrcUsernoticeLine,
    notice: isIrcNoticeLine,
    clearmsg: isIrcClearMsgLine,
    clearchat: isIrcClearChatLine,
  } as const

  for (const { rest, expected } of cases) {
    test(`classifies ${expected} lines exclusively`, () => {
      for (const [name, classify] of Object.entries(classifiers)) {
        expect(classify(rest)).toBe(name === expected)
      }
    })
  }

  test("does not classify chat text that contains a command keyword", () => {
    const rest =
      ":a!a@a PRIVMSG #chan :USERNOTICE #chan CLEARCHAT #chan NOTICE #chan"

    expect(isIrcPrivmsgLine(rest)).toBe(true)
    expect(isIrcUsernoticeLine(rest)).toBe(false)
    expect(isIrcClearChatLine(rest)).toBe(false)
    expect(isIrcNoticeLine(rest)).toBe(false)
  })

  test("requires a channel target", () => {
    expect(
      isIrcNoticeLine(":tmi.twitch.tv NOTICE * :Improperly formatted auth")
    ).toBe(false)
    expect(isIrcClearChatLine(":tmi.twitch.tv CLEARCHAT")).toBe(false)
  })
})

describe("parseIrcAuthFailureNotice", () => {
  test("returns the notice text for authentication failures", () => {
    expect(
      parseIrcAuthFailureNotice(
        ":tmi.twitch.tv NOTICE * :Login authentication failed"
      )
    ).toBe("Login authentication failed")
    expect(
      parseIrcAuthFailureNotice(":tmi.twitch.tv NOTICE * :Invalid OAuth token")
    ).toBe("Invalid OAuth token")
  })

  test("ignores other global notices and channel notices", () => {
    expect(
      parseIrcAuthFailureNotice(
        ":tmi.twitch.tv NOTICE * :Improperly formatted auth"
      )
    ).toBeNull()
    expect(
      parseIrcAuthFailureNotice(
        ":tmi.twitch.tv NOTICE #chan :Login authentication failed"
      )
    ).toBeNull()
    expect(
      parseIrcAuthFailureNotice(":tmi.twitch.tv 001 nick :Welcome")
    ).toBeNull()
  })
})
