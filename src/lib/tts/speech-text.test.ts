import { describe, expect, test } from "bun:test"

import type { TwitchEmote } from "@/lib/twitch/chat/chat"
import {
  applyWordReplacements,
  buildSpeechSegments,
  canUseTtsPermission,
  getSpeakableMessageText,
  sanitizeMessageText,
  type TtsMessageFlags,
} from "@/lib/tts/speech-text"
import {
  createDefaultTtsConfig,
  type TtsConfig,
  type TtsSoundEffect,
  type TtsWordReplacement,
} from "@/lib/tts/tts-config"

let nextId = 0

function replacement(
  from: string,
  to: string,
  enabled = true
): TtsWordReplacement {
  nextId += 1
  return { id: `r${nextId}`, from, to, enabled }
}

function sound(
  name: string,
  overrides: Partial<TtsSoundEffect> = {}
): TtsSoundEffect {
  return {
    id: `sound-${name}`,
    name,
    enabled: true,
    minRole: "everyone",
    volume: 1,
    ...overrides,
  }
}

function emote(code: string, start: number, end: number): TwitchEmote {
  return { id: code, code, provider: "twitch", imageUrl: "", start, end }
}

const NO_FLAGS: TtsMessageFlags = {
  isBroadcaster: false,
  isModerator: false,
  isVip: false,
  isSubscriber: false,
}

function config(overrides: Partial<TtsConfig> = {}): TtsConfig {
  return { ...createDefaultTtsConfig(), ...overrides }
}

function speakable(
  text: string,
  configOverrides: Partial<TtsConfig> = {},
  message: {
    userName?: string
    flags?: Partial<TtsMessageFlags>
    emotes?: TwitchEmote[]
  } = {}
) {
  return getSpeakableMessageText(
    {
      userName: message.userName ?? "viewer",
      text,
      emotes: message.emotes ?? [],
      gifs: [],
      flags: { ...NO_FLAGS, ...message.flags },
    },
    config(configOverrides)
  )
}

describe("applyWordReplacements", () => {
  test("replaces whole words case-insensitively", () => {
    expect(
      applyWordReplacements("LOL lol lollipop xlol", [
        replacement("lol", "haha"),
      ])
    ).toBe("haha haha lollipop xlol")
  })

  test("matches symbol-only terms without word boundaries", () => {
    expect(applyWordReplacements("a <3 b<3", [replacement("<3", "love")])).toBe(
      "a love blove"
    )
  })

  test("treats regex metacharacters and $ patterns literally", () => {
    expect(
      applyWordReplacements("price a.b axb", [
        replacement("a.b", "$&$1"),
        replacement("price", "$'"),
      ])
    ).toBe("$' $&$1 axb")
  })

  test("removing a word collapses whitespace before punctuation", () => {
    expect(
      applyWordReplacements("well  um , I think um.", [replacement("um", "")])
    ).toBe("well, I think.")
  })

  test("leaves whitespace alone when nothing is removed", () => {
    expect(applyWordReplacements("  a   b ", [replacement("b", "c")])).toBe(
      "  a   c "
    )
  })

  test("skips disabled and blank replacements and applies the rest in order", () => {
    expect(
      applyWordReplacements("one two", [
        replacement("one", "uno", false),
        replacement("   ", "x"),
        replacement("two", "three"),
        replacement("three", "four"),
      ])
    ).toBe("one four")
  })

  test("trims the search term before matching", () => {
    expect(
      applyWordReplacements("gg wp", [replacement(" gg ", "good game")])
    ).toBe("good game wp")
  })

  test("uses Unicode-aware word boundaries", () => {
    expect(
      applyWordReplacements("Rüber über ÜBER", [replacement("über", "over")])
    ).toBe("Rüber over over")
    expect(
      applyWordReplacements("café cafés Café", [replacement("café", "coffee")])
    ).toBe("coffee cafés coffee")
    expect(
      applyWordReplacements("Привет приветик", [replacement("привет", "hi")])
    ).toBe("hi приветик")
    expect(
      applyWordReplacements("lol lol２ lol_", [replacement("lol", "haha")])
    ).toBe("haha lol２ lol_")
  })

  test("treats combining marks as part of a word", () => {
    expect(
      applyWordReplacements("cafe\u0301 cafe", [replacement("cafe", "coffee")])
    ).toBe("cafe\u0301 coffee")
  })
})

