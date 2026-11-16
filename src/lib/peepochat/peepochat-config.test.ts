import {
  afterEach,
  beforeEach,
  describe,
  expect,
  setSystemTime,
  test,
} from "bun:test"
import { IDBFactory } from "fake-indexeddb"

import packageJson from "../../../package.json"
import { restoreEmbeddedCustomSounds } from "@/lib/highlights/custom-sounds"
import {
  PEEPOCHAT_BACKUP_STORAGE_KEY,
  PEEPOCHAT_SCHEMA_VERSION,
  PEEPOCHAT_STORAGE_KEY,
  createDefaultConfig,
  exportConfigBackup,
  findMessageUrls,
  hasStoredConfig,
  importConfigBackup,
  isLiveNotificationsEnabledForChannel,
  isLoggedOutWithSavedSetup,
  isUnreadIndicatorEnabledForChannel,
  loadConfig,
  mergeRestoredConfig,
  needsOnboardingForConfig,
  parseBackupPayload,
  parseBackupPreview,
  saveConfig,
  type AppConfig,
  type TwitchAccount,
} from "@/lib/peepochat/peepochat-config"
import { closeTtsDatabase, putVoiceAssignment } from "@/lib/tts/tts-db"

const NOW = new Date("2026-03-01T12:00:00.000Z")
const originalIndexedDB = globalThis.indexedDB

function account(overrides: Partial<TwitchAccount> = {}): TwitchAccount {
  return {
    id: "1001",
    login: "viewer",
    displayName: "Viewer",
    profileImageUrl: "https://example.com/p.png",
    bannerImageUrl: "",
    accessToken: "token-abc",
    clientId: "client-xyz",
    scopes: ["chat:read", "chat:edit"],
    ...overrides,
  }
}

function load(input: unknown): AppConfig {
  return importConfigBackup(JSON.stringify(input))
}

function storePrimary(raw: string) {
  window.localStorage.setItem(PEEPOCHAT_STORAGE_KEY, raw)
}

function storeBackup(raw: string) {
  window.localStorage.setItem(PEEPOCHAT_BACKUP_STORAGE_KEY, raw)
}

function customConfig(): AppConfig {
  return load({
    updatedAt: "2026-02-01T00:00:00.000Z",
    twitch: {
      account: account(),
      channels: [
        {
          login: "alpha",
          displayName: "Alpha",
          liveNotificationsEnabled: true,
        },
        { login: "beta" },
        { login: "gamma", unreadIndicatorEnabled: false },
      ],
      activeChannelLogin: "alpha",
    },
    chat: {
      messageTimestampFormat: "12-hour",
      fontFamily: "Inter",
      fontSizePx: 16,
      linkEmoteScaleToFontSize: false,
      emoteScale: 20,
      maxLiveMessagesPerChannel: 200,
      deletedMessagesBehavior: "remove",
      emotes: { bttvEnabled: false },
      badges: { owoMemberEnabled: false },
      messageQuickActions: { banEnabled: true },
      streamInfo: { categoryEnabled: true },
    },
    layout: {
      activeSplitId: "split-1",
      splits: [{ id: "split-1", channels: ["beta", "gamma"] }],
      sidebarOrder: ["channel:alpha", "split:split-1"],
    },
    nicknames: { entries: [{ login: "someone", nickname: "Buddy" }] },
    highlights: {
      doNotDisturbEnabled: true,
      useDefaultSounds: false,
      pings: [{ id: "ping-1", pattern: "hello", notify: false }],
    },
    player: { mode: "sidebar", multiAudio: "all", desktopSizePercent: 60 },
    tts: {
      textTemplate: "{user}: {message}",
      maxQueueSize: 25,
      blockedUsers: ["nightbot"],
      voiceProfiles: [
        {
          id: "voice-default",
          label: "Default",
          voice: "",
          rate: 0,
          pitch: 0,
          volume: 0,
          enabled: true,
        },
        {
          id: "voice-2",
          label: "Deep",
          voice: "en-US",
          rate: -20,
          pitch: -40,
          volume: 10,
          enabled: true,
        },
      ],
    },
  })
}

beforeEach(() => {
  setSystemTime(NOW)
  closeTtsDatabase()
  globalThis.indexedDB = new IDBFactory()
})

