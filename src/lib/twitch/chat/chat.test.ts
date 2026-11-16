import {
  afterEach,
  beforeEach,
  describe,
  expect,
  setSystemTime,
  test,
} from "bun:test"

import {
  createChatModesSystemMessage,
  createClearChatModActionMessage,
  createModerateActionMessage,
  getEmoteConsumedEnd,
  isAnonymousBanTimeoutSystemMessage,
  parseGifsTag,
  parseIrcPrivmsg,
  TwitchChatClient,
  type TwitchChatEvent,
  type TwitchEmote,
  type TwitchSystemMessage,
} from "@/lib/twitch/chat/chat"

const TMI_TS = 1_700_000_000_000
const TMI_ISO = new Date(TMI_TS).toISOString()

function emote(start: number, end: number, overlays?: TwitchEmote[]) {
  return {
    id: "1",
    code: "x",
    provider: "7tv" as const,
    imageUrl: "",
    start,
    end,
    overlays,
  }
}

describe("parseIrcPrivmsg", () => {
  test("parses a standard tagged PRIVMSG", () => {
    const message = parseIrcPrivmsg(
      `@badge-info=subscriber/14;badges=moderator/1,subscriber/12;color=#1E90FF;display-name=CoolGuy;emotes=;first-msg=0;id=b3f5c7a9-1111-2222-3333-444455556666;mod=1;room-id=22484632;subscriber=1;tmi-sent-ts=${TMI_TS};user-id=12345 :coolguy!coolguy@coolguy.tmi.twitch.tv PRIVMSG #forsen :hello chat`
    )

    expect(message).toEqual({
      id: "b3f5c7a9-1111-2222-3333-444455556666",
      channel: "forsen",
      roomId: "22484632",
      sourceRoomId: null,
      userId: "12345",
      userName: "coolguy",
      displayName: "CoolGuy",
      text: "hello chat",
      color: "#1E90FF",
      receivedAt: TMI_ISO,
      badges: [
        { set: "moderator", version: "1" },
        { set: "subscriber", version: "12" },
      ],
      badgeInfo: [{ set: "subscriber", version: "14" }],
      emotes: [],
      gifs: [],
      reply: null,
      bits: null,
      deletedAt: null,
      flags: {
        isBroadcaster: false,
        isModerator: true,
        isSubscriber: true,
        isVip: false,
        isFirst: false,
        isAction: false,
      },
    })
  })

  test("rejects lines without tags or that are not PRIVMSG", () => {
    expect(
      parseIrcPrivmsg(":a!a@a.tmi.twitch.tv PRIVMSG #chan :untagged")
    ).toBeNull()
    expect(
      parseIrcPrivmsg("@room-id=1 :tmi.twitch.tv USERNOTICE #chan :hello")
    ).toBeNull()
    expect(parseIrcPrivmsg("@id=1")).toBeNull()
  })

  test("keeps colons and leading spaces inside the message body", () => {
    const message = parseIrcPrivmsg(
      "@id=1 :a!a@a.tmi.twitch.tv PRIVMSG #chan ::)  spaced: out"
    )

    expect(message!.text).toBe(":)  spaced: out")
  })

  test("accepts a body without the trailing colon", () => {
    const message = parseIrcPrivmsg(
      "@id=1 :a!a@a.tmi.twitch.tv PRIVMSG #chan hi"
    )

    expect(message!.text).toBe("hi")
  })

  test("accepts a PRIVMSG with an empty body", () => {
    const message = parseIrcPrivmsg("@id=1 :a!a@a.tmi.twitch.tv PRIVMSG #chan")

    expect(message!.text).toBe("")
  })

  test("unescapes the display-name tag and falls back to the login", () => {
    const escaped = parseIrcPrivmsg(
      String.raw`@display-name=Some\sName;id=1 :somename!somename@somename.tmi.twitch.tv PRIVMSG #chan :hi`
    )
    const missing = parseIrcPrivmsg(
      "@display-name=;id=2 :somename!somename@somename.tmi.twitch.tv PRIVMSG #chan :hi"
    )

    expect(escaped!.displayName).toBe("Some Name")
    expect(missing!.displayName).toBe("somename")
  })

  test("detects /me ACTION messages and strips the CTCP wrapper", () => {
    const message = parseIrcPrivmsg(
      "@id=1 :a!a@a.tmi.twitch.tv PRIVMSG #chan :\x01ACTION waves hello\x01"
    )

    expect(message!.text).toBe("waves hello")
    expect(message!.flags.isAction).toBe(true)
  })

  test("maps emote code-point ranges to UTF-16 indices around emoji", () => {
    const message = parseIrcPrivmsg(
      "@emotes=25:2-6,14-18/1902:8-12;id=1 :a!a@a.tmi.twitch.tv PRIVMSG #chan :😀 Kappa Keepo Kappa"
    )

    expect(
      message!.emotes.map(({ id, code, start, end }) => ({
        id,
        code,
        start,
        end,
      }))
    ).toEqual([
      { id: "25", code: "Kappa", start: 3, end: 7 },
      { id: "1902", code: "Keepo", start: 9, end: 13 },
      { id: "25", code: "Kappa", start: 15, end: 19 },
    ])
    expect(message!.emotes[0].provider).toBe("twitch")
    expect(message!.emotes[0].imageUrl).toContain("/emoticons/v2/25/")
  })

  test("drops malformed and out-of-range emote positions", () => {
    const message = parseIrcPrivmsg(
      "@emotes=25:0-4,abc-def,40-44/:1-2/99;id=1 :a!a@a.tmi.twitch.tv PRIVMSG #chan :Kappa"
    )

    expect(message!.emotes.map((entry) => entry.code)).toEqual(["Kappa"])
  })

  test("parses reply tags with an escaped parent body", () => {
    const message = parseIrcPrivmsg(
      String.raw`@id=2;reply-parent-display-name=Parent;reply-parent-msg-body=hey\sthere\:\sok\\;reply-parent-msg-id=parent-id;reply-parent-user-id=7;reply-parent-user-login=parent;reply-thread-parent-msg-id=root-id;reply-thread-parent-user-login=root :a!a@a.tmi.twitch.tv PRIVMSG #chan :@Parent yes`
    )

    expect(message!.reply).toEqual({
      parentMessageId: "parent-id",
      threadRootMessageId: "root-id",
      parentDisplayName: "Parent",
      parentUserName: "parent",
      parentBody: "hey there; ok\\",
      parentColor: null,
    })
  })

  test("decodes tag escapes in a single pass", () => {
    const message = parseIrcPrivmsg(
      String.raw`@display-name=A\\sB;id=3;reply-parent-display-name=Par\\sent;reply-parent-msg-body=a\\\\b\\:c\\\:d\\r\\n\x\:\s\r\n\\end\;reply-parent-msg-id=parent-id;reply-parent-user-login=parent :a!a@a.tmi.twitch.tv PRIVMSG #chan :hi`
    )

    expect(message!.displayName).toBe("A\\sB")
    expect(message!.reply!.parentDisplayName).toBe("Par\\sent")
    expect(message!.reply!.parentBody).toBe("a\\\\b\\:c\\;d\\r\\nx; \r\n\\end")
  })

  test("uses the parent as the thread root and the login as display name when missing", () => {
    const message = parseIrcPrivmsg(
      "@id=2;reply-parent-msg-id=parent-id;reply-parent-user-login=parent :a!a@a.tmi.twitch.tv PRIVMSG #chan :hi"
    )

    expect(message!.reply!.threadRootMessageId).toBe("parent-id")
    expect(message!.reply!.parentDisplayName).toBe("parent")
    expect(message!.reply!.parentBody).toBe("")
  })

  test("parses bits and ignores non-numeric bits", () => {
    const cheer = parseIrcPrivmsg(
      "@bits=100;id=1 :a!a@a.tmi.twitch.tv PRIVMSG #chan :Cheer100 nice"
    )
    const junk = parseIrcPrivmsg(
      "@bits=lots;id=1 :a!a@a.tmi.twitch.tv PRIVMSG #chan :Cheer100 nice"
    )

    expect(cheer!.bits).toBe(100)
    expect(junk!.bits).toBeNull()
  })

  test("derives role flags from tags and badges", () => {
    const message = parseIrcPrivmsg(
      "@badges=broadcaster/1,vip/1;first-msg=1;id=1;mod=0;subscriber=0;vip :a!a@a.tmi.twitch.tv PRIVMSG #a :hi"
    )

    expect(message!.flags).toEqual({
      isBroadcaster: true,
      isModerator: false,
      isSubscriber: false,
      isVip: true,
      isFirst: true,
      isAction: false,
    })
  })

  test("uses source badges and badge-derived flags for shared chat messages from another room", () => {
    const message = parseIrcPrivmsg(
      "@badges=;badge-info=;id=1;mod=0;room-id=111;source-badges=moderator/1,founder/0;source-badge-info=founder/3;source-room-id=222;subscriber=0 :a!a@a.tmi.twitch.tv PRIVMSG #chan :shared"
    )

    expect(message!.sourceRoomId).toBe("222")
    expect(message!.badges).toEqual([
      { set: "moderator", version: "1" },
      { set: "founder", version: "0" },
    ])
    expect(message!.badgeInfo).toEqual([{ set: "founder", version: "3" }])
    expect(message!.flags.isModerator).toBe(true)
    expect(message!.flags.isSubscriber).toBe(true)
    expect(message!.flags.isVip).toBe(false)
  })

  test("treats shared chat messages from the current room as local", () => {
    const message = parseIrcPrivmsg(
      "@badges=subscriber/6;id=1;mod=1;room-id=111;source-badges=vip/1;source-room-id=111;subscriber=1 :a!a@a.tmi.twitch.tv PRIVMSG #chan :local"
    )

    expect(message!.sourceRoomId).toBeNull()
    expect(message!.badges).toEqual([{ set: "subscriber", version: "6" }])
    expect(message!.flags.isModerator).toBe(true)
    expect(message!.flags.isVip).toBe(false)
  })

  test("falls back to local badges when a shared message has no source badges", () => {
    const message = parseIrcPrivmsg(
      "@badges=vip/1;id=1;room-id=111;source-room-id=222 :a!a@a.tmi.twitch.tv PRIVMSG #chan :x"
    )

    expect(message!.badges).toEqual([{ set: "vip", version: "1" }])
    expect(message!.flags.isVip).toBe(true)
  })

  test("defaults badge versions to 1 and skips empty badge entries", () => {
    const message = parseIrcPrivmsg(
      "@badges=premium,,turbo/1;id=1 :a!a@a.tmi.twitch.tv PRIVMSG #chan :x"
    )

    expect(message!.badges).toEqual([
      { set: "premium", version: "1" },
      { set: "turbo", version: "1" },
    ])
  })

  test("prefers rm-received-ts over tmi-sent-ts for the received time", () => {
    const message = parseIrcPrivmsg(
      `@id=1;rm-received-ts=${TMI_TS + 5000};tmi-sent-ts=${TMI_TS} :a!a@a.tmi.twitch.tv PRIVMSG #chan :x`
    )
    const fallback = parseIrcPrivmsg(
      `@id=1;rm-received-ts=nope;tmi-sent-ts=${TMI_TS} :a!a@a.tmi.twitch.tv PRIVMSG #chan :x`
    )

    expect(message!.receivedAt).toBe(new Date(TMI_TS + 5000).toISOString())
    expect(fallback!.receivedAt).toBe(TMI_ISO)
  })

  describe("without an id tag", () => {
    beforeEach(() => {
      setSystemTime(new Date(TMI_TS))
    })

    afterEach(() => {
      setSystemTime()
    })

    test("generates an id from the channel, user, time and text", () => {
      const message = parseIrcPrivmsg(
        "@color= :a!a@a.tmi.twitch.tv PRIVMSG #chan :x"
      )

      expect(message!.id).toBe(`chan:a:${TMI_TS}:x`)
      expect(message!.receivedAt).toBe(TMI_ISO)
    })
  })
})