describe("sanitizeMessageText", () => {
  const base = {
    stripLinks: false,
    stripMentions: false,
    stripEmotes: false,
    emotes: [] as TwitchEmote[],
    gifs: [],
  }

  test("strips emote ranges including zero-width overlays", () => {
    const text = "hi Kappa there LUL"
    const kappa = {
      ...emote("Kappa", 3, 7),
      overlays: [emote("RainTime", 3, 9)],
    }

    expect(
      sanitizeMessageText(text, {
        ...base,
        stripEmotes: true,
        emotes: [emote("LUL", 15, 17), kappa],
      })
    ).toBe("hi here")
  })

  test("strips gifs and overlapping ranges safely", () => {
    expect(
      sanitizeMessageText("abc defgh ijk", {
        ...base,
        stripEmotes: true,
        emotes: [emote("x", 4, 6)],
        gifs: [{ id: "g", url: "", start: 5, end: 8 }],
      })
    ).toBe("abc ijk")
  })

  test("keeps emotes when stripping is disabled", () => {
    expect(
      sanitizeMessageText("hi Kappa", {
        ...base,
        emotes: [emote("Kappa", 3, 7)],
      })
    ).toBe("hi Kappa")
  })

  test("strips links and mentions but not email addresses", () => {
    expect(
      sanitizeMessageText(
        "hey @Bob, see https://x.tv/a?b=1 or mail a@b.com (@carol)",
        { ...base, stripLinks: true, stripMentions: true }
      )
    ).toBe("hey , see or mail a@b.com ()")
  })

  test("replaces control characters and collapses whitespace", () => {
    expect(sanitizeMessageText("\u0001a\tb\n\u007fc  ", base)).toBe("a b c")
  })

  test("preserves astral characters", () => {
    expect(sanitizeMessageText("hi 😀 there", base)).toBe("hi 😀 there")
  })
})

describe("getSpeakableMessageText", () => {
  test("returns sanitized text for an ordinary message", () => {
    expect(speakable("  check https://x.tv   this  ")).toBe("check this")
  })

  test("ignores commands when configured", () => {
    expect(speakable("!uptime")).toBeNull()
    expect(speakable("  ?help")).toBeNull()
    expect(speakable("!uptime", { ignoreCommands: false })).toBe("!uptime")
  })

  test("skips bots, broadcasters and moderators when configured", () => {
    expect(speakable("hi", {}, { userName: "@NightBot" })).toBeNull()
    expect(speakable("hi", { skipBots: false }, { userName: "nightbot" })).toBe(
      "hi"
    )
    expect(
      speakable(
        "hi",
        { skipBroadcaster: true },
        { flags: { isBroadcaster: true } }
      )
    ).toBeNull()
    expect(
      speakable(
        "hi",
        { skipModerators: true },
        { flags: { isModerator: true } }
      )
    ).toBeNull()
  })

  test("subscribers-only lets subscribers and the broadcaster through", () => {
    const options = { subscribersOnly: true }

    expect(speakable("hi", options)).toBeNull()
    expect(speakable("hi", options, { flags: { isSubscriber: true } })).toBe(
      "hi"
    )
    expect(speakable("hi", options, { flags: { isBroadcaster: true } })).toBe(
      "hi"
    )
  })

  test("blocks users and terms case-insensitively", () => {
    expect(
      speakable("hi", { blockedUsers: ["@Troll"] }, { userName: "TROLL" })
    ).toBeNull()
    expect(speakable("You are BAD", { blockedTerms: ["  bad "] })).toBeNull()
    expect(speakable("You are good", { blockedTerms: ["bad", "  "] })).toBe(
      "You are good"
    )
  })

  test("checks blocked terms after stripping links", () => {
    expect(
      speakable("see https://bad.example", { blockedTerms: ["bad"] })
    ).toBe("see")
  })

  test("enforces minimum and maximum length on the replaced text", () => {
    expect(speakable("hi", { minMessageLength: 3 })).toBeNull()
    expect(speakable("hey", { minMessageLength: 3 })).toBe("hey")
    expect(speakable("a".repeat(21), { maxMessageLength: 20 })).toBeNull()
    expect(
      speakable("um ok", {
        minMessageLength: 3,
        wordReplacements: [replacement("um", "")],
      })
    ).toBeNull()
  })

  test("returns null when nothing speakable remains", () => {
    expect(speakable("https://x.tv")).toBeNull()
    expect(
      speakable(
        "Kappa",
        { stripEmotes: true },
        { emotes: [emote("Kappa", 0, 4)] }
      )
    ).toBeNull()
  })

  test("lets an enabled sound token through even when it is the whole message", () => {
    const soundEffects = [sound("airhorn")]

    expect(speakable("(AirHorn)", { soundEffects, minMessageLength: 5 })).toBe(
      "(AirHorn)"
    )
    expect(
      speakable("(airhorn)", {
        soundEffects: [sound("airhorn", { enabled: false })],
      })
    ).toBeNull()
    expect(speakable("(unknown)", { soundEffects })).toBe("(unknown)")
  })

  test("returns the sanitized text rather than the replaced text", () => {
    expect(
      speakable("lol nice", { wordReplacements: [replacement("lol", "haha")] })
    ).toBe("lol nice")
  })
})

