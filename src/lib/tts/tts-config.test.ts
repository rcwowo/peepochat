import { afterEach, describe, expect, mock, spyOn, test } from "bun:test"

import {
  createDefaultTtsConfig,
  normalizeLookupValue,
  normalizeTtsConfig,
  parseLines,
  pickRandomVoiceProfileId,
  type TtsVoiceProfile,
} from "@/lib/tts/tts-config"

function profile(
  id: string,
  overrides: Partial<TtsVoiceProfile> = {}
): TtsVoiceProfile {
  return {
    id,
    label: id,
    voice: "",
    rate: 0,
    pitch: 0,
    volume: 0,
    enabled: true,
    ...overrides,
  }
}

describe("normalizeTtsConfig", () => {
  test.each([[undefined], [null], [{}], ["garbage"], [42], [[]]])(
    "returns the defaults for %p",
    (input) => {
      expect(normalizeTtsConfig(input)).toEqual(createDefaultTtsConfig())
    }
  )

  test("keeps valid saved values", () => {
    const input = {
      ...createDefaultTtsConfig(),
      resumeOnStartup: true,
      queueMode: "big-chat" as const,
      autoAssignVoices: true,
      minMessageLength: 5,
      maxMessageLength: 300,
      maxQueueSize: 30,
      subscribersOnly: true,
      voiceProfiles: [profile("voice-default"), profile("v2", { rate: -50 })],
      defaultVoiceProfileId: "v2",
    }

    expect(normalizeTtsConfig(input)).toEqual(input)
  })

  test("replaces invalid scalar values with defaults individually", () => {
    const defaults = createDefaultTtsConfig()
    const config = normalizeTtsConfig({
      resumeOnStartup: "yes",
      queueMode: "huge-chat",
      maxQueueSize: 9999,
      maxMessageLength: 5,
      minMessageLength: 2.5,
      textTemplate: 5,
      skipBots: false,
    })

    expect(config.resumeOnStartup).toBe(defaults.resumeOnStartup)
    expect(config.queueMode).toBe(defaults.queueMode)
    expect(config.maxQueueSize).toBe(defaults.maxQueueSize)
    expect(config.maxMessageLength).toBe(defaults.maxMessageLength)
    expect(config.minMessageLength).toBe(defaults.minMessageLength)
    expect(config.textTemplate).toBe(defaults.textTemplate)
    expect(config.skipBots).toBe(false)
  })

  test("never lets the minimum length exceed the maximum", () => {
    const config = normalizeTtsConfig({
      minMessageLength: 50,
      maxMessageLength: 20,
    })
    expect(config.minMessageLength).toBe(20)
    expect(config.maxMessageLength).toBe(20)
  })

  test("migrates the legacy {displayName} placeholder", () => {
    expect(
      normalizeTtsConfig({
        textTemplate: "{displayName}: {message} ({displayName})",
      }).textTemplate
    ).toBe("{user}: {message} ({user})")
  })

  test("drops invalid voice profiles, repairs bad fields and dedupes by id", () => {
    const config = normalizeTtsConfig({
      voiceProfiles: [
        profile("a", { label: "First" }),
        { label: "no id" },
        "junk",
        {
          id: "b",
          label: 5,
          voice: null,
          rate: 500,
          pitch: -500,
          volume: "x",
          enabled: "no",
        },
        profile("a", { label: "Duplicate" }),
      ],
      defaultVoiceProfileId: "b",
    })

    expect(config.voiceProfiles).toEqual([
      profile("a", { label: "First" }),
      {
        id: "b",
        label: "",
        voice: "",
        rate: 0,
        pitch: 0,
        volume: 0,
        enabled: true,
      },
    ])
    expect(config.defaultVoiceProfileId).toBe("b")
  })

  test("restores the default profile when none are valid", () => {
    const config = normalizeTtsConfig({ voiceProfiles: [{ label: "x" }] })
    expect(config.voiceProfiles).toEqual(createDefaultTtsConfig().voiceProfiles)
    expect(config.defaultVoiceProfileId).toBe("voice-default")
  })

  test("clears a default voice that no longer exists", () => {
    const config = normalizeTtsConfig({
      voiceProfiles: [profile("a")],
      defaultVoiceProfileId: "deleted",
    })
    expect(config.defaultVoiceProfileId).toBe("")
  })

  test("normalizes and dedupes user and term lists", () => {
    const config = normalizeTtsConfig({
      blockedUsers: ["@Nightbot", "nightbot ", "", "  ", "StreamElements", 5],
      blockedTerms: ["Bad Word", "bad word", " other ", ""],
      commands: { whitelist: ["@Mod", "mod", "Friend"] },
    })

    expect(config.blockedUsers).toEqual(["nightbot", "streamelements"])
    expect(config.blockedTerms).toEqual(["Bad Word", "other"])
    expect(config.commands.whitelist).toEqual(["mod", "friend"])
  })

  test("treats a non-array list as empty", () => {
    const config = normalizeTtsConfig({
      blockedUsers: "nightbot",
      wordReplacements: { id: "x" },
    })
    expect(config.blockedUsers).toEqual([])
    expect(config.wordReplacements).toEqual([])
  })

  test("keeps valid word replacements and dedupes by id", () => {
    const config = normalizeTtsConfig({
      wordReplacements: [
        { id: "r1", from: "lol", to: "laughing" },
        { id: "r1", from: "x", to: "y" },
        { id: "", from: "a", to: "b" },
        { id: "r2", from: 5, to: "z", enabled: false },
      ],
    })

    expect(config.wordReplacements).toEqual([
      { id: "r1", from: "lol", to: "laughing", enabled: true },
      { id: "r2", from: "", to: "z", enabled: false },
    ])
  })

  test("normalizes sound effect names and makes them unique", () => {
    const config = normalizeTtsConfig({
      soundEffects: [
        { id: "s1", name: "Air Horn" },
        { id: "s2", name: "air horn", volume: 2, minRole: "admin" },
        { id: "s3", name: "!!!", enabled: false, minRole: "vip", volume: 0.5 },
        { id: "s1", name: "duplicate id" },
        { id: "s4", name: "" },
      ],
    })

    expect(config.soundEffects).toEqual([
      {
        id: "s1",
        name: "air_horn",
        enabled: true,
        minRole: "everyone",
        volume: 1,
      },
      {
        id: "s2",
        name: "air_horn_2",
        enabled: true,
        minRole: "everyone",
        volume: 1,
      },
      {
        id: "s3",
        name: "sound_3",
        enabled: false,
        minRole: "vip",
        volume: 0.5,
      },
    ])
  })

  test("repairs individual chat command settings", () => {
    const config = normalizeTtsConfig({
      commands: {
        queue: { enabled: true },
        skip: { enabled: true, minRole: "vip" },
        clear: "nope",
        newVoice: 7,
      },
    })

    expect(config.commands).toEqual({
      whitelist: [],
      queue: { enabled: true, minRole: "moderator" },
      playback: { enabled: false, minRole: "moderator" },
      skip: { enabled: true, minRole: "vip" },
      clear: { enabled: false, minRole: "moderator" },
      newVoice: { enabled: false, minRole: "everyone" },
    })
  })

  test("falls back to default commands when the section is malformed", () => {
    expect(normalizeTtsConfig({ commands: "nope" }).commands).toEqual(
      createDefaultTtsConfig().commands
    )
  })

  test("is idempotent", () => {
    const once = normalizeTtsConfig({
      textTemplate: "{displayName} says {message}",
      minMessageLength: 40,
      maxMessageLength: 30,
      blockedUsers: ["@A", "a", "B"],
      voiceProfiles: [profile("x"), profile("x")],
      soundEffects: [
        { id: "1", name: "Boom" },
        { id: "2", name: "boom" },
      ],
      commands: { whitelist: ["@Z"] },
    })
    expect(normalizeTtsConfig(once)).toEqual(once)
    expect(normalizeTtsConfig(JSON.parse(JSON.stringify(once)))).toEqual(once)
  })
})

