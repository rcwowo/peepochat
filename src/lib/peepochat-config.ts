import { z } from "zod"

import { normalizeSidebarOrder } from "@/lib/sidebar-order"

export const PEEPOCHAT_STORAGE_KEY = "peepochat::config"
export const PEEPOCHAT_SCHEMA_VERSION = 4
export const PEEPOCHAT_APP_VERSION: string = __APP_VERSION__

const messageTimestampFormatSchema = z
  .enum(["24-hour", "12-hour", "12-hour-meridiem", "none"])
  .default("24-hour")

const chatFontFamilySchema = z.enum(["default", "mono"]).default("default")

const chatEmotesSchema = z.object({
  bttvEnabled: z.boolean().default(true),
  ffzEnabled: z.boolean().default(true),
  seventvEnabled: z.boolean().default(true),
})

const chatSchema = z.object({
  messageTimestampFormat: messageTimestampFormatSchema,
  recentMessagesEnabled: z.boolean().default(true),
  keepChatViewsMounted: z.boolean().default(true),
  fontFamily: chatFontFamilySchema,
  fontSizePx: z.number().int().min(12).max(20).default(13),
  emotes: chatEmotesSchema,
})

const chatSplitSchema = z.object({
  id: z.string().min(1),
  channels: z.array(z.string()),
})

const chatLayoutSchema = z.object({
  activeSplitId: z.string().nullable(),
  splits: z.array(chatSplitSchema),
  sidebarOrder: z.array(z.string()).optional(),
})

export const twitchAccountSchema = z.object({
  id: z.string(),
  login: z.string(),
  displayName: z.string(),
  profileImageUrl: z.string(),
  bannerImageUrl: z.string(),
  accessToken: z.string(),
  clientId: z.string(),
})

export const twitchChannelSchema = z.object({
  login: z.string(),
  displayName: z.string().optional(),
  profileImageUrl: z.string().optional(),
})

const twitchSchema = z.object({
  account: twitchAccountSchema.nullable(),
  channels: z.array(twitchChannelSchema),
  activeChannelLogin: z.string(),
})

const appConfigSchema = z.object({
  schemaVersion: z.literal(PEEPOCHAT_SCHEMA_VERSION),
  updatedAt: z.string().min(1),
  twitch: twitchSchema,
  chat: chatSchema,
  layout: chatLayoutSchema,
})

const backupEnvelopeSchema = z.object({
  app: z.literal("peepochat"),
  appVersion: z.string().min(1),
  exportedAt: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  data: z.unknown(),
})

export type MessageTimestampFormat = z.infer<typeof messageTimestampFormatSchema>
export type ChatFontFamily = z.infer<typeof chatFontFamilySchema>
export type ChatEmotesConfig = z.infer<typeof chatEmotesSchema>
export type ChatSplit = z.infer<typeof chatSplitSchema>
export type ChatLayoutConfig = z.infer<typeof chatLayoutSchema>
export type ChatConfig = z.infer<typeof chatSchema>
export type TwitchAccount = z.infer<typeof twitchAccountSchema>
export type TwitchChannel = z.infer<typeof twitchChannelSchema>
export type TwitchConfig = z.infer<typeof twitchSchema>
export type AppConfig = z.infer<typeof appConfigSchema>
export type BackupEnvelope = z.infer<typeof backupEnvelopeSchema>
export type TwitchAccountBackup = Omit<TwitchAccount, "accessToken" | "clientId">
export type AppConfigBackup = Omit<AppConfig, "twitch"> & {
  twitch: Omit<TwitchConfig, "account"> & {
    account: TwitchAccountBackup | null
  }
}

export function createDefaultConfig(): AppConfig {
  return {
    schemaVersion: PEEPOCHAT_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    twitch: {
      account: null,
      channels: [],
      activeChannelLogin: "",
    },
    chat: {
      messageTimestampFormat: "24-hour",
      recentMessagesEnabled: true,
      keepChatViewsMounted: true,
      fontFamily: "default",
      fontSizePx: 13,
      emotes: {
        bttvEnabled: true,
        ffzEnabled: true,
        seventvEnabled: true,
      },
    },
    layout: {
      activeSplitId: null,
      splits: [],
      sidebarOrder: [],
    },
  }
}

