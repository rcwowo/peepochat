import { describe, expect, test } from "bun:test"

import {
  applyChatvoiceImport,
  detectBackupSourceApp,
  getNewChatvoiceChannels,
  parseChatvoiceBackup,
  summarizeChatvoiceImport,
} from "@/lib/chatvoice/chatvoice-import"
import {
  CHAT_FONT_SIZE_DEFAULT,
  createDefaultConfig,
  type AppConfig,
} from "@/lib/peepochat/peepochat-config"

type ChatvoiceBackupOverrides = {
  twitch?: Record<string, unknown>
  playback?: Record<string, unknown>
  data?: Record<string, unknown>
  envelope?: Record<string, unknown>
}

function chatvoiceBackup(overrides: ChatvoiceBackupOverrides = {}) {
  return {
    app: "chatvoice",
    appVersion: "1.3.0",
    exportedAt: "2026-10-01T12:00:00.000Z",
    schemaVersion: 1,
    data: {
      schemaVersion: 1,
      updatedAt: "2026-10-01T12:00:00.000Z",
      twitch: {
        channel: "Streamer",
        savedChannels: ["streamer", "#Friend", "not a channel!", "friend"],
        clientId: "",
        accessToken: "",
        readOnly: true,
        autoConnect: true,
        ...overrides.twitch,
      },
      playback: {
        enabled: true,
        queueEnabled: true,
        textTemplate: "{displayName} says {message} in {channel}",
        autoAssignVoices: true,
        defaultVoiceProfileId: "voice-brian",
        queueMode: "big-chat",
        messageTimestampFormat: "12-hour",
        ignoreCommands: false,
        skipBots: false,
        skipBroadcaster: true,
        skipModerators: true,
        skipSubscribers: false,
        stripLinks: false,
        stripMentions: true,
        stripEmotes: true,
        minMessageLength: 3,
        maxMessageLength: 300,
        maxQueueSize: 25,
        maxDisplayedMessages: 300,
        chatScale: 150,
        blockedUsers: ["Nightbot", "@StreamElements"],
        blockedTerms: ["spoiler"],
        wordReplacements: [
          { id: "rep-1", from: "lol", to: "laughing", enabled: true },
        ],
        ...overrides.playback,
      },
      commands: {
        whitelist: ["Helper"],
        queue: { enabled: true, minRole: "moderator" },
        playback: { enabled: false, minRole: "moderator" },
        skip: { enabled: true, minRole: "vip" },
        clear: { enabled: false, minRole: "moderator" },
        newVoice: { enabled: true, minRole: "everyone" },
      },
      voiceProfiles: [
        {
          id: "voice-brian",
          label: "Brian",
          voice: "Microsoft Brian Online (Natural) - English (United States)",
          rate: -5,
          pitch: -10,
          volume: 0,
          enabled: true,
        },
        {
          id: "voice-aria",
          label: "Aria",
          voice: "Microsoft Aria Online (Natural) - English (United States)",
          rate: 10,
          pitch: 0,
          volume: -20,
          enabled: false,
        },
      ],
      soundEffects: [
        {
          id: "sound-1",
          name: "Air Horn",
          enabled: true,
          minRole: "subscriber",
          volume: 0.5,
        },
        { id: "sound-2", name: "bonk", enabled: true, minRole: "everyone" },
      ],
      assignments: {
        viewerone: {
          userName: "ViewerOne",
          displayName: "ViewerOne",
          voiceProfileId: "voice-aria",
          createdAt: "2026-09-01T00:00:00.000Z",
          lastSeenAt: "2026-09-30T00:00:00.000Z",
        },
        ghost: {
          userName: "ghost",
          displayName: "ghost",
          voiceProfileId: "voice-deleted",
          createdAt: "2026-09-01T00:00:00.000Z",
          lastSeenAt: "2026-09-30T00:00:00.000Z",
        },
      },
      ...overrides.data,
    },
    soundEffects: [
      {
        id: "sound-1",
        fileName: "airhorn.mp3",
        mimeType: "audio/mpeg",
        data: "AAAA",
      },
      {
        id: "sound-unused",
        fileName: "unused.mp3",
        mimeType: "audio/mpeg",
        data: "AAAA",
      },
    ],
    ...overrides.envelope,
  }
}