afterEach(() => {
  setSystemTime()
  closeTtsDatabase()
  globalThis.indexedDB = originalIndexedDB
})

describe("loadConfig", () => {
  test("returns the default config when nothing is stored", () => {
    expect(hasStoredConfig()).toBe(false)
    expect(loadConfig()).toEqual(createDefaultConfig())
  })

  test("round-trips a saved config", () => {
    const config = customConfig()
    saveConfig(config)

    expect(hasStoredConfig()).toBe(true)
    expect(loadConfig()).toEqual({ ...config, updatedAt: NOW.toISOString() })
  })

  test("keeps the previous saved copy as a backup on every save", () => {
    const first = customConfig()
    saveConfig(first)
    expect(window.localStorage.getItem(PEEPOCHAT_BACKUP_STORAGE_KEY)).toBeNull()

    const firstRaw = window.localStorage.getItem(PEEPOCHAT_STORAGE_KEY)
    saveConfig({ ...first, chat: { ...first.chat, fontSizePx: 20 } })

    expect(window.localStorage.getItem(PEEPOCHAT_BACKUP_STORAGE_KEY)).toBe(
      firstRaw
    )
  })

  test.each([["{not json"], ["null"]])(
    "recovers from the backup when the primary copy is %p",
    (raw) => {
      const config = customConfig()
      saveConfig(config)
      saveConfig({ ...config, chat: { ...config.chat, fontSizePx: 22 } })
      storePrimary(raw)

      const loaded = loadConfig()
      expect(loaded.chat.fontSizePx).toBe(16)
      expect(loaded.twitch.account).toEqual(config.twitch.account)
      expect(loaded.twitch.channels.map((c) => c.login)).toEqual([
        "alpha",
        "beta",
        "gamma",
      ])
    }
  )

  test("falls back to defaults when primary and backup are both corrupt", () => {
    storePrimary("{oops")
    storeBackup("also not json")

    expect(loadConfig()).toEqual(createDefaultConfig())
  })

  test("normalizes values while saving", () => {
    const config = createDefaultConfig()
    config.twitch.channels = [
      {
        login: " #Streamer ",
        unreadIndicatorEnabled: null,
        liveNotificationsEnabled: null,
      },
    ]
    config.twitch.activeChannelLogin = "#STREAMER"
    saveConfig(config)

    const stored = JSON.parse(
      window.localStorage.getItem(PEEPOCHAT_STORAGE_KEY) ?? "null"
    ) as AppConfig
    expect(stored.twitch.channels.map((c) => c.login)).toEqual(["streamer"])
    expect(stored.twitch.activeChannelLogin).toBe("streamer")
    expect(stored.layout.sidebarOrder).toEqual(["channel:streamer"])
    expect(stored.updatedAt).toBe(NOW.toISOString())
  })
})