describe("parseGifsTag", () => {
  test("parses gif ranges and sorts them by position", () => {
    const text = "😀 gif1 gif2"
    const gifs = parseGifsTag(
      "7-10|second|https://media.example/b.gif,2-5|first|https://media.example/a.gif",
      text
    )

    expect(gifs).toEqual([
      { id: "first", url: "https://media.example/a.gif", start: 3, end: 6 },
      { id: "second", url: "https://media.example/b.gif", start: 8, end: 11 },
    ])
  })

  test("decodes percent-encoded pipe separators", () => {
    const gifs = parseGifsTag(
      "0-3%7Cabc%7Chttps%3A%2F%2Fmedia.example%2Fa.gif",
      "test"
    )

    expect(gifs).toEqual([
      { id: "abc", url: "https://media.example/a.gif", start: 0, end: 3 },
    ])
  })

  test("ignores malformed entries, non-http urls and out-of-range positions", () => {
    expect(parseGifsTag("", "abc")).toEqual([])
    expect(parseGifsTag("0-2|id|ftp://x", "abc")).toEqual([])
    expect(parseGifsTag("10-12|id|https://x/a.gif", "abc")).toEqual([])
    expect(parseGifsTag("garbage", "abc")).toEqual([])
  })

  test("survives invalid percent-encoding", () => {
    expect(parseGifsTag("0-2|id|https://x/%7C%E0%A4%A", "abc")).toEqual([
      { id: "id", url: "https://x/%7C%E0%A4%A", start: 0, end: 2 },
    ])
  })
})