function parse(overrides?: ChatvoiceBackupOverrides) {
  return parseChatvoiceBackup(JSON.stringify(chatvoiceBackup(overrides)))
}

function loggedInConfig(): AppConfig {
  const config = createDefaultConfig()
  config.twitch.account = {
    id: "1",
    login: "viewer",
    displayName: "Viewer",
    profileImageUrl: "",
    bannerImageUrl: "",
    accessToken: "token",
    clientId: "client",
    scopes: [],
  }
  config.twitch.channels = [
    {
      login: "friend",
      displayName: "Friend",
      unreadIndicatorEnabled: false,
      liveNotificationsEnabled: null,
    },
    {
      login: "existing",
      unreadIndicatorEnabled: null,
      liveNotificationsEnabled: null,
    },
  ]
  config.twitch.activeChannelLogin = "existing"
  return config
}

describe("detectBackupSourceApp", () => {
  test("identifies backups by their app field", () => {
    expect(detectBackupSourceApp(JSON.stringify({ app: "chatvoice" }))).toBe(
      "chatvoice"
    )
    expect(detectBackupSourceApp(JSON.stringify({ app: "peepochat" }))).toBe(
      "peepochat"
    )
    expect(detectBackupSourceApp(JSON.stringify({ app: "other" }))).toBe(
      "unknown"
    )
    expect(detectBackupSourceApp("not json")).toBe("unknown")
    expect(detectBackupSourceApp("[]")).toBe("unknown")
  })
})

