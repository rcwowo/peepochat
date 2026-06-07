import { z } from "zod"

import { migrateChatFontFamilyInput } from "@/lib/chat/chat-fonts"
import {
  createDefaultSplitLayout,
  normalizeSplitLayout,
  type ChatSplitLayoutChild,
  type ChatSplitLayoutNode,
} from "@/lib/chat/chat-split-layout"
import { normalizeSidebarOrder } from "@/lib/sidebar/sidebar-order"

export const PEEPOCHAT_STORAGE_KEY = "peepochat::config"
export const PEEPOCHAT_SCHEMA_VERSION = 8

export const LIVE_MESSAGES_PER_CHANNEL_MIN = 20
export const LIVE_MESSAGES_PER_CHANNEL_MAX = 500
export const LIVE_MESSAGES_PER_CHANNEL_DEFAULT = 60
export const CHAT_FONT_SIZE_MIN = 10
export const CHAT_FONT_SIZE_MAX = 24
export const CHAT_FONT_SIZE_DEFAULT = 13
export const CHAT_EMOTE_SCALE_MIN = 10
export const CHAT_EMOTE_SCALE_MAX = 24
export const CHAT_EMOTE_SCALE_DEFAULT = 13
export const PEEPOCHAT_APP_VERSION: string = __APP_VERSION__

const messageTimestampFormatSchema = z
  .enum(["24-hour", "12-hour", "12-hour-meridiem", "none"])
  .default("24-hour")

const chatFontFamilySchema = z.string().max(200).default("")

const chatEmotesSchema = z.object({
  bttvEnabled: z.boolean().default(true),
  ffzEnabled: z.boolean().default(true),
  seventvEnabled: z.boolean().default(true),
})

const messageQuickActionsSchema = z.object({
  copyEnabled: z.boolean().default(true),
  replyEnabled: z.boolean().default(true),
})

const chatSchema = z.object({
  messageTimestampFormat: messageTimestampFormatSchema,
  recentMessagesEnabled: z.boolean().default(true),
  keepChatViewsMounted: z.boolean().default(true),
  alternatingRowBackgrounds: z.boolean().default(false),
  messageSeparators: z.boolean().default(false),
  fontFamily: chatFontFamilySchema,
  fontSizePx: z
    .number()
    .int()
    .min(CHAT_FONT_SIZE_MIN)
    .max(CHAT_FONT_SIZE_MAX)
    .default(CHAT_FONT_SIZE_DEFAULT),
  emoteScale: z
    .number()
    .int()
    .min(CHAT_EMOTE_SCALE_MIN)
    .max(CHAT_EMOTE_SCALE_MAX)
    .default(CHAT_EMOTE_SCALE_DEFAULT),
  linkEmoteScaleToFontSize: z.boolean().default(true),
  maxLiveMessagesPerChannel: z
    .number()
    .int()
    .min(LIVE_MESSAGES_PER_CHANNEL_MIN)
    .max(LIVE_MESSAGES_PER_CHANNEL_MAX)
    .default(LIVE_MESSAGES_PER_CHANNEL_DEFAULT),
  messageQuickActions: messageQuickActionsSchema,
  emotes: chatEmotesSchema,
})

const highlightPingRuleSchema = z.object({
  id: z.string().min(1),
  pattern: z.string().max(500),
  enabled: z.boolean().default(true),
  notify: z.boolean().default(true),
})

const highlightsSchema = z.object({
  unreadIndicatorsEnabled: z.boolean().default(true),
  liveIndicatorsEnabled: z.boolean().default(true),
  livePushNotificationsEnabled: z.boolean().default(false),
  pingPushNotificationsEnabled: z.boolean().default(true),
  pings: z.array(highlightPingRuleSchema).default([]),
})

const chatSplitLayoutNodeSchema: z.ZodType<ChatSplitLayoutNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("pane"),
      channel: z.string(),
    }),
    z.object({
      type: z.literal("split"),
      direction: z.enum(["row", "column"]),
      children: z.array(chatSplitLayoutChildSchema),
    }),
  ])
)

const chatSplitLayoutChildSchema: z.ZodType<ChatSplitLayoutChild> = z.object({
  node: chatSplitLayoutNodeSchema,
  size: z.number(),
})

const chatSplitSchema = z.object({
  id: z.string().min(1),
  channels: z.array(z.string()),
  unreadIndicatorEnabled: z.boolean().nullable().default(null),
  layout: chatSplitLayoutNodeSchema.optional(),
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
  unreadIndicatorEnabled: z.boolean().nullable().default(null),
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
  highlights: highlightsSchema.default({
    unreadIndicatorsEnabled: true,
    liveIndicatorsEnabled: true,
    livePushNotificationsEnabled: false,
    pingPushNotificationsEnabled: true,
    pings: [],
  }),
})

