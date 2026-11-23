import {
  CHAT_FONT_SIZE_DEFAULT,
  CHAT_FONT_SIZE_MAX,
  CHAT_FONT_SIZE_MIN,
  createDefaultConfig,
  createTwitchChannel,
  normalizeConfig,
  type AppConfig,
  type MessageTimestampFormat,
  type TwitchAccount,
} from "@/lib/peepochat/peepochat-config"
import { isValidTwitchLogin } from "@/lib/chat/nicknames"
import { fetchTwitchUsersByLogin } from "@/lib/twitch/auth/api"
import { normalizeChannelLogin } from "@/lib/twitch/channel/channel"
import {
  TTS_MAX_MESSAGE_LENGTH_MAX,
  TTS_MAX_MESSAGE_LENGTH_MIN,
  TTS_MIN_MESSAGE_LENGTH_MAX,
  normalizeLookupValue,
  normalizeTtsConfig,
  type TtsConfig,
  type TtsVoiceAssignment,
} from "@/lib/tts/tts-config"
import type { TtsSoundEffectAudioBackup } from "@/lib/tts/tts-db"

const CHATVOICE_APP_ID = "chatvoice"
const PEEPOCHAT_APP_ID = "peepochat"
const CHATVOICE_DEFAULT_CHAT_SCALE = 100
const CHATVOICE_CHAT_SCALE_MIN = 75
const CHATVOICE_CHAT_SCALE_MAX = 200
const VOICE_PROFILE_LABEL_MAX_LENGTH = 80
const TWITCH_USERS_BATCH_SIZE = 100

const MESSAGE_TIMESTAMP_FORMATS: readonly MessageTimestampFormat[] = [
  "24-hour",
  "12-hour",
  "12-hour-meridiem",
  "none",
]

export type BackupSourceApp = "peepochat" | "chatvoice" | "unknown"

export type ChatvoiceImport = {
  appVersion: string | null
  exportedAt: string | null
  channels: string[]
  activeChannel: string | null
  tts: TtsConfig
  assignments: TtsVoiceAssignment[]
  soundEffectAudio: TtsSoundEffectAudioBackup[]
  messageTimestampFormat: MessageTimestampFormat | null
  chatFontSizePx: number | null
  adjustments: string[]
}