describe("loading old, partial and malformed configs", () => {
  test("an empty object loads as the defaults", () => {
    expect(load({})).toEqual(createDefaultConfig())
  })

  test("fills missing sections and fields with defaults while keeping saved values", () => {
    const config = load({
      twitch: {
        account: null,
        channels: [{ login: "alpha" }],
        activeChannelLogin: "alpha",
      },
      chat: { fontSizePx: 18, emotes: { ffzEnabled: false } },
    })
    const defaults = createDefaultConfig()

    expect(config.schemaVersion).toBe(PEEPOCHAT_SCHEMA_VERSION)
    expect(config.updatedAt).toBe(NOW.toISOString())
    expect(config.chat.fontSizePx).toBe(18)
    expect(config.chat.emoteScale).toBe(18)
    expect(config.chat.emotes).toEqual({
      ...defaults.chat.emotes,
      ffzEnabled: false,
    })
    expect(config.chat.streamInfo).toEqual(defaults.chat.streamInfo)
    expect(config.highlights).toEqual(defaults.highlights)
    expect(config.player).toEqual(defaults.player)
    expect(config.nicknames).toEqual({ entries: [] })
    expect(config.tts).toEqual(defaults.tts)
    expect(config.twitch.channels).toEqual([
      {
        login: "alpha",
        unreadIndicatorEnabled: null,
        liveNotificationsEnabled: null,
      },
    ])
  })

  test("repairs invalid values field by field without discarding the rest", () => {
    const config = load({
      twitch: {
        account: account(),
        channels: [{ login: "alpha" }],
        activeChannelLogin: "alpha",
      },
      chat: {
        fontSizePx: 999,
        maxLiveMessagesPerChannel: "lots",
        messageTimestampFormat: "sundial",
        emotes: { bttvEnabled: "no", seventvEnabled: false },
        recentMessagesEnabled: false,
      },
      highlights: {
        doNotDisturbEnabled: "yes",
        livePushNotificationsEnabled: true,
      },
      player: { mode: "theatre", multiAudio: "muted" },
    })
    const defaults = createDefaultConfig()

    expect(config.twitch.account).toEqual(account())
    expect(config.chat.fontSizePx).toBe(defaults.chat.fontSizePx)
    expect(config.chat.maxLiveMessagesPerChannel).toBe(
      defaults.chat.maxLiveMessagesPerChannel
    )
    expect(config.chat.messageTimestampFormat).toBe("24-hour")
    expect(config.chat.emotes.bttvEnabled).toBe(true)
    expect(config.chat.emotes.seventvEnabled).toBe(false)
    expect(config.chat.recentMessagesEnabled).toBe(false)
    expect(config.highlights.doNotDisturbEnabled).toBe(false)
    expect(config.highlights.livePushNotificationsEnabled).toBe(true)
    expect(config.player.mode).toBe("multi")
    expect(config.player.multiAudio).toBe("muted")
  })

  test("replaces wrongly typed sections with defaults", () => {
    const config = load({
      twitch: "nope",
      chat: [],
      layout: 42,
      highlights: null,
      player: "classic",
      nicknames: "x",
      tts: "garbage",
    })
    expect(config).toEqual(createDefaultConfig())
  })

  test("strips unknown fields and forces the current schema version", () => {
    const config = load({
      schemaVersion: 99,
      somethingNew: { nested: true },
      chat: { futureSetting: true },
    }) as AppConfig & Record<string, unknown>

    expect(config.schemaVersion).toBe(PEEPOCHAT_SCHEMA_VERSION)
    expect(config.somethingNew).toBeUndefined()
    expect("futureSetting" in config.chat).toBe(false)
  })

  test("migrates the legacy 'default' font family to the app default", () => {
    expect(load({ chat: { fontFamily: "default" } }).chat.fontFamily).toBe("")
    expect(load({ chat: { fontFamily: "Comic Neue" } }).chat.fontFamily).toBe(
      "Comic Neue"
    )
  })

  test("only links emote scale to font size when enabled", () => {
    const linked = load({ chat: { fontSizePx: 20, emoteScale: 11 } })
    expect(linked.chat.emoteScale).toBe(20)

    const unlinked = load({
      chat: { fontSizePx: 20, emoteScale: 11, linkEmoteScaleToFontSize: false },
    })
    expect(unlinked.chat.emoteScale).toBe(11)
  })

  test("normalizes channel logins, drops invalid entries and adds the active channel", () => {
    const config = load({
      twitch: {
        account: null,
        channels: [
          { login: " #Alpha " },
          { login: 5 },
          "beta",
          { login: "gamma", unreadIndicatorEnabled: "yes" },
          { login: "delta", liveNotificationsEnabled: false },
        ],
        activeChannelLogin: "#Omega",
      },
    })

    expect(config.twitch.activeChannelLogin).toBe("omega")
    expect(config.twitch.channels).toEqual([
      {
        login: "alpha",
        unreadIndicatorEnabled: null,
        liveNotificationsEnabled: null,
      },
      {
        login: "delta",
        unreadIndicatorEnabled: null,
        liveNotificationsEnabled: false,
      },
      {
        login: "omega",
        unreadIndicatorEnabled: null,
        liveNotificationsEnabled: null,
      },
    ])
  })

  test("coerces malformed account credentials instead of dropping the account", () => {
    const config = load({
      twitch: {
        account: {
          ...account(),
          accessToken: 12345,
          clientId: null,
          scopes: ["chat:read", 7, null, "chat:edit"],
          accessTokenExpiresAt: "tomorrow",
        },
        channels: [],
        activeChannelLogin: "",
      },
    })

    expect(config.twitch.account).toEqual({
      ...account(),
      accessToken: "",
      clientId: "",
      scopes: ["chat:read", "chat:edit"],
    })
    expect(config.twitch.account?.accessTokenExpiresAt).toBeUndefined()
  })

  test("keeps a finite token expiry", () => {
    const config = load({
      twitch: {
        account: account({ accessTokenExpiresAt: 1_800_000_000_000 }),
        channels: [],
        activeChannelLogin: "",
      },
    })
    expect(config.twitch.account?.accessTokenExpiresAt).toBe(1_800_000_000_000)
  })

  test("cleans up splits and the active split", () => {
    const config = load({
      twitch: {
        account: null,
        channels: [{ login: "x" }, { login: "y" }, { login: "z" }],
        activeChannelLogin: "",
      },
      layout: {
        activeSplitId: "gone",
        splits: [
          { id: " keep ", channels: ["#X", "y", "x", " "] },
          { id: "solo", channels: ["z"] },
          { id: "", channels: ["p", "q"] },
          { channels: ["m", "n"] },
          5,
        ],
        sidebarOrder: ["bogus", "channel:z", "channel:z", "split:solo"],
      },
    })

    expect(config.layout.activeSplitId).toBeNull()
    expect(config.layout.splits).toHaveLength(1)
    expect(config.layout.splits[0]).toMatchObject({
      id: "keep",
      channels: ["x", "y"],
      unreadIndicatorEnabled: null,
      liveNotificationsEnabled: null,
    })
    expect(config.layout.splits[0]?.layout).toEqual({
      type: "split",
      direction: "row",
      children: [
        { node: { type: "pane", channel: "x" }, size: 50 },
        { node: { type: "pane", channel: "y" }, size: 50 },
      ],
    })
    expect(config.layout.sidebarOrder).toEqual(["channel:z", "split:keep"])
  })

  test("preserves a valid active split and custom sidebar order", () => {
    const config = load({
      twitch: {
        account: null,
        channels: [{ login: "a" }, { login: "b" }, { login: "c" }],
        activeChannelLogin: "",
      },
      layout: {
        activeSplitId: "s1",
        splits: [{ id: "s1", channels: ["b", "c"] }],
        sidebarOrder: ["split:s1", "channel:a"],
      },
    })

    expect(config.layout.activeSplitId).toBe("s1")
    expect(config.layout.sidebarOrder).toEqual(["split:s1", "channel:a"])
  })

  test("falls back to the default layout when layout is not an object with splits", () => {
    expect(load({ layout: { splits: "nope" } }).layout).toEqual(
      createDefaultConfig().layout
    )
    expect(load({ layout: [] }).layout).toEqual(createDefaultConfig().layout)
  })

  test("drops invalid and duplicate nicknames", () => {
    const config = load({
      nicknames: {
        entries: [
          { login: "Abc_user", nickname: "First" },
          { login: "abc_user", nickname: "Second" },
          { login: "other_user", nickname: "first" },
          { login: "x", nickname: "TooShortLogin" },
          { login: "valid_one", nickname: "has space" },
          { login: "valid_two", nickname: "Okay_2" },
          "junk",
        ],
      },
    })

    expect(config.nicknames.entries).toEqual([
      { login: "abc_user", nickname: "First" },
      { login: "valid_two", nickname: "Okay_2" },
    ])
  })

  test("drops invalid ping rules and normalizes the rest", () => {
    const config = load({
      highlights: {
        pings: [
          { id: "", pattern: "x" },
          { id: " p1 ", pattern: "hi" },
          null,
          { id: "p2", pattern: "a".repeat(501) },
          { id: "p3", pattern: "yo", enabled: false, notify: false },
        ],
      },
    })

    expect(config.highlights.pings).toEqual([
      { id: "p1", pattern: "hi", enabled: true, notify: true },
      { id: "p3", pattern: "yo", enabled: false, notify: false },
    ])
  })

  test("trims custom sound ids and treats blank ids as unset", () => {
    const config = load({
      highlights: {
        useDefaultSounds: false,
        pingSoundCustomId: "  sound-1  ",
        liveSoundCustomId: "   ",
      },
    })

    expect(config.highlights.useDefaultSounds).toBe(false)
    expect(config.highlights.pingSoundCustomId).toBe("sound-1")
    expect(config.highlights.liveSoundCustomId).toBeNull()
  })

  test("normalizes the embedded TTS config", () => {
    const config = load({
      tts: { maxQueueSize: 9999, blockedUsers: ["@Spammer", "spammer"] },
    })
    expect(config.tts.maxQueueSize).toBe(10)
    expect(config.tts.blockedUsers).toEqual(["spammer"])
  })

  test("loading is idempotent", () => {
    const once = customConfig()
    expect(load(once)).toEqual(once)
  })

  test("throws for payloads that are not JSON", () => {
    expect(() => importConfigBackup("{nope")).toThrow()
  })
})

