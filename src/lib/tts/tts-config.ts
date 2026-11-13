import { z } from "zod"

import {
  normalizeSoundEffectName,
  uniqueSoundEffectName,
} from "@/lib/tts/sound-effect-name"

export const TTS_MIN_MESSAGE_LENGTH_MAX = 50
export const TTS_MAX_MESSAGE_LENGTH_MIN = 20
export const TTS_MAX_MESSAGE_LENGTH_MAX = 500
export const TTS_QUEUE_SIZE_MIN = 1
export const TTS_QUEUE_SIZE_MAX = 50
export const TTS_VOICE_PARAM_MIN = -100
export const TTS_VOICE_PARAM_MAX = 100
export const TTS_DEFAULT_TEMPLATE = "{user} says {message}"
export const TTS_PREVIEW_TEXT =
  "Hello chat. This is Peepochat testing a saved voice profile."

export const ttsCommandRoleSchema = z.enum([
  "broadcaster",
  "moderator",
  "vip",
  "subscriber",
  "everyone",
])

function lenientArray<T extends z.ZodType>(schema: T) {
  return z
    .array(z.unknown())
    .catch([])
    .transform((items) =>
      items.flatMap((item) => {
        const result = schema.safeParse(item)
        return result.success ? [result.data as z.output<T>] : []
      })
    )
}

const stringListSchema = lenientArray(z.string())

const voiceParamSchema = z
  .number()
  .min(TTS_VOICE_PARAM_MIN)
  .max(TTS_VOICE_PARAM_MAX)
  .catch(0)

const ttsVoiceProfileSchema = z.object({
  id: z.string().min(1),
  label: z.string().max(80).catch(""),
  voice: z.string().catch(""),
  rate: voiceParamSchema,
  pitch: voiceParamSchema,
  volume: voiceParamSchema,
  enabled: z.boolean().catch(true),
})

const ttsWordReplacementSchema = z.object({
  id: z.string().min(1),
  from: z.string().catch(""),
  to: z.string().catch(""),
  enabled: z.boolean().catch(true),
})

const ttsSoundEffectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  enabled: z.boolean().catch(true),
  minRole: ttsCommandRoleSchema.catch("everyone"),
  volume: z.number().min(0).max(1).catch(1),
})

const ttsCommandSettingSchema = z.object({
  enabled: z.boolean().catch(false),
  minRole: ttsCommandRoleSchema.catch("moderator"),
})

const DEFAULT_MOD_COMMAND = { enabled: false, minRole: "moderator" as const }
const DEFAULT_EVERYONE_COMMAND = {
  enabled: false,
  minRole: "everyone" as const,
}

const ttsCommandsSchema = z.object({
  whitelist: stringListSchema,
  queue: ttsCommandSettingSchema.catch(DEFAULT_MOD_COMMAND),
  playback: ttsCommandSettingSchema.catch(DEFAULT_MOD_COMMAND),
  skip: ttsCommandSettingSchema.catch(DEFAULT_MOD_COMMAND),
  clear: ttsCommandSettingSchema.catch(DEFAULT_MOD_COMMAND),
  newVoice: ttsCommandSettingSchema.catch(DEFAULT_EVERYONE_COMMAND),
})

const ttsQueueModeSchema = z.enum(["small-chat", "big-chat"])

export const ttsConfigSchema = z.object({
  resumeOnStartup: z.boolean().catch(false),
  textTemplate: z.string().catch(TTS_DEFAULT_TEMPLATE),
  queueMode: ttsQueueModeSchema.catch("small-chat"),
  autoAssignVoices: z.boolean().catch(true),
  defaultVoiceProfileId: z.string().catch(""),
  minMessageLength: z
    .number()
    .int()
    .min(0)
    .max(TTS_MIN_MESSAGE_LENGTH_MAX)
    .catch(1),
  maxMessageLength: z
    .number()
    .int()
    .min(TTS_MAX_MESSAGE_LENGTH_MIN)
    .max(TTS_MAX_MESSAGE_LENGTH_MAX)
    .catch(220),
  maxQueueSize: z
    .number()
    .int()
    .min(TTS_QUEUE_SIZE_MIN)
    .max(TTS_QUEUE_SIZE_MAX)
    .catch(10),
  ignoreCommands: z.boolean().catch(true),
  skipBots: z.boolean().catch(true),
  skipBroadcaster: z.boolean().catch(false),
  skipModerators: z.boolean().catch(false),
  subscribersOnly: z.boolean().catch(false),
  stripLinks: z.boolean().catch(true),
  stripMentions: z.boolean().catch(false),
  stripEmotes: z.boolean().catch(false),
  blockedUsers: stringListSchema,
  blockedTerms: stringListSchema,
  wordReplacements: lenientArray(ttsWordReplacementSchema),
  voiceProfiles: lenientArray(ttsVoiceProfileSchema),
  soundEffects: lenientArray(ttsSoundEffectSchema),
  commands: ttsCommandsSchema.catch(() => createDefaultTtsCommands()),
})

export type TtsCommandRole = z.infer<typeof ttsCommandRoleSchema>
export type TtsVoiceProfile = z.output<typeof ttsVoiceProfileSchema>
export type TtsWordReplacement = z.output<typeof ttsWordReplacementSchema>
export type TtsSoundEffect = z.output<typeof ttsSoundEffectSchema>
export type TtsCommandSetting = z.output<typeof ttsCommandSettingSchema>
export type TtsCommandsConfig = z.output<typeof ttsCommandsSchema>
export type TtsCommandId = Exclude<keyof TtsCommandsConfig, "whitelist">
export type TtsQueueMode = z.infer<typeof ttsQueueModeSchema>
export type TtsConfig = z.output<typeof ttsConfigSchema>