describe("parseChatvoiceBackup", () => {
  test("rejects files that are not Chatvoice backups", () => {
    expect(() => parseChatvoiceBackup("{")).toThrow("isn't a valid backup")
    expect(() =>
      parseChatvoiceBackup(JSON.stringify({ app: "peepochat", data: {} }))
    ).toThrow("This is a Peepochat backup")
    expect(() =>
      parseChatvoiceBackup(JSON.stringify({ schemaVersion: 1 }))
    ).toThrow("isn't a Chatvoice backup")
    expect(() =>
      parseChatvoiceBackup(JSON.stringify({ app: "chatvoice", data: null }))
    ).toThrow("isn't a Chatvoice backup")
  })

  test("reads backup metadata", () => {
    const imported = parse()
    expect(imported.appVersion).toBe("1.3.0")
    expect(imported.exportedAt).toBe("2026-10-01T12:00:00.000Z")
  })

  test("normalizes, validates, and dedupes saved channels", () => {
    const imported = parse()
    expect(imported.channels).toEqual(["streamer", "friend"])
    expect(imported.activeChannel).toBe("streamer")
  })

  test("includes the active channel even when it is not saved", () => {
    const imported = parse({
      twitch: { channel: "solo", savedChannels: [] },
    })
    expect(imported.channels).toEqual(["solo"])
    expect(imported.activeChannel).toBe("solo")
  })

  test("maps text-to-speech playback settings", () => {
    const { tts } = parse()
    expect(tts.textTemplate).toBe("{user} says {message} in {channel}")
    expect(tts.queueMode).toBe("big-chat")
    expect(tts.autoAssignVoices).toBe(true)
    expect(tts.defaultVoiceProfileId).toBe("voice-brian")
    expect(tts.ignoreCommands).toBe(false)
    expect(tts.skipBots).toBe(false)
    expect(tts.skipBroadcaster).toBe(true)
    expect(tts.skipModerators).toBe(true)
    expect(tts.subscribersOnly).toBe(false)
    expect(tts.stripLinks).toBe(false)
    expect(tts.stripMentions).toBe(true)
    expect(tts.stripEmotes).toBe(true)
    expect(tts.minMessageLength).toBe(3)
    expect(tts.maxMessageLength).toBe(300)
    expect(tts.maxQueueSize).toBe(25)
    expect(tts.resumeOnStartup).toBe(false)
    expect(tts.blockedUsers).toEqual(["nightbot", "streamelements"])
    expect(tts.blockedTerms).toEqual(["spoiler"])
    expect(tts.wordReplacements).toEqual([
      { id: "rep-1", from: "lol", to: "laughing", enabled: true },
    ])
  })

  test("maps voice profiles, sound effects, and chat commands", () => {
    const { tts } = parse()
    expect(tts.voiceProfiles.map((profile) => profile.id)).toEqual([
      "voice-brian",
      "voice-aria",
    ])
    expect(tts.voiceProfiles[1]).toEqual({
      id: "voice-aria",
      label: "Aria",
      voice: "Microsoft Aria Online (Natural) - English (United States)",
      rate: 10,
      pitch: 0,
      volume: -20,
      enabled: false,
    })
    expect(tts.soundEffects).toEqual([
      {
        id: "sound-1",
        name: "air_horn",
        enabled: true,
        minRole: "subscriber",
        volume: 0.5,
      },
      {
        id: "sound-2",
        name: "bonk",
        enabled: true,
        minRole: "everyone",
        volume: 1,
      },
    ])
    expect(tts.commands.whitelist).toEqual(["helper"])
    expect(tts.commands.skip).toEqual({ enabled: true, minRole: "vip" })
    expect(tts.commands.newVoice).toEqual({
      enabled: true,
      minRole: "everyone",
    })
  })

  test("truncates overly long voice profile labels instead of dropping them", () => {
    const { tts } = parse({
      data: {
        voiceProfiles: [
          {
            id: "voice-long",
            label: "x".repeat(120),
            voice: "Voice",
            rate: 0,
            pitch: 0,
            volume: 0,
            enabled: true,
          },
        ],
      },
    })
    expect(tts.voiceProfiles[0]?.label).toBe("x".repeat(80))
  })

  test("keeps assignments that point at an imported voice profile", () => {
    const imported = parse()
    expect(imported.assignments).toEqual([
      {
        userName: "viewerone",
        displayName: "ViewerOne",
        voiceProfileId: "voice-aria",
        createdAt: "2026-09-01T00:00:00.000Z",
        lastSeenAt: "2026-09-30T00:00:00.000Z",
      },
    ])
  })

  test("only keeps audio for imported sound effects", () => {
    const imported = parse()
    expect(imported.soundEffectAudio).toEqual([
      {
        id: "sound-1",
        fileName: "airhorn.mp3",
        mimeType: "audio/mpeg",
        data: "AAAA",
      },
    ])
  })

  test("converts chat appearance settings", () => {
    const imported = parse()
    expect(imported.messageTimestampFormat).toBe("12-hour")
    expect(imported.chatFontSizePx).toBe(20)
  })

  test("leaves the font size alone at the default chat scale", () => {
    expect(parse({ playback: { chatScale: 100 } }).chatFontSizePx).toBeNull()
    expect(parse({ playback: { chatScale: "big" } }).chatFontSizePx).toBeNull()
  })

  test("reports settings that cannot be carried over exactly", () => {
    const imported = parse({
      playback: {
        skipSubscribers: true,
        minMessageLength: 120,
        maxMessageLength: 5,
      },
    })
    expect(imported.tts.minMessageLength).toBe(20)
    expect(imported.tts.maxMessageLength).toBe(20)
    expect(imported.tts.subscribersOnly).toBe(false)
    expect(imported.adjustments).toHaveLength(3)
  })

  test("rejects backups missing the structure Chatvoice always exports", () => {
    for (const data of [
      {},
      { twitch: {}, playback: {} },
      { twitch: {}, playback: {}, voiceProfiles: [] },
      { twitch: "nope", playback: {}, voiceProfiles: [{ id: "voice" }] },
      { twitch: {}, playback: {}, voiceProfiles: [{ nope: true }] },
    ]) {
      expect(() =>
        parseChatvoiceBackup(JSON.stringify({ app: "chatvoice", data }))
      ).toThrow("isn't a Chatvoice backup")
    }
  })

  test("survives a sparse backup with invalid values", () => {
    const imported = parseChatvoiceBackup(
      JSON.stringify({
        app: "chatvoice",
        data: {
          twitch: { savedChannels: "nope" },
          playback: { maxQueueSize: 9000, blockedUsers: [1, "Bob"] },
          voiceProfiles: [{ id: "voice-a", label: 5, voice: "Voice A" }],
          soundEffects: "nope",
          assignments: ["nope"],
        },
        soundEffects: [{ id: "x" }],
      })
    )
    expect(imported.channels).toEqual([])
    expect(imported.activeChannel).toBeNull()
    expect(imported.tts.maxQueueSize).toBe(10)
    expect(imported.tts.blockedUsers).toEqual(["bob"])
    expect(imported.tts.voiceProfiles).toEqual([
      {
        id: "voice-a",
        label: "",
        voice: "Voice A",
        rate: 0,
        pitch: 0,
        volume: 0,
        enabled: true,
      },
    ])
    expect(imported.tts.soundEffects).toEqual([])
    expect(imported.assignments).toEqual([])
    expect(imported.soundEffectAudio).toEqual([])
    expect(imported.appVersion).toBeNull()
  })

  test("leaves out and reports sound audio that cannot be decoded", () => {
    const imported = parse({
      envelope: {
        soundEffects: [
          {
            id: "sound-1",
            fileName: "airhorn.mp3",
            mimeType: "audio/mpeg",
            data: "%%%not base64%%%",
          },
        ],
      },
    })
    expect(imported.soundEffectAudio).toEqual([])
    expect(imported.tts.soundEffects).toHaveLength(2)
    expect(imported.adjustments).toEqual([
      'The audio for the "air_horn" sound couldn\'t be read, so it was left out.',
    ])
  })
})