describe("backup export and import", () => {
  test("export envelope carries app metadata", async () => {
    const envelope = JSON.parse(await exportConfigBackup(customConfig())) as {
      app: string
      appVersion: string
      exportedAt: string
      schemaVersion: number
    }

    expect(envelope.app).toBe("peepochat")
    expect(envelope.appVersion).toBe(packageJson.version)
    expect(envelope.exportedAt).toBe(NOW.toISOString())
    expect(envelope.schemaVersion).toBe(PEEPOCHAT_SCHEMA_VERSION)
  })

  test("export never includes Twitch credentials", async () => {
    const config = customConfig()
    config.twitch.account = account({
      accessToken: "super-secret-token",
      clientId: "secret-client",
      accessTokenExpiresAt: 123,
    })
    const payload = await exportConfigBackup(config)

    expect(payload).not.toContain("super-secret-token")
    expect(payload).not.toContain("secret-client")
    expect(payload).not.toContain("accessTokenExpiresAt")
  })

  test("export then import round-trips every setting except credentials", async () => {
    const config = customConfig()
    const result = parseBackupPayload(await exportConfigBackup(config))

    expect(result.exportedAt).toBe(NOW.toISOString())
    expect(result.appVersion).toBe(packageJson.version)
    expect(result.config).toEqual({
      ...config,
      twitch: {
        ...config.twitch,
        account: { ...account(), accessToken: "", clientId: "" },
      },
    })
  })

  test("restoring a backup into the same account keeps the active session", async () => {
    const config = customConfig()
    const restored = importConfigBackup(await exportConfigBackup(config))

    expect(mergeRestoredConfig(restored, config)).toEqual(config)
  })

  test("export works without an account", async () => {
    const config = load({
      twitch: {
        account: null,
        channels: [{ login: "a" }],
        activeChannelLogin: "",
      },
    })
    const restored = importConfigBackup(await exportConfigBackup(config))
    expect(restored).toEqual(config)
  })

  test("export embeds referenced custom sounds and TTS voice assignments", async () => {
    await restoreEmbeddedCustomSounds([
      {
        id: "sound-ping",
        name: "Ping",
        mimeType: "audio/ogg",
        data: "AQIDBA==",
      },
      {
        id: "sound-unused",
        name: "Unused",
        mimeType: "audio/ogg",
        data: "AQ==",
      },
    ])
    await putVoiceAssignment({
      userName: "chatter",
      displayName: "Chatter",
      voiceProfileId: "voice-2",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-02T00:00:00.000Z",
    })

    const config = customConfig()
    config.highlights.pingSoundCustomId = "sound-ping"
    const result = parseBackupPayload(await exportConfigBackup(config))

    expect(result.embeddedSounds).toEqual([
      {
        id: "sound-ping",
        name: "Ping",
        mimeType: "audio/ogg",
        data: "AQIDBA==",
      },
    ])
    expect(result.tts.assignments).toEqual([
      {
        userName: "chatter",
        displayName: "Chatter",
        voiceProfileId: "voice-2",
        createdAt: "2026-01-01T00:00:00.000Z",
        lastSeenAt: "2026-01-02T00:00:00.000Z",
      },
    ])
    expect(result.tts.soundEffects).toEqual([])
    expect(result.config.highlights.pingSoundCustomId).toBe("sound-ping")
  })

  test("accepts a bare config without an envelope", () => {
    const result = parseBackupPayload(
      JSON.stringify({
        twitch: {
          account: null,
          channels: [{ login: "a" }],
          activeChannelLogin: "",
        },
      })
    )

    expect(result.exportedAt).toBeNull()
    expect(result.appVersion).toBeNull()
    expect(result.embeddedSounds).toEqual([])
    expect(result.tts).toEqual({ assignments: null, soundEffects: null })
    expect(result.config.twitch.channels.map((c) => c.login)).toEqual(["a"])
  })

  test("filters malformed embedded sounds and TTS backup entries", () => {
    const result = parseBackupPayload(
      JSON.stringify({
        app: "peepochat",
        appVersion: "1.0.0",
        exportedAt: "2026-01-01T00:00:00.000Z",
        schemaVersion: 1,
        data: {},
        embeddedSounds: [
          { id: "ok", name: "Ok", mimeType: "audio/ogg", data: "AQ==" },
          { id: "no-data", name: "x", mimeType: "audio/ogg" },
          null,
          "sound",
        ],
        tts: {
          assignments: [
            { userName: "@Chatter", voiceProfileId: "v1" },
            {
              userName: "full",
              displayName: "Full",
              voiceProfileId: "v2",
              createdAt: "2025-01-01T00:00:00.000Z",
              lastSeenAt: "2025-02-01T00:00:00.000Z",
            },
            { userName: "missing-voice" },
            { userName: "@", voiceProfileId: "v1" },
            42,
          ],
          soundEffects: [
            { id: "fx", mimeType: "audio/wav", data: "AQ==" },
            { id: "fx2", fileName: "b.wav", mimeType: "audio/wav", data: "" },
            { id: "bad", mimeType: "audio/wav", data: 5 },
            { id: "", mimeType: "audio/wav", data: "AQ==" },
          ],
        },
      })
    )

    expect(result.embeddedSounds).toEqual([
      { id: "ok", name: "Ok", mimeType: "audio/ogg", data: "AQ==" },
    ])
    expect(result.tts.assignments).toEqual([
      {
        userName: "chatter",
        displayName: "@Chatter",
        voiceProfileId: "v1",
        createdAt: NOW.toISOString(),
        lastSeenAt: NOW.toISOString(),
      },
      {
        userName: "full",
        displayName: "Full",
        voiceProfileId: "v2",
        createdAt: "2025-01-01T00:00:00.000Z",
        lastSeenAt: "2025-02-01T00:00:00.000Z",
      },
    ])
    expect(result.tts.soundEffects).toEqual([
      { id: "fx", fileName: "", mimeType: "audio/wav", data: "AQ==" },
      { id: "fx2", fileName: "b.wav", mimeType: "audio/wav", data: "" },
    ])
  })

  test("ignores a malformed TTS section instead of rejecting the backup", () => {
    const result = parseBackupPayload(
      JSON.stringify({
        app: "peepochat",
        appVersion: "1.0.0",
        exportedAt: "2026-01-01T00:00:00.000Z",
        schemaVersion: 1,
        data: { chat: { fontSizePx: 15 } },
        tts: "broken",
      })
    )

    expect(result.config.chat.fontSizePx).toBe(15)
    expect(result.tts).toEqual({ assignments: null, soundEffects: null })
    expect(result.exportedAt).toBe("2026-01-01T00:00:00.000Z")
  })

  test("builds a preview of the backup contents", async () => {
    const preview = parseBackupPreview(await exportConfigBackup(customConfig()))

    expect(preview).toEqual({
      exportedAt: NOW.toISOString(),
      appVersion: packageJson.version,
      accountDisplayName: "Viewer",
      accountLogin: "viewer",
      channelCount: 3,
      sidebarItems: [
        { type: "channel", name: "Alpha" },
        { type: "split", names: ["beta", "gamma"] },
      ],
      pingRuleCount: 1,
      embeddedSounds: [],
    })
  })
})

