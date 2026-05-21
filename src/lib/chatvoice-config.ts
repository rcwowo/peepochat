import { z } from "zod"

export const CHATVOICE_STORAGE_KEY = "chatvoice::config"
export const CHATVOICE_SCHEMA_VERSION = 2
export const CHATVOICE_APP_VERSION: string = __APP_VERSION__

const messageTimestampFormatSchema = z
  .enum(["24-hour", "12-hour", "12-hour-meridiem", "none"])
  .default("24-hour")

const chatSchema = z.object({
  messageTimestampFormat: messageTimestampFormatSchema,
})

const twitchSchema = z.object({
  channel: z.string(),
  clientId: z.string(),
  accessToken: z.string(),
  readOnly: z.boolean(),
  autoConnect: z.boolean(),
})

const appConfigSchema = z.object({
  schemaVersion: z.literal(CHATVOICE_SCHEMA_VERSION),
  updatedAt: z.string().min(1),
  twitch: twitchSchema,
  chat: chatSchema,
})

const backupEnvelopeSchema = z.object({
  app: z.enum(["chatvoice", "peepochat"]),
  appVersion: z.string().min(1),
  exportedAt: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  data: z.unknown(),
})

export type MessageTimestampFormat = z.infer<typeof messageTimestampFormatSchema>
export type ChatConfig = z.infer<typeof chatSchema>
export type TwitchConfig = z.infer<typeof twitchSchema>
export type AppConfig = z.infer<typeof appConfigSchema>
export type BackupEnvelope = z.infer<typeof backupEnvelopeSchema>

export function createDefaultConfig(): AppConfig {
  return {
    schemaVersion: CHATVOICE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    twitch: {
      channel: "",
      clientId: "",
      accessToken: "",
      readOnly: true,
      autoConnect: true,
    },
    chat: {
      messageTimestampFormat: "24-hour",
    },
  }
}

export function hasStoredConfig(): boolean {
  if (typeof window === "undefined") return false
  return window.localStorage.getItem(CHATVOICE_STORAGE_KEY) !== null
}

export function loadConfig(): AppConfig {
  if (typeof window === "undefined") {
    return createDefaultConfig()
  }

  const raw = window.localStorage.getItem(CHATVOICE_STORAGE_KEY)
  if (!raw) {
    return createDefaultConfig()
  }

  try {
    return migrateConfig(JSON.parse(raw))
  } catch {
    return createDefaultConfig()
  }
}

export function saveConfig(config: AppConfig) {
  if (typeof window === "undefined") {
    return
  }

  const normalized = normalizeConfig({
    ...config,
    updatedAt: new Date().toISOString(),
  })
  window.localStorage.setItem(CHATVOICE_STORAGE_KEY, JSON.stringify(normalized))
}

export function exportConfigBackup(config: AppConfig): string {
  const envelope: BackupEnvelope = {
    app: "peepochat",
    appVersion: CHATVOICE_APP_VERSION,
    exportedAt: new Date().toISOString(),
    schemaVersion: CHATVOICE_SCHEMA_VERSION,
    data: normalizeConfig(config),
  }

  return JSON.stringify(envelope, null, 2)
}

export function importConfigBackup(payload: string): AppConfig {
  const parsed = JSON.parse(payload)
  return migrateConfig(parsed)
}

export function migrateConfig(input: unknown): AppConfig {
  const envelopeResult = backupEnvelopeSchema.safeParse(input)
  if (envelopeResult.success) {
    return migrateConfig(envelopeResult.data.data)
  }

  const object = input as Record<string, unknown>

  if (
    object &&
    typeof object === "object" &&
    !Array.isArray(object) &&
    !("schemaVersion" in object)
  ) {
    return migrateConfig({
      ...createDefaultConfig(),
      ...object,
      twitch: {
        ...createDefaultConfig().twitch,
        ...(typeof object.twitch === "object" && object.twitch
          ? object.twitch
          : {}),
      },
      schemaVersion: CHATVOICE_SCHEMA_VERSION,
    })
  }

  const schemaVersion =
    typeof object?.schemaVersion === "number" ? object.schemaVersion : 1

  if (schemaVersion < CHATVOICE_SCHEMA_VERSION) {
    return migrateFromLegacyConfig(object)
  }

  return normalizeConfig(appConfigSchema.parse(input))
}

function migrateFromLegacyConfig(input: Record<string, unknown>): AppConfig {
  const defaults = createDefaultConfig()
  const playback =
    typeof input.playback === "object" && input.playback
      ? (input.playback as Record<string, unknown>)
      : {}

  const messageTimestampFormat = messageTimestampFormatSchema.safeParse(
    playback.messageTimestampFormat
  )

  return normalizeConfig(
    appConfigSchema.parse({
      schemaVersion: CHATVOICE_SCHEMA_VERSION,
      updatedAt:
        typeof input.updatedAt === "string"
          ? input.updatedAt
          : defaults.updatedAt,
      twitch: {
        ...defaults.twitch,
        ...(typeof input.twitch === "object" && input.twitch
          ? (input.twitch as Record<string, unknown>)
          : {}),
      },
      chat: {
        messageTimestampFormat: messageTimestampFormat.success
          ? messageTimestampFormat.data
          : defaults.chat.messageTimestampFormat,
      },
    })
  )
}

const MESSAGE_URL_PATTERN = /https?:\/\/\S+/g

export type MessageUrlMatch = {
  url: string
  start: number
  end: number
}

export function findMessageUrls(text: string): MessageUrlMatch[] {
  return Array.from(text.matchAll(MESSAGE_URL_PATTERN), (match) => {
    const url = match[0]
    const start = match.index ?? 0

    return {
      url,
      start,
      end: start + url.length,
    }
  })
}

function normalizeConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    updatedAt: config.updatedAt || new Date().toISOString(),
    schemaVersion: CHATVOICE_SCHEMA_VERSION,
  }
}