const backupEnvelopeSchema = z.object({
  app: z.literal("peepochat"),
  appVersion: z.string().min(1),
  exportedAt: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  data: z.unknown(),
})

export type HighlightPingRule = z.infer<typeof highlightPingRuleSchema>
export type HighlightsConfig = z.infer<typeof highlightsSchema>
export type MessageTimestampFormat = z.infer<typeof messageTimestampFormatSchema>
export type ChatFontFamilySetting = z.infer<typeof chatFontFamilySchema>
export type ChatEmotesConfig = z.infer<typeof chatEmotesSchema>
export type MessageQuickActionsConfig = z.infer<typeof messageQuickActionsSchema>
export type ChatSplit = z.infer<typeof chatSplitSchema>
export type {
  ChatSplitLayoutChild,
  ChatSplitLayoutNode,
  SplitLayoutDirection,
  SplitLayoutEdge,
} from "@/lib/chat/chat-split-layout"
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
      alternatingRowBackgrounds: false,
      messageSeparators: false,
      fontFamily: "",
      fontSizePx: CHAT_FONT_SIZE_DEFAULT,
      emoteScale: CHAT_EMOTE_SCALE_DEFAULT,
      linkEmoteScaleToFontSize: true,
      maxLiveMessagesPerChannel: LIVE_MESSAGES_PER_CHANNEL_DEFAULT,
      messageQuickActions: {
        copyEnabled: true,
        replyEnabled: true,
      },
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
    highlights: {
      unreadIndicatorsEnabled: true,
      liveIndicatorsEnabled: true,
      livePushNotificationsEnabled: false,
      pingPushNotificationsEnabled: true,
      pings: [],
    },
  }
}

export function isUnreadIndicatorEnabledForChannel(
  config: AppConfig,
  login: string
): boolean {
  const globalEnabled = config.highlights.unreadIndicatorsEnabled
  const channel = config.twitch.channels.find((c) => c.login === login)
  if (channel?.unreadIndicatorEnabled !== null && channel?.unreadIndicatorEnabled !== undefined) {
    return channel.unreadIndicatorEnabled
  }
  return globalEnabled
}

export function isUnreadIndicatorEnabledForSplit(
  config: AppConfig,
  splitId: string
): boolean {
  const globalEnabled = config.highlights.unreadIndicatorsEnabled
  const split = config.layout.splits.find((s) => s.id === splitId)
  if (split?.unreadIndicatorEnabled !== null && split?.unreadIndicatorEnabled !== undefined) {
    return split.unreadIndicatorEnabled
  }
  return globalEnabled
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

export function createTwitchChannel(
  login: string,
  partial?: Omit<TwitchChannel, "login" | "unreadIndicatorEnabled">
): TwitchChannel {
  return {
    login: login.trim().replace(/^#/, "").toLowerCase(),
    unreadIndicatorEnabled: null,
    ...partial,
  }
}

export function createChatSplit(
  channels: string[],
  id = createSplitId()
): ChatSplit {
  const normalizedChannels = normalizeSplitChannels(channels)
  return {
    id,
    channels: normalizedChannels,
    unreadIndicatorEnabled: null,
    layout: createDefaultSplitLayout(normalizedChannels),
  }
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
      unreadIndicatorEnabled:
        channel.unreadIndicatorEnabled === true ||
        channel.unreadIndicatorEnabled === false
          ? channel.unreadIndicatorEnabled
          : null,
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
      createTwitchChannel(twitch.activeChannelLogin),
    ]
  }

  const coerced = coerceLayoutShape(config.layout)
  const splits = coerced.splits
    .map((split) => ({
      id: split.id.trim(),
      channels: normalizeSplitChannels(split.channels),
      unreadIndicatorEnabled:
        split.unreadIndicatorEnabled === true ||
        split.unreadIndicatorEnabled === false
          ? split.unreadIndicatorEnabled
          : null,
      layout: normalizeSplitLayout(split.layout, split.channels),
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

  const chat = {
    ...config.chat,
    fontFamily: migrateChatFontFamilyInput(config.chat.fontFamily),
  }

  if (chat.linkEmoteScaleToFontSize) {
    chat.emoteScale = chat.fontSizePx
  }

  const highlights = {
    ...createDefaultConfig().highlights,
    ...config.highlights,
    pings: (config.highlights?.pings ?? []).map((rule) => ({
      id: rule.id.trim(),
      pattern: rule.pattern,
      enabled: rule.enabled ?? true,
      notify: rule.notify ?? true,
    })),
  }

  return {
    ...config,
    updatedAt: config.updatedAt || new Date().toISOString(),
    schemaVersion: PEEPOCHAT_SCHEMA_VERSION,
    twitch,
    chat,
    highlights,
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