describe("getEmoteConsumedEnd", () => {
  test("returns the index after the emote", () => {
    expect(getEmoteConsumedEnd(emote(0, 4))).toBe(5)
  })

  test("extends past zero-width overlays", () => {
    expect(getEmoteConsumedEnd(emote(0, 4, [emote(6, 9), emote(11, 14)]))).toBe(
      15
    )
  })
})

describe("createClearChatModActionMessage", () => {
  test("creates an anonymous timeout message", () => {
    const message = createClearChatModActionMessage(
      {
        channel: "#Forsen",
        targetUserName: "BadUser",
        targetUserId: " 99 ",
        banDurationSeconds: 600,
      },
      TMI_ISO
    )

    expect(message).toMatchObject({
      channel: "forsen",
      text: "BadUser was timed out for 600s.",
      receivedAt: TMI_ISO,
      event: "mod_action",
      banDurationSeconds: 600,
      modActionKind: "anonymous_timeout",
      actor: null,
      target: {
        userId: "99",
        userName: "baduser",
        displayName: "BadUser",
        color: null,
      },
    })
  })

  test("treats missing or non-positive durations as bans", () => {
    for (const banDurationSeconds of [null, 0, -5, Number.NaN]) {
      const message = createClearChatModActionMessage({
        channel: "chan",
        targetUserName: "user",
        targetUserId: null,
        banDurationSeconds,
      })

      expect(message!.text).toBe("user was banned.")
      expect(message!.modActionKind).toBe("anonymous_ban")
      expect(message!.banDurationSeconds).toBeNull()
    }
  })

  test("returns null for a full chat clear without a target", () => {
    expect(
      createClearChatModActionMessage({
        channel: "chan",
        targetUserName: "  ",
        targetUserId: null,
        banDurationSeconds: null,
      })
    ).toBeNull()
  })
})