describe("mergeRestoredConfig", () => {
  const restoredWithoutCredentials = () =>
    load({
      twitch: {
        account: account({ accessToken: "", clientId: "" }),
        channels: [{ login: "a" }],
        activeChannelLogin: "",
      },
    })

  test("returns the restored config unchanged when it has no account", () => {
    const restored = load({
      twitch: {
        account: null,
        channels: [{ login: "a" }],
        activeChannelLogin: "",
      },
    })
    const existing = load({
      twitch: { account: account(), channels: [], activeChannelLogin: "" },
    })

    expect(mergeRestoredConfig(restored, existing)).toBe(restored)
  })

  test("reuses the existing token and client id for the same account", () => {
    const existing = load({
      twitch: { account: account(), channels: [], activeChannelLogin: "" },
    })
    const merged = mergeRestoredConfig(restoredWithoutCredentials(), existing)

    expect(merged.twitch.account?.accessToken).toBe("token-abc")
    expect(merged.twitch.account?.clientId).toBe("client-xyz")
    expect(merged.twitch.channels.map((c) => c.login)).toEqual(["a"])
  })

  test("logs out when the restored account differs from the current session", () => {
    const existing = load({
      twitch: {
        account: account({ id: "other" }),
        channels: [],
        activeChannelLogin: "",
      },
    })
    const merged = mergeRestoredConfig(restoredWithoutCredentials(), existing)

    expect(merged.twitch.account).toBeNull()
    expect(merged.twitch.channels.map((c) => c.login)).toEqual(["a"])
  })

  test("keeps credentials included in the restored config", () => {
    const restored = load({
      twitch: {
        account: account({ accessToken: "restored-token", clientId: "" }),
        channels: [],
        activeChannelLogin: "",
      },
    })
    const merged = mergeRestoredConfig(
      restored,
      createDefaultConfig(),
      "env-client"
    )

    expect(merged.twitch.account?.accessToken).toBe("restored-token")
    expect(merged.twitch.account?.clientId).toBe("env-client")
  })
})