describe("applyChatvoiceImport", () => {
  test("sets up a fresh config from the backup", () => {
    const imported = parse()
    const next = applyChatvoiceImport(createDefaultConfig(), imported)

    expect(next.twitch.channels.map((channel) => channel.login)).toEqual([
      "streamer",
      "friend",
    ])
    expect(next.twitch.activeChannelLogin).toBe("streamer")
    expect(next.twitch.account).toBeNull()
    expect(next.chat.messageTimestampFormat).toBe("12-hour")
    expect(next.chat.fontSizePx).toBe(20)
    expect(next.tts).toEqual(imported.tts)
    expect(next.layout.sidebarOrder).toEqual([
      "channel:streamer",
      "channel:friend",
    ])
  })

  test("adds new channels without touching existing ones", () => {
    const current = loggedInConfig()
    const imported = parse()
    const profiles = new Map([
      [
        "streamer",
        {
          displayName: "Streamer",
          profileImageUrl: "https://example.com/s.png",
        },
      ],
    ])

    expect(getNewChatvoiceChannels(current, imported)).toEqual(["streamer"])

    const next = applyChatvoiceImport(current, imported, profiles)
    expect(next.twitch.account).toEqual(current.twitch.account)
    expect(next.twitch.activeChannelLogin).toBe("existing")
    expect(next.twitch.channels).toEqual([
      current.twitch.channels[0]!,
      current.twitch.channels[1]!,
      {
        login: "streamer",
        displayName: "Streamer",
        profileImageUrl: "https://example.com/s.png",
        unreadIndicatorEnabled: null,
        liveNotificationsEnabled: null,
      },
    ])
  })

  test("does not override chat appearance the user already changed", () => {
    const current = loggedInConfig()
    current.chat.messageTimestampFormat = "none"
    current.chat.fontSizePx = CHAT_FONT_SIZE_DEFAULT + 1

    const next = applyChatvoiceImport(current, parse())
    expect(next.chat.messageTimestampFormat).toBe("none")
    expect(next.chat.fontSizePx).toBe(CHAT_FONT_SIZE_DEFAULT + 1)
  })

  test("replaces existing text-to-speech settings", () => {
    const current = loggedInConfig()
    current.tts.textTemplate = "{message}"
    current.tts.voiceProfiles = [
      {
        id: "voice-mine",
        label: "Mine",
        voice: "",
        rate: 0,
        pitch: 0,
        volume: 0,
        enabled: true,
      },
    ]

    const imported = parse()
    const next = applyChatvoiceImport(current, imported)
    expect(next.tts).toEqual(imported.tts)
  })
})

describe("summarizeChatvoiceImport", () => {
  test("counts what will be imported", () => {
    expect(summarizeChatvoiceImport(parse())).toEqual({
      channelCount: 2,
      voiceProfileCount: 2,
      assignmentCount: 1,
      soundEffectCount: 2,
      soundEffectAudioCount: 1,
      wordReplacementCount: 1,
      blockedUserCount: 2,
      blockedTermCount: 1,
      enabledCommandCount: 3,
    })
  })
})