export function getChatLayout(config: AppConfig): ChatLayoutConfig {
  return config.layout
}

export function normalizeSplitChannels(channels: string[]): string[] {
  return [
    ...new Set(
      channels.map((login) => login.trim().replace(/^#/, "").toLowerCase())
    ),
  ].filter(Boolean)
}

export function createSplitId() {
  return `split-${crypto.randomUUID()}`
}

export function splitChannelsKey(channels: string[]) {
  return normalizeSplitChannels(channels).sort().join("\0")
}

export function findSplitByChannels(
  splits: ChatSplit[],
  channels: string[]
): ChatSplit | undefined {
  const key = splitChannelsKey(channels)
  return splits.find((split) => splitChannelsKey(split.channels) === key)
}

export function getChannelsUsedInSplits(splits: ChatSplit[]): Set<string> {
  const used = new Set<string>()
  for (const split of splits) {
    for (const login of normalizeSplitChannels(split.channels)) {
      used.add(login)
    }
  }
  return used
}

export function getActiveSplit(config: AppConfig): ChatSplit | null {
  const { activeSplitId, splits } = config.layout
  if (!activeSplitId) {
    return null
  }

  return splits.find((split) => split.id === activeSplitId) ?? null
}

export function getActiveSplitChannels(config: AppConfig): string[] {
  const split = getActiveSplit(config)
  if (!split) {
    return []
  }

  return normalizeSplitChannels(split.channels)
}

export function isSplitViewActive(config: AppConfig): boolean {
  return getActiveSplitChannels(config).length >= 2
}

function coerceLayoutShape(input: unknown): ChatLayoutConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return createDefaultConfig().layout
  }

  const layout = input as Record<string, unknown>

  if (!Array.isArray(layout.splits)) {
    return createDefaultConfig().layout
  }

  return {
    activeSplitId:
      typeof layout.activeSplitId === "string" ? layout.activeSplitId : null,
    splits: layout.splits as ChatSplit[],
    sidebarOrder: Array.isArray(layout.sidebarOrder)
      ? (layout.sidebarOrder as string[])
      : [],
  }
}

export function getAccount(config: AppConfig): TwitchAccount | null {
  return config.twitch.account
}