describe("per-channel notification settings", () => {
  const config = () =>
    load({
      twitch: {
        account: null,
        channels: [
          {
            login: "on",
            unreadIndicatorEnabled: true,
            liveNotificationsEnabled: true,
          },
          {
            login: "off",
            unreadIndicatorEnabled: false,
            liveNotificationsEnabled: false,
          },
          { login: "inherit" },
          { login: "insplit" },
          { login: "insplit2" },
        ],
        activeChannelLogin: "",
      },
      layout: {
        splits: [
          {
            id: "s",
            channels: ["insplit", "insplit2"],
            liveNotificationsEnabled: true,
          },
        ],
      },
      highlights: {
        unreadIndicatorsEnabled: false,
        livePushNotificationsEnabled: false,
      },
    })

  test("channel overrides win over the global unread setting", () => {
    expect(isUnreadIndicatorEnabledForChannel(config(), "on")).toBe(true)
    expect(isUnreadIndicatorEnabledForChannel(config(), "off")).toBe(false)
    expect(isUnreadIndicatorEnabledForChannel(config(), "inherit")).toBe(false)
    expect(isUnreadIndicatorEnabledForChannel(config(), "unknown")).toBe(false)
  })

  test("live notifications resolve channel, then split, then global", () => {
    expect(isLiveNotificationsEnabledForChannel(config(), "on")).toBe(true)
    expect(isLiveNotificationsEnabledForChannel(config(), "off")).toBe(false)
    expect(isLiveNotificationsEnabledForChannel(config(), "insplit")).toBe(true)
    expect(isLiveNotificationsEnabledForChannel(config(), "inherit")).toBe(
      false
    )
  })
})