export type TtsVoiceAssignment = {
  userName: string
  displayName: string
  voiceProfileId: string
  createdAt: string
  lastSeenAt: string
}

export const TTS_COMMAND_ROLE_OPTIONS: {
  value: TtsCommandRole
  label: string
}[] = [
  { value: "broadcaster", label: "Broadcaster" },
  { value: "moderator", label: "Moderators" },
  { value: "vip", label: "VIPs" },
  { value: "subscriber", label: "Subscribers" },
  { value: "everyone", label: "Everyone" },
]

export function createTtsId(prefix: string): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createDefaultTtsCommands(): TtsCommandsConfig {
  return {
    whitelist: [],
    queue: { ...DEFAULT_MOD_COMMAND },
    playback: { ...DEFAULT_MOD_COMMAND },
    skip: { ...DEFAULT_MOD_COMMAND },
    clear: { ...DEFAULT_MOD_COMMAND },
    newVoice: { ...DEFAULT_EVERYONE_COMMAND },
  }
}

function createDefaultVoiceProfiles(): TtsVoiceProfile[] {
  return [
    {
      id: "voice-default",
      label: "Default",
      voice: "",
      rate: 0,
      pitch: 0,
      volume: 0,
      enabled: true,
    },
  ]
}

export function createDefaultTtsConfig(): TtsConfig {
  return {
    resumeOnStartup: false,
    textTemplate: TTS_DEFAULT_TEMPLATE,
    queueMode: "small-chat",
    autoAssignVoices: true,
    defaultVoiceProfileId: "",
    minMessageLength: 1,
    maxMessageLength: 220,
    maxQueueSize: 10,
    ignoreCommands: true,
    skipBots: true,
    skipBroadcaster: false,
    skipModerators: false,
    subscribersOnly: false,
    stripLinks: true,
    stripMentions: false,
    stripEmotes: false,
    blockedUsers: [],
    blockedTerms: [],
    wordReplacements: [],
    voiceProfiles: createDefaultVoiceProfiles(),
    soundEffects: [],
    commands: createDefaultTtsCommands(),
  }
}

export function createVoiceProfile(
  existing: TtsVoiceProfile[]
): TtsVoiceProfile {
  return {
    id: createTtsId("voice"),
    label: `Voice ${existing.length + 1}`,
    voice: "",
    rate: 0,
    pitch: 0,
    volume: 0,
    enabled: true,
  }
}

export function createWordReplacement(): TtsWordReplacement {
  return {
    id: createTtsId("replacement"),
    from: "",
    to: "",
    enabled: true,
  }
}

export function normalizeLookupValue(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase()
}

export function parseLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

function uniqueLines(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push(trimmed)
  }
  return result
}

export function normalizeTtsConfig(input: unknown): TtsConfig {
  const parsed = ttsConfigSchema.safeParse(input ?? {})
  const config = parsed.success ? parsed.data : createDefaultTtsConfig()

  const voiceProfiles = uniqueById(config.voiceProfiles)
  const nextVoiceProfiles =
    voiceProfiles.length > 0 ? voiceProfiles : createDefaultVoiceProfiles()

  const seenSoundNames = new Set<string>()
  const soundEffects = uniqueById(config.soundEffects).map((sound, index) => {
    const base = normalizeSoundEffectName(sound.name) || `sound_${index + 1}`
    const name = uniqueSoundEffectName(base, seenSoundNames)
    seenSoundNames.add(name)
    return { ...sound, name }
  })

  const textTemplate = config.textTemplate.replaceAll("{displayName}", "{user}")

  const minMessageLength = Math.min(
    config.minMessageLength,
    config.maxMessageLength
  )

  return {
    ...config,
    textTemplate,
    minMessageLength,
    defaultVoiceProfileId: nextVoiceProfiles.some(
      (profile) => profile.id === config.defaultVoiceProfileId
    )
      ? config.defaultVoiceProfileId
      : "",
    blockedUsers: uniqueLines(config.blockedUsers.map(normalizeLookupValue)),
    blockedTerms: uniqueLines(config.blockedTerms),
    wordReplacements: uniqueById(config.wordReplacements),
    voiceProfiles: nextVoiceProfiles,
    soundEffects,
    commands: {
      ...config.commands,
      whitelist: uniqueLines(
        config.commands.whitelist.map(normalizeLookupValue)
      ),
    },
  }
}

export function hasVoiceProfile(
  voiceProfiles: TtsVoiceProfile[],
  voiceProfileId: string
): boolean {
  return voiceProfiles.some((profile) => profile.id === voiceProfileId)
}

export function pickRandomVoiceProfileId(
  voiceProfiles: TtsVoiceProfile[],
  excludeId?: string
): string | null {
  const enabled = voiceProfiles.filter((profile) => profile.enabled)
  const source = enabled.length > 0 ? enabled : voiceProfiles
  const alternatives = excludeId
    ? source.filter((profile) => profile.id !== excludeId)
    : source
  const pool = alternatives.length > 0 ? alternatives : source

  if (pool.length === 0) {
    return null
  }

  return pool[Math.floor(Math.random() * pool.length)]?.id ?? null
}