describe("isAnonymousBanTimeoutSystemMessage", () => {
  function systemMessage(
    overrides: Partial<TwitchSystemMessage>
  ): TwitchSystemMessage {
    return {
      ...createClearChatModActionMessage({
        channel: "chan",
        targetUserName: "user",
        targetUserId: null,
        banDurationSeconds: null,
      })!,
      ...overrides,
    }
  }

  test("matches anonymous ban and timeout texts case-insensitively", () => {
    expect(
      isAnonymousBanTimeoutSystemMessage(
        systemMessage({ text: "User was banned." }),
        " USER "
      )
    ).toBe(true)
    expect(
      isAnonymousBanTimeoutSystemMessage(
        systemMessage({ text: "user was timed out for 30s." }),
        "user"
      )
    ).toBe(true)
  })

  test("rejects messages with an actor, other events, other users and empty targets", () => {
    const anonymous = systemMessage({ text: "user was banned." })

    expect(
      isAnonymousBanTimeoutSystemMessage(
        {
          ...anonymous,
          actor: {
            userId: null,
            userName: "mod",
            displayName: "Mod",
            color: null,
          },
        },
        "user"
      )
    ).toBe(false)
    expect(
      isAnonymousBanTimeoutSystemMessage(
        { ...anonymous, event: "notice" },
        "user"
      )
    ).toBe(false)
    expect(isAnonymousBanTimeoutSystemMessage(anonymous, "user2")).toBe(false)
    expect(isAnonymousBanTimeoutSystemMessage(anonymous, "")).toBe(false)
    expect(
      isAnonymousBanTimeoutSystemMessage(
        systemMessage({ text: "user was timed out for a while." }),
        "user"
      )
    ).toBe(false)
  })
})