describe("session state helpers", () => {
  test("detects a logged-out user with a saved setup", () => {
    const config = load({
      twitch: {
        account: account({ accessToken: "  " }),
        channels: [{ login: "a" }],
        activeChannelLogin: "",
      },
    })

    expect(isLoggedOutWithSavedSetup(config)).toBe(false)
    saveConfig(config)
    expect(isLoggedOutWithSavedSetup(config)).toBe(true)
    expect(needsOnboardingForConfig(config)).toBe(true)
  })

  test("onboarding is complete once logged in with at least one channel", () => {
    const loggedIn = load({
      twitch: { account: account(), channels: [], activeChannelLogin: "" },
    })
    expect(needsOnboardingForConfig(loggedIn)).toBe(true)

    loggedIn.twitch.channels = [
      {
        login: "a",
        unreadIndicatorEnabled: null,
        liveNotificationsEnabled: null,
      },
    ]
    expect(needsOnboardingForConfig(loggedIn)).toBe(false)
  })
})

describe("findMessageUrls", () => {
  test("returns each http(s) URL with its offsets", () => {
    const text = "see https://a.com/x and http://b.org?q=1 ok"
    expect(findMessageUrls(text)).toEqual([
      { url: "https://a.com/x", start: 4, end: 19 },
      { url: "http://b.org?q=1", start: 24, end: 40 },
    ])
    expect(findMessageUrls("ftp://nope www.example.com")).toEqual([])
  })
})