describe("canUseTtsPermission", () => {
  const enabled = (
    minRole: "broadcaster" | "moderator" | "vip" | "subscriber" | "everyone"
  ) => ({
    enabled: true,
    minRole,
  })

  test("is always denied when disabled, even for whitelisted users", () => {
    expect(
      canUseTtsPermission(
        { enabled: false, minRole: "everyone" },
        { ...NO_FLAGS, isBroadcaster: true },
        "amy",
        ["amy"]
      )
    ).toBe(false)
  })

  test("compares role rank against the minimum role", () => {
    const mod = { ...NO_FLAGS, isModerator: true }
    const vip = { ...NO_FLAGS, isVip: true }
    const sub = { ...NO_FLAGS, isSubscriber: true }

    expect(canUseTtsPermission(enabled("moderator"), mod, "x", [])).toBe(true)
    expect(canUseTtsPermission(enabled("moderator"), vip, "x", [])).toBe(false)
    expect(canUseTtsPermission(enabled("vip"), vip, "x", [])).toBe(true)
    expect(canUseTtsPermission(enabled("vip"), sub, "x", [])).toBe(false)
    expect(canUseTtsPermission(enabled("everyone"), NO_FLAGS, "x", [])).toBe(
      true
    )
    expect(
      canUseTtsPermission(
        enabled("broadcaster"),
        { ...NO_FLAGS, isBroadcaster: true },
        "x",
        []
      )
    ).toBe(true)
  })

  test("uses the highest role a user holds", () => {
    expect(
      canUseTtsPermission(
        enabled("moderator"),
        { ...NO_FLAGS, isSubscriber: true, isModerator: true },
        "x",
        []
      )
    ).toBe(true)
  })

  test("whitelisted users bypass the role check, matched loosely", () => {
    expect(
      canUseTtsPermission(enabled("broadcaster"), NO_FLAGS, "Amy", [" @AMY "])
    ).toBe(true)
  })
})

describe("buildSpeechSegments", () => {
  function build(
    message: string,
    overrides: Partial<Parameters<typeof buildSpeechSegments>[0]> = {}
  ) {
    return buildSpeechSegments({
      template: "{user} says {message}",
      message,
      userName: "Amy",
      channel: "alpha",
      sounds: [],
      canUseSound: () => true,
      replacements: [],
      ...overrides,
    })
  }

  test("fills the template once without re-expanding message content", () => {
    expect(
      build("hi {user} in {channel}", {
        template: "{channel}: {user} - {message}",
      })
    ).toEqual({
      segments: [
        { kind: "speech", text: "alpha: Amy - hi {user} in {channel}" },
      ],
      text: "alpha: Amy - hi {user} in {channel}",
    })
  })

  test("splits speech around sound effects", () => {
    const airhorn = sound("airhorn")

    expect(
      build("wow (AIRHORN) nice (airhorn)", { sounds: [airhorn] })
    ).toEqual({
      segments: [
        { kind: "speech", text: "Amy says wow" },
        { kind: "sound", soundId: airhorn.id, name: "airhorn" },
        { kind: "speech", text: "nice" },
        { kind: "sound", soundId: airhorn.id, name: "airhorn" },
      ],
      text: "Amy says wow (airhorn) nice (airhorn)",
    })
  })

  test("silently drops sounds that are disabled or not permitted", () => {
    const disabled = sound("boom", { enabled: false })
    const restricted = sound("bell", { minRole: "moderator" })

    expect(
      build("a (boom) b (bell) c", {
        sounds: [disabled, restricted],
        canUseSound: (entry) => entry.minRole === "everyone",
      }).segments
    ).toEqual([{ kind: "speech", text: "Amy says a b c" }])
  })

  test("leaves unknown sound tokens as speech", () => {
    expect(build("(mystery)").text).toBe("Amy says (mystery)")
  })

  test("only converts sound tokens in the message, not in the template values", () => {
    const airhorn = sound("airhorn")

    expect(
      build("hi", { userName: "(airhorn)", sounds: [airhorn] }).segments
    ).toEqual([{ kind: "speech", text: "(airhorn) says hi" }])
  })

  test("applies replacements per speech segment and drops empty segments", () => {
    const airhorn = sound("airhorn")

    expect(
      build("um (airhorn) um", {
        template: "{message}",
        sounds: [airhorn],
        replacements: [replacement("um", "")],
      })
    ).toEqual({
      segments: [{ kind: "sound", soundId: airhorn.id, name: "airhorn" }],
      text: "(airhorn)",
    })
  })
})