describe("createModerateActionMessage", () => {
  const base = {
    channelLogin: "#Chan",
    moderatorUserId: " 1 ",
    moderatorUserName: "ModLogin",
    moderatorDisplayName: "ModName",
    targetUserId: "2",
    targetUserName: "TargetLogin",
    targetDisplayName: "TargetName",
    receivedAt: TMI_ISO,
  }

  test("builds timeout text with a floored duration", () => {
    const message = createModerateActionMessage({
      ...base,
      action: "timeout",
      banDurationSeconds: 599.7,
      messageId: " evt-1 ",
    })

    expect(message).toMatchObject({
      id: "chan:eventsub:mod_action:evt-1",
      channel: "chan",
      text: "ModName timed out TargetName for 599s.",
      banDurationSeconds: 599,
      modActionKind: "timeout",
      receivedAt: TMI_ISO,
      actor: { userId: "1", userName: "modlogin", displayName: "ModName" },
      target: {
        userId: "2",
        userName: "targetlogin",
        displayName: "TargetName",
      },
    })
  })

  test("omits the duration for timeouts without a valid one", () => {
    const message = createModerateActionMessage({
      ...base,
      action: "timeout",
      banDurationSeconds: Number.POSITIVE_INFINITY,
    })

    expect(message!.text).toBe("ModName timed out TargetName.")
    expect(message!.banDurationSeconds).toBeNull()
  })

  test("builds ban, untimeout and unban texts", () => {
    expect(createModerateActionMessage({ ...base, action: "ban" })!.text).toBe(
      "ModName banned TargetName."
    )
    expect(
      createModerateActionMessage({ ...base, action: "untimeout" })!.text
    ).toBe("ModName removed TargetName's timeout.")
    expect(
      createModerateActionMessage({ ...base, action: "unban" })!.text
    ).toBe("ModName unbanned TargetName.")
  })

  test("falls back to logins when display names are blank", () => {
    const message = createModerateActionMessage({
      ...base,
      action: "ban",
      moderatorDisplayName: " ",
      targetDisplayName: "",
    })

    expect(message!.text).toBe("ModLogin banned TargetLogin.")
  })

  test("returns null without a channel, moderator or target", () => {
    expect(
      createModerateActionMessage({ ...base, action: "ban", channelLogin: "#" })
    ).toBeNull()
    expect(
      createModerateActionMessage({
        ...base,
        action: "ban",
        moderatorUserName: "",
        moderatorDisplayName: "",
      })
    ).toBeNull()
    expect(
      createModerateActionMessage({
        ...base,
        action: "ban",
        targetUserName: " ",
        targetDisplayName: " ",
      })
    ).toBeNull()
  })
})

describe("createChatModesSystemMessage", () => {
  test("normalizes the channel and preserves the text", () => {
    const message = createChatModesSystemMessage({
      channel: " #Chan ",
      roomId: "1",
      text: "Slow mode enabled (30s).",
      receivedAt: TMI_ISO,
    })

    expect(message).toMatchObject({
      channel: "chan",
      roomId: "1",
      text: "Slow mode enabled (30s).",
      headline: "Slow mode enabled (30s).",
      receivedAt: TMI_ISO,
      event: "notice",
      level: "warning",
    })
  })
})

class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static instances: FakeWebSocket[] = []

  readyState = FakeWebSocket.OPEN
  sent: string[] = []
  private listeners = new Map<string, ((event: unknown) => void)[]>()

  readonly url: string

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
  }

  receive(...lines: string[]) {
    for (const listener of this.listeners.get("message") ?? []) {
      listener({ data: lines.join("\r\n") })
    }
  }
}