export type ChannelProfile = {
  displayName?: string
  profileImageUrl?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function parseJson(payload: string): unknown {
  try {
    return JSON.parse(payload) as unknown
  } catch {
    throw new Error("This file isn't a valid backup.")
  }
}

export function getBackupSourceApp(parsed: unknown): BackupSourceApp {
  if (!isRecord(parsed)) {
    return "unknown"
  }
  if (parsed.app === CHATVOICE_APP_ID) {
    return "chatvoice"
  }
  if (parsed.app === PEEPOCHAT_APP_ID) {
    return "peepochat"
  }
  return "unknown"
}

export function detectBackupSourceApp(payload: string): BackupSourceApp {
  try {
    return getBackupSourceApp(JSON.parse(payload) as unknown)
  } catch {
    return "unknown"
  }
}

function parseChannels(twitch: Record<string, unknown>): {
  channels: string[]
  activeChannel: string | null
} {
  const candidates = readArray(twitch.savedChannels).filter(
    (value): value is string => typeof value === "string"
  )
  const rawActive =
    typeof twitch.channel === "string"
      ? normalizeChannelLogin(twitch.channel)
      : ""
  const activeChannel = isValidTwitchLogin(rawActive) ? rawActive : null

  const channels: string[] = []
  const seen = new Set<string>()
  for (const candidate of [
    ...candidates,
    ...(activeChannel ? [activeChannel] : []),
  ]) {
    const login = normalizeChannelLogin(candidate)
    if (!isValidTwitchLogin(login) || seen.has(login)) {
      continue
    }
    seen.add(login)
    channels.push(login)
  }

  return { channels, activeChannel }
}

function parseVoiceProfiles(value: unknown): unknown[] {
  return readArray(value).map((profile) => {
    if (!isRecord(profile) || typeof profile.label !== "string") {
      return profile
    }
    return {
      ...profile,
      label: profile.label.slice(0, VOICE_PROFILE_LABEL_MAX_LENGTH),
    }
  })
}

function parseMessageLengths(
  playback: Record<string, unknown>,
  adjustments: string[]
): { minMessageLength?: number; maxMessageLength?: number } {
  const result: { minMessageLength?: number; maxMessageLength?: number } = {}

  const min = readFiniteNumber(playback.minMessageLength)
  if (min !== null) {
    const next = clamp(Math.round(min), 0, TTS_MIN_MESSAGE_LENGTH_MAX)
    if (min > TTS_MIN_MESSAGE_LENGTH_MAX) {
      adjustments.push(
        `Minimum message length was capped at ${TTS_MIN_MESSAGE_LENGTH_MAX} characters.`
      )
    }
    result.minMessageLength = next
  }

  const max = readFiniteNumber(playback.maxMessageLength)
  if (max !== null) {
    const next = clamp(
      Math.round(max),
      TTS_MAX_MESSAGE_LENGTH_MIN,
      TTS_MAX_MESSAGE_LENGTH_MAX
    )
    if (max < TTS_MAX_MESSAGE_LENGTH_MIN) {
      adjustments.push(
        `Maximum message length was raised to ${TTS_MAX_MESSAGE_LENGTH_MIN} characters.`
      )
    }
    result.maxMessageLength = next
  }

  return result
}

function parseTts(
  data: Record<string, unknown>,
  adjustments: string[]
): TtsConfig {
  const playback = readRecord(data.playback)

  if (playback.skipSubscribers === true) {
    adjustments.push(
      "Skipping subscriber messages isn't available in Peepochat, so subscribers will be read aloud."
    )
  }

  return normalizeTtsConfig({
    textTemplate: playback.textTemplate,
    queueMode: playback.queueMode,
    autoAssignVoices: playback.autoAssignVoices,
    defaultVoiceProfileId: playback.defaultVoiceProfileId,
    ...parseMessageLengths(playback, adjustments),
    maxQueueSize: playback.maxQueueSize,
    ignoreCommands: playback.ignoreCommands,
    skipBots: playback.skipBots,
    skipBroadcaster: playback.skipBroadcaster,
    skipModerators: playback.skipModerators,
    stripLinks: playback.stripLinks,
    stripMentions: playback.stripMentions,
    stripEmotes: playback.stripEmotes,
    blockedUsers: playback.blockedUsers,
    blockedTerms: playback.blockedTerms,
    wordReplacements: playback.wordReplacements,
    voiceProfiles: parseVoiceProfiles(data.voiceProfiles),
    soundEffects: data.soundEffects,
    commands: data.commands,
  })
}

function parseAssignments(
  value: unknown,
  tts: TtsConfig
): TtsVoiceAssignment[] {
  const profileIds = new Set(tts.voiceProfiles.map((profile) => profile.id))
  const entries = isRecord(value) ? Object.values(value) : readArray(value)
  const byUser = new Map<string, TtsVoiceAssignment>()
  const now = new Date().toISOString()

  for (const entry of entries) {
    if (!isRecord(entry)) {
      continue
    }
    const rawUserName = readNonEmptyString(entry.userName)
    const voiceProfileId = readNonEmptyString(entry.voiceProfileId)
    if (!rawUserName || !voiceProfileId || !profileIds.has(voiceProfileId)) {
      continue
    }
    const userName = normalizeLookupValue(rawUserName)
    if (!userName) {
      continue
    }
    byUser.set(userName, {
      userName,
      displayName: readNonEmptyString(entry.displayName) ?? rawUserName,
      voiceProfileId,
      createdAt: readNonEmptyString(entry.createdAt) ?? now,
      lastSeenAt: readNonEmptyString(entry.lastSeenAt) ?? now,
    })
  }

  return [...byUser.values()]
}

function isDecodableBase64(value: string): boolean {
  try {
    atob(value)
    return true
  } catch {
    return false
  }
}

function hasChatvoiceConfigShape(data: Record<string, unknown>): boolean {
  return (
    isRecord(data.twitch) &&
    isRecord(data.playback) &&
    readArray(data.voiceProfiles).some(
      (profile) => isRecord(profile) && readNonEmptyString(profile.id) !== null
    )
  )
}

function parseSoundEffectAudio(
  value: unknown,
  tts: TtsConfig,
  adjustments: string[]
): TtsSoundEffectAudioBackup[] {
  const soundNames = new Map(
    tts.soundEffects.map((sound) => [sound.id, sound.name])
  )
  const byId = new Map<string, TtsSoundEffectAudioBackup>()

  for (const entry of readArray(value)) {
    if (!isRecord(entry)) {
      continue
    }
    const id = readNonEmptyString(entry.id)
    const mimeType = readNonEmptyString(entry.mimeType)
    if (
      !id ||
      !mimeType ||
      !soundNames.has(id) ||
      typeof entry.data !== "string"
    ) {
      continue
    }
    if (!isDecodableBase64(entry.data)) {
      adjustments.push(
        `The audio for the "${soundNames.get(id)}" sound couldn't be read, so it was left out.`
      )
      continue
    }
    byId.set(id, {
      id,
      fileName: typeof entry.fileName === "string" ? entry.fileName : "",
      mimeType,
      data: entry.data,
    })
  }

  return [...byId.values()]
}

function parseMessageTimestampFormat(
  value: unknown
): MessageTimestampFormat | null {
  return MESSAGE_TIMESTAMP_FORMATS.find((format) => format === value) ?? null
}

function parseChatFontSize(value: unknown): number | null {
  const scale = readFiniteNumber(value)
  if (
    scale === null ||
    scale === CHATVOICE_DEFAULT_CHAT_SCALE ||
    scale < CHATVOICE_CHAT_SCALE_MIN ||
    scale > CHATVOICE_CHAT_SCALE_MAX
  ) {
    return null
  }
  return clamp(
    Math.round((CHAT_FONT_SIZE_DEFAULT * scale) / 100),
    CHAT_FONT_SIZE_MIN,
    CHAT_FONT_SIZE_MAX
  )
}

export function parseChatvoiceBackup(payload: string): ChatvoiceImport {
  const parsed = parseJson(payload)
  const source = getBackupSourceApp(parsed)

  if (source === "peepochat") {
    throw new Error(
      "This is a Peepochat backup. Use Restore backup to load it instead."
    )
  }
  if (
    source !== "chatvoice" ||
    !isRecord(parsed) ||
    !isRecord(parsed.data) ||
    !hasChatvoiceConfigShape(parsed.data)
  ) {
    throw new Error(
      "This file isn't a Chatvoice backup. In Chatvoice, open Settings > Backup and export a new one."
    )
  }

  const data = parsed.data
  const playback = readRecord(data.playback)
  const adjustments: string[] = []
  const tts = parseTts(data, adjustments)

  return {
    appVersion: readNonEmptyString(parsed.appVersion),
    exportedAt: readNonEmptyString(parsed.exportedAt),
    ...parseChannels(readRecord(data.twitch)),
    tts,
    assignments: parseAssignments(data.assignments, tts),
    soundEffectAudio: parseSoundEffectAudio(
      parsed.soundEffects,
      tts,
      adjustments
    ),
    messageTimestampFormat: parseMessageTimestampFormat(
      playback.messageTimestampFormat
    ),
    chatFontSizePx: parseChatFontSize(playback.chatScale),
    adjustments,
  }
}

export function getNewChatvoiceChannels(
  config: AppConfig,
  imported: ChatvoiceImport
): string[] {
  const existing = new Set(
    config.twitch.channels.map((channel) => channel.login)
  )
  return imported.channels.filter((login) => !existing.has(login))
}

export function applyChatvoiceImport(
  config: AppConfig,
  imported: ChatvoiceImport,
  profiles: ReadonlyMap<string, ChannelProfile> = new Map()
): AppConfig {
  const defaults = createDefaultConfig()
  const addedChannels = getNewChatvoiceChannels(config, imported).map((login) =>
    createTwitchChannel(login, profiles.get(login))
  )
  const activeChannelLogin =
    config.twitch.activeChannelLogin ||
    imported.activeChannel ||
    imported.channels[0] ||
    ""

  const keepsDefaultTimestamps =
    config.chat.messageTimestampFormat === defaults.chat.messageTimestampFormat
  const keepsDefaultFontSize =
    config.chat.fontSizePx === defaults.chat.fontSizePx

  return normalizeConfig({
    ...config,
    twitch: {
      ...config.twitch,
      channels: [...config.twitch.channels, ...addedChannels],
      activeChannelLogin,
    },
    chat: {
      ...config.chat,
      messageTimestampFormat:
        imported.messageTimestampFormat && keepsDefaultTimestamps
          ? imported.messageTimestampFormat
          : config.chat.messageTimestampFormat,
      fontSizePx:
        imported.chatFontSizePx !== null && keepsDefaultFontSize
          ? imported.chatFontSizePx
          : config.chat.fontSizePx,
    },
    tts: imported.tts,
  })
}

export async function fetchChannelProfiles(
  logins: string[],
  account: TwitchAccount | null
): Promise<Map<string, ChannelProfile>> {
  const profiles = new Map<string, ChannelProfile>()
  if (!account?.accessToken || logins.length === 0) {
    return profiles
  }

  for (let index = 0; index < logins.length; index += TWITCH_USERS_BATCH_SIZE) {
    const batch = logins.slice(index, index + TWITCH_USERS_BATCH_SIZE)
    try {
      const users = await fetchTwitchUsersByLogin(
        batch,
        account.accessToken,
        account.clientId
      )
      for (const user of users) {
        profiles.set(user.login.toLowerCase(), {
          displayName: user.displayName,
          profileImageUrl: user.profileImageUrl,
        })
      }
    } catch {
      continue
    }
  }

  return profiles
}

export type ChatvoiceImportSummary = {
  channelCount: number
  voiceProfileCount: number
  assignmentCount: number
  soundEffectCount: number
  soundEffectAudioCount: number
  wordReplacementCount: number
  blockedUserCount: number
  blockedTermCount: number
  enabledCommandCount: number
}

export function summarizeChatvoiceImport(
  imported: ChatvoiceImport
): ChatvoiceImportSummary {
  const { tts } = imported
  const commands = [
    tts.commands.queue,
    tts.commands.playback,
    tts.commands.skip,
    tts.commands.clear,
    tts.commands.newVoice,
  ]

  return {
    channelCount: imported.channels.length,
    voiceProfileCount: tts.voiceProfiles.length,
    assignmentCount: imported.assignments.length,
    soundEffectCount: tts.soundEffects.length,
    soundEffectAudioCount: imported.soundEffectAudio.length,
    wordReplacementCount: tts.wordReplacements.length,
    blockedUserCount: tts.blockedUsers.length,
    blockedTermCount: tts.blockedTerms.length,
    enabledCommandCount: commands.filter((command) => command.enabled).length,
  }
}