describe("lookup helpers", () => {
  test("normalizeLookupValue trims, strips @ and lowercases", () => {
    expect(normalizeLookupValue("  @SomeUser ")).toBe("someuser")
    expect(normalizeLookupValue("@@x")).toBe("@x")
  })

  test("parseLines splits on newlines and drops blank lines", () => {
    expect(parseLines(" a \r\n\nb\n  \nc ")).toEqual(["a", "b", "c"])
    expect(parseLines("")).toEqual([])
  })
})

describe("pickRandomVoiceProfileId", () => {
  afterEach(() => {
    mock.restore()
  })

  test("returns null when there are no profiles", () => {
    expect(pickRandomVoiceProfileId([])).toBeNull()
  })

  test("prefers enabled profiles", () => {
    spyOn(Math, "random").mockReturnValue(0.99)
    const profiles = [
      profile("a"),
      profile("b", { enabled: false }),
      profile("c"),
    ]
    expect(pickRandomVoiceProfileId(profiles)).toBe("c")
  })

  test("falls back to disabled profiles when none are enabled", () => {
    spyOn(Math, "random").mockReturnValue(0)
    const profiles = [profile("a", { enabled: false })]
    expect(pickRandomVoiceProfileId(profiles)).toBe("a")
  })

  test("avoids the excluded profile unless it is the only option", () => {
    spyOn(Math, "random").mockReturnValue(0)
    expect(pickRandomVoiceProfileId([profile("a"), profile("b")], "a")).toBe(
      "b"
    )
    expect(pickRandomVoiceProfileId([profile("a")], "a")).toBe("a")
  })
})