export function getActiveChannelLogin(config: AppConfig): string {
  return config.twitch.activeChannelLogin.trim().replace(/^#/, "").toLowerCase()
}

export function hasStoredConfig(): boolean {
  if (typeof window === "undefined") return false
  return window.localStorage.getItem(PEEPOCHAT_STORAGE_KEY) !== null
}

export function hasAccount(config: AppConfig): boolean {
  return config.twitch.account !== null
}

/** True while login or at least one channel is still required. */
export function needsOnboardingForConfig(config: AppConfig): boolean {
  return !hasAccount(config) || config.twitch.channels.length === 0
}

export function loadConfig(): AppConfig {
  if (typeof window === "undefined") {
    return createDefaultConfig()
  }

  const raw = window.localStorage.getItem(PEEPOCHAT_STORAGE_KEY)
  if (!raw) {
    return createDefaultConfig()
  }

  try {
    return parseConfig(JSON.parse(raw))
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
  window.localStorage.setItem(PEEPOCHAT_STORAGE_KEY, JSON.stringify(normalized))
}

export function exportConfigBackup(config: AppConfig): string {
  const envelope: BackupEnvelope = {
    app: "peepochat",
    appVersion: PEEPOCHAT_APP_VERSION,
    exportedAt: new Date().toISOString(),
    schemaVersion: PEEPOCHAT_SCHEMA_VERSION,
    data: sanitizeConfigForExport(normalizeConfig(config)),
  }

  return JSON.stringify(envelope, null, 2)
}

export function importConfigBackup(payload: string): AppConfig {
  const parsed = JSON.parse(payload)
  return parseConfig(parsed)
}

/** Keep an active session when restoring a backup for the same Twitch account. */
export function mergeRestoredConfig(
  restored: AppConfig,
  existing: AppConfig,
  envClientId = ""
): AppConfig {
  const restoredAccount = restored.twitch.account
  if (!restoredAccount) {
    return restored
  }

  const existingAccount = existing.twitch.account
  const sameAccount =
    existingAccount !== null && existingAccount.id === restoredAccount.id

  const accessToken =
    restoredAccount.accessToken.trim() ||
    (sameAccount ? existingAccount.accessToken : "")
  const clientId =
    restoredAccount.clientId.trim() ||
    (sameAccount ? existingAccount.clientId : "") ||
    envClientId

  return normalizeConfig({
    ...restored,
    twitch: {
      ...restored.twitch,
      account: {
        ...restoredAccount,
        accessToken,
        clientId,
      },
    },
  })
}

function parseConfig(input: unknown): AppConfig {
  const envelopeResult = backupEnvelopeSchema.safeParse(input)
  if (envelopeResult.success) {
    return parseConfig(envelopeResult.data.data)
  }

  const object = input as Record<string, unknown>

  return normalizeConfig(
    appConfigSchema.parse({
      ...coerceConfigCredentials(object),
      layout: coerceLayoutShape(object.layout),
      schemaVersion: PEEPOCHAT_SCHEMA_VERSION,
    })
  )
}

function coerceConfigCredentials(
  input: Record<string, unknown>
): Record<string, unknown> {
  const twitch = input.twitch
  if (!twitch || typeof twitch !== "object") {
    return input
  }

  const twitchRecord = twitch as Record<string, unknown>
  const account = twitchRecord.account
  if (!account || typeof account !== "object") {
    return input
  }

  const accountRecord = account as Record<string, unknown>
  return {
    ...input,
    twitch: {
      ...twitchRecord,
      account: {
        ...accountRecord,
        accessToken:
          typeof accountRecord.accessToken === "string"
            ? accountRecord.accessToken
            : "",
        clientId:
          typeof accountRecord.clientId === "string"
            ? accountRecord.clientId
            : "",
      },
    },
  }
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
  const twitch = {
    ...config.twitch,
    activeChannelLogin: config.twitch.activeChannelLogin
      .trim()
      .replace(/^#/, "")
      .toLowerCase(),
    channels: config.twitch.channels.map((channel) => ({
      ...channel,
      login: channel.login.trim().replace(/^#/, "").toLowerCase(),
    })),
    account: config.twitch.account
      ? {
          ...config.twitch.account,
          bannerImageUrl: config.twitch.account.bannerImageUrl ?? "",
        }
      : null,
  }

  if (
    twitch.activeChannelLogin &&
    !twitch.channels.some(
      (channel) => channel.login === twitch.activeChannelLogin
    )
  ) {
    twitch.channels = [
      ...twitch.channels,
      { login: twitch.activeChannelLogin },
    ]
  }

  const coerced = coerceLayoutShape(config.layout)
  const splits = coerced.splits
    .map((split) => ({
      id: split.id.trim(),
      channels: normalizeSplitChannels(split.channels),
    }))
    .filter((split) => split.id && split.channels.length >= 2)

  let activeSplitId = coerced.activeSplitId
  if (activeSplitId && !splits.some((split) => split.id === activeSplitId)) {
    activeSplitId = null
  }

  const layoutBase = {
    activeSplitId,
    splits,
    sidebarOrder: coerced.sidebarOrder ?? [],
  }

  const normalizedLayout = normalizeSidebarOrder({
    ...config,
    twitch,
    layout: layoutBase,
  })

  return {
    ...config,
    updatedAt: config.updatedAt || new Date().toISOString(),
    schemaVersion: PEEPOCHAT_SCHEMA_VERSION,
    twitch,
    layout: {
      activeSplitId,
      splits,
      sidebarOrder: normalizedLayout,
    },
  }
}

function sanitizeConfigForExport(config: AppConfig): AppConfigBackup {
  const account = config.twitch.account
  if (!account) {
    return config
  }

  const { accessToken: _accessToken, clientId: _clientId, ...accountExport } =
    account

  return {
    ...config,
    twitch: {
      ...config.twitch,
      account: accountExport,
    },
  }
}