describe("TwitchChatClient line handling", () => {
  const originalWebSocket = globalThis.WebSocket
  let client: TwitchChatClient
  let events: TwitchChatEvent[]
  let socket: FakeWebSocket

  beforeEach(() => {
    FakeWebSocket.instances = []
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket
    events = []
    client = new TwitchChatClient((event) => events.push(event))
    client.open()
    socket = FakeWebSocket.instances[0]
  })

  afterEach(() => {
    client.close()
    globalThis.WebSocket = originalWebSocket
  })

  function eventsOfType<T extends TwitchChatEvent["type"]>(type: T) {
    return events.filter(
      (event): event is Extract<TwitchChatEvent, { type: T }> =>
        event.type === type
    )
  }

  function systemMessages() {
    return eventsOfType("system").map((event) => event.message)
  }

  test("answers PING with PONG", () => {
    socket.receive("PING :tmi.twitch.tv")

    expect(socket.sent).toContain("PONG :tmi.twitch.tv")
    expect(events).toEqual([])
  })

  test("handles several lines in one frame", () => {
    socket.receive(
      "@id=1 :a!a@a.tmi.twitch.tv PRIVMSG #chan :one",
      "@id=2 :b!b@b.tmi.twitch.tv PRIVMSG #chan :two",
      ""
    )

    expect(eventsOfType("message").map((event) => event.message.text)).toEqual([
      "one",
      "two",
    ])
  })

  test("emits channel-joined once per channel with a normalized login", () => {
    socket.receive(
      ":justinfan1!justinfan1@justinfan1.tmi.twitch.tv JOIN #Forsen",
      ":justinfan1!justinfan1@justinfan1.tmi.twitch.tv JOIN #forsen"
    )

    expect(eventsOfType("channel-joined")).toEqual([
      { type: "channel-joined", channel: "forsen" },
    ])
  })

  describe("ROOMSTATE", () => {
    test("parses a complete room state", () => {
      socket.receive(
        "@emote-only=0;followers-only=10;r9k=1;room-id=22484632;slow=30;subs-only=1 :tmi.twitch.tv ROOMSTATE #forsen"
      )

      expect(eventsOfType("room-state")[0].state).toEqual({
        channel: "forsen",
        roomId: "22484632",
        modes: {
          emoteOnly: false,
          subscribersOnly: true,
          followersOnly: true,
          followersOnlyMinutes: 10,
          uniqueMode: true,
          slowMode: true,
          slowModeSeconds: 30,
        },
        isComplete: true,
      })
    })

    test("treats followers-only=-1 as off and followers-only=0 as on with no delay", () => {
      socket.receive(
        "@followers-only=-1;room-id=1 :tmi.twitch.tv ROOMSTATE #a",
        "@followers-only=0;room-id=1 :tmi.twitch.tv ROOMSTATE #a"
      )

      const [off, on] = eventsOfType("room-state").map(
        (event) => event.state.modes
      )
      expect(off).toEqual({ followersOnly: false, followersOnlyMinutes: 0 })
      expect(on).toEqual({ followersOnly: true, followersOnlyMinutes: 0 })
    })

    test("emits partial updates with only the changed modes", () => {
      socket.receive("@room-id=1;slow=0 :tmi.twitch.tv ROOMSTATE #a")

      const state = eventsOfType("room-state")[0].state
      expect(state.modes).toEqual({ slowMode: false, slowModeSeconds: 0 })
      expect(state.isComplete).toBe(false)
    })

    test("ignores non-numeric mode durations", () => {
      socket.receive("@room-id=1;slow=abc :tmi.twitch.tv ROOMSTATE #a")

      expect(eventsOfType("room-state")[0].state.modes).toEqual({})
    })
  })

  test("parses USERSTATE into self state", () => {
    socket.receive(
      String.raw`@badge-info=;badges=vip/1,premium/1;color=#00FF7F;display-name=Me\sToo;emote-sets=0;mod=0;subscriber=1 :tmi.twitch.tv USERSTATE #chan`
    )

    expect(eventsOfType("self-state")[0].state).toEqual({
      channel: "chan",
      roomId: null,
      displayName: "Me Too",
      color: "#00FF7F",
      badges: [
        { set: "vip", version: "1" },
        { set: "premium", version: "1" },
      ],
      isBroadcaster: false,
      isModerator: false,
      isSubscriber: true,
      isVip: true,
    })
  })

  describe("USERNOTICE", () => {
    test("parses a resub with escaped system-msg and a user message with emotes", () => {
      socket.receive(
        String.raw`@badge-info=subscriber/14;badges=subscriber/12,premium/1;color=#8A2BE2;display-name=Foo;emotes=25:11-15;id=sub-1;login=foo;msg-id=resub;msg-param-cumulative-months=14;msg-param-streak-months=3;msg-param-sub-plan=1000;room-id=123;system-msg=Foo\ssubscribed\sat\sTier\s1.\sThey've\ssubscribed\sfor\s14\smonths!;tmi-sent-ts=${TMI_TS};user-id=42 :tmi.twitch.tv USERNOTICE #chan` +
          " :love you 😀 Kappa"
      )

      const message = systemMessages()[0]
      expect(message).toMatchObject({
        id: "sub-1",
        channel: "chan",
        roomId: "123",
        headline: "Foo subscribed at Tier 1. They've subscribed for 14 months!",
        details: "love you 😀 Kappa",
        text: "Foo subscribed at Tier 1. They've subscribed for 14 months! love you 😀 Kappa",
        receivedAt: TMI_ISO,
        event: "subscription",
        level: "success",
        accentColor: null,
        msgId: "resub",
        actor: {
          userId: "42",
          userName: "foo",
          displayName: "Foo",
          color: "#8A2BE2",
        },
        cumulativeMonths: 14,
        streakMonths: 3,
        subPlan: "1000",
        giftCount: null,
        badges: [
          { set: "subscriber", version: "12" },
          { set: "premium", version: "1" },
        ],
      })
      expect(
        message.detailsEmotes!.map(({ code, start, end }) => ({
          code,
          start,
          end,
        }))
      ).toEqual([{ code: "Kappa", start: 12, end: 16 }])
    })

    test("keeps backslashes in the user message body and its emote positions", () => {
      socket.receive(
        String.raw`@display-name=Foo;emotes=25:12-16;id=sub-2;login=foo;msg-id=resub;room-id=123;system-msg=Foo\ssubscribed!;tmi-sent-ts=${TMI_TS};user-id=42 :tmi.twitch.tv USERNOTICE #chan :C:\server x Kappa`
      )

      const message = systemMessages()[0]
      expect(message.details).toBe(String.raw`C:\server x Kappa`)
      expect(message.text).toBe(String.raw`Foo subscribed! C:\server x Kappa`)
      expect(
        message.detailsEmotes!.map(({ code, start, end }) => ({
          code,
          start,
          end,
        }))
      ).toEqual([{ code: "Kappa", start: 12, end: 16 }])
    })

    test("parses a raid with a viewer count", () => {
      socket.receive(
        String.raw`@display-name=Raider;id=raid-1;login=raider;msg-id=raid;msg-param-viewerCount=1234;room-id=1;system-msg=1234\sraiders\sfrom\sRaider\shave\sjoined!;tmi-sent-ts=${TMI_TS};user-id=5 :tmi.twitch.tv USERNOTICE #chan`
      )

      expect(systemMessages()[0]).toMatchObject({
        event: "raid",
        level: "success",
        viewerCount: 1234,
        text: "1234 raiders from Raider have joined!",
        details: null,
        detailsEmotes: [],
      })
    })

    test("uses the mass gift count for community gift subs", () => {
      socket.receive(
        String.raw`@display-name=Gifter;id=g-1;login=gifter;msg-id=submysterygift;msg-param-mass-gift-count=5;msg-param-sender-count=50;msg-param-sub-plan=1000;room-id=1;system-msg=Gifter\sis\sgifting\s5\sTier\s1\sSubs!;tmi-sent-ts=${TMI_TS};user-id=6 :tmi.twitch.tv USERNOTICE #chan`
      )

      expect(systemMessages()[0]).toMatchObject({
        event: "subscription",
        giftCount: 5,
      })
    })

    test("resolves announcement colors with a primary fallback", () => {
      const themes = ["BLUE", "green", "ORANGE", "purple", "PRIMARY", "weird"]
      socket.receive(
        ...themes.map(
          (theme, index) =>
            `@display-name=Mod;id=ann-${index};login=mod;msg-id=announcement;msg-param-color=${theme};room-id=1;system-msg=;tmi-sent-ts=${TMI_TS};user-id=7 :tmi.twitch.tv USERNOTICE #chan :Important news`
        )
      )

      const messages = systemMessages()
      expect(messages.map((message) => message.accentColor)).toEqual([
        "#00d6d6",
        "#00db84",
        "#ffb31a",
        "#ff75e6",
        "#9146ff",
        "#9146ff",
      ])
      expect(messages[0]).toMatchObject({
        event: "announcement",
        level: "info",
        headline: "Announcement",
        text: "Announcement Important news",
        announcementTheme: "BLUE",
      })
    })

    test("falls back to a generic headline for unknown events without system-msg", () => {
      socket.receive(
        `@id=r-1;msg-id=ritual;room-id=1;tmi-sent-ts=${TMI_TS} :tmi.twitch.tv USERNOTICE #chan`
      )

      expect(systemMessages()[0]).toMatchObject({
        event: "status",
        level: "info",
        headline: "Channel event",
        text: "Channel event",
        actor: null,
      })
    })
  })

  describe("CLEARMSG", () => {
    test("parses the deleted message details", () => {
      socket.receive(
        `@login=baduser;room-id=1;target-msg-id=abc-123;tmi-sent-ts=${TMI_TS} :tmi.twitch.tv CLEARMSG #chan :some: bad words`
      )

      expect(eventsOfType("clear-msg")[0].event).toEqual({
        channel: "chan",
        messageId: "abc-123",
        login: "baduser",
        text: "some: bad words",
      })
    })

    test("drops CLEARMSG without a target message id", () => {
      socket.receive("@login=baduser :tmi.twitch.tv CLEARMSG #chan :text")

      expect(eventsOfType("clear-msg")).toEqual([])
    })
  })

  describe("CLEARCHAT", () => {
    test("parses timeouts with duration and target", () => {
      socket.receive(
        `@ban-duration=600;room-id=1;target-user-id=99;tmi-sent-ts=${TMI_TS} :tmi.twitch.tv CLEARCHAT #chan :baduser`
      )

      expect(eventsOfType("clear-chat")[0].event).toEqual({
        channel: "chan",
        targetUserName: "baduser",
        targetUserId: "99",
        banDurationSeconds: 600,
      })
    })

    test("parses permanent bans and full chat clears", () => {
      socket.receive(
        "@room-id=1;target-user-id=99 :tmi.twitch.tv CLEARCHAT #chan :baduser",
        "@room-id=1 :tmi.twitch.tv CLEARCHAT #chan"
      )

      expect(eventsOfType("clear-chat").map((event) => event.event)).toEqual([
        {
          channel: "chan",
          targetUserName: "baduser",
          targetUserId: "99",
          banDurationSeconds: null,
        },
        {
          channel: "chan",
          targetUserName: null,
          targetUserId: null,
          banDurationSeconds: null,
        },
      ])
    })
  })

  describe("NOTICE", () => {
    test("emits a warning system message and a log line", () => {
      socket.receive(
        "@msg-id=msg_slowmode;room-id=1 :tmi.twitch.tv NOTICE #chan :This room is in slow mode and you are sending messages too quickly."
      )

      expect(systemMessages()[0]).toMatchObject({
        channel: "chan",
        roomId: "1",
        text: "This room is in slow mode and you are sending messages too quickly.",
        event: "notice",
        level: "warning",
        msgId: "msg_slowmode",
      })
      expect(eventsOfType("log").map((event) => event.text)).toEqual([
        "This room is in slow mode and you are sending messages too quickly.",
      ])
    })

    test("does not unescape the notice text", () => {
      socket.receive(
        String.raw`@msg-id=msg_banned;room-id=1 :tmi.twitch.tv NOTICE #chan :Path C:\server\new has\sa \\ in it`
      )

      expect(systemMessages()[0].text).toBe(
        String.raw`Path C:\server\new has\sa \\ in it`
      )
    })

    test("emits auth-failure for global login failures", () => {
      socket.receive(":tmi.twitch.tv NOTICE * :Login authentication failed")

      expect(eventsOfType("auth-failure")).toHaveLength(1)
      expect(systemMessages()).toEqual([])
    })
  })

  test("does not misclassify PRIVMSG with numeric tag values as a welcome", () => {
    socket.receive(
      "@id=1;room-id=1001;user-id=100135110 :a!a@a.tmi.twitch.tv PRIVMSG #chan :001 hi"
    )

    expect(eventsOfType("connected")).toEqual([])
    expect(eventsOfType("message")[0].message.text).toBe("001 hi")
  })
})
