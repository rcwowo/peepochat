import {
  getEmoteConsumedEnd,
  getGifConsumedEnd,
  type TwitchChatGif,
  type TwitchEmote,
} from "@/lib/twitch/chat/chat"
import {
  hasVoiceProfile,
  normalizeLookupValue,
  pickRandomVoiceProfileId,
  type TtsConfig,
  type TtsSoundEffect,
  type TtsVoiceAssignment,
  type TtsWordReplacement,
} from "@/lib/tts/tts-config"
import { getVoiceAssignment, putVoiceAssignment } from "@/lib/tts/tts-db"

export const SOUND_EFFECT_TOKEN_PATTERN = /\(([A-Za-z0-9_-]+)\)/g

const MESSAGE_URL_PATTERN = /https?:\/\/\S+/g
const MENTION_PATTERN = /(^|[^\w@])@[A-Za-z0-9_]+\b/g
const MARKER_START = ""
const MARKER_END = ""
const MARKER_PATTERN = new RegExp(
  `${MARKER_START}([^${MARKER_END}]*)${MARKER_END}`,
  "g"
)

export type TtsMessageFlags = {
  isBroadcaster: boolean
  isModerator: boolean
  isVip: boolean
  isSubscriber: boolean
}

export type TtsSpeechSegment =
  | { kind: "speech"; text: string }
  | { kind: "sound"; soundId: string; name: string }

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const WORD_CHARACTER = "[\\p{L}\\p{N}\\p{M}_]"
const WORD_START_PATTERN = new RegExp(`^${WORD_CHARACTER}`, "u")
const WORD_END_PATTERN = new RegExp(`${WORD_CHARACTER}$`, "u")

const replacementPatternCache = new WeakMap<TtsWordReplacement, RegExp | null>()

function getWordReplacementPattern(
  replacement: TtsWordReplacement
): RegExp | null {
  const cached = replacementPatternCache.get(replacement)
  if (cached !== undefined) {
    return cached
  }

  const trimmed = replacement.from.trim()
  const pattern = trimmed
    ? new RegExp(
        `${WORD_START_PATTERN.test(trimmed) ? `(?<!${WORD_CHARACTER})` : ""}${escapeRegExp(trimmed)}${
          WORD_END_PATTERN.test(trimmed) ? `(?!${WORD_CHARACTER})` : ""
        }`,
        "giu"
      )
    : null
  replacementPatternCache.set(replacement, pattern)
  return pattern
}

export function applyWordReplacements(
  text: string,
  replacements: TtsWordReplacement[]
): string {
  let result = text
  let removed = false

  for (const replacement of replacements) {
    if (!replacement.enabled) {
      continue
    }

    const pattern = getWordReplacementPattern(replacement)
    if (!pattern) {
      continue
    }

    result = result.replace(pattern, () => {
      if (!replacement.to) {
        removed = true
      }
      return replacement.to
    })
  }

  if (!removed) {
    return result
  }

  return result
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim()
}

function stripRanges(
  text: string,
  ranges: { start: number; end: number }[]
): string {
  if (ranges.length === 0) {
    return text
  }

  const sorted = [...ranges].sort((left, right) => left.start - right.start)
  let cursor = 0
  let output = ""

  for (const range of sorted) {
    if (range.start > cursor) {
      output += text.slice(cursor, range.start)
    }
    cursor = Math.max(cursor, range.end)
  }

  if (cursor < text.length) {
    output += text.slice(cursor)
  }

  return output
}

export function sanitizeMessageText(
  text: string,
  options: {
    stripLinks: boolean
    stripMentions: boolean
    stripEmotes: boolean
    emotes: TwitchEmote[]
    gifs: TwitchChatGif[]
  }
): string {
  const withoutEmotes = options.stripEmotes
    ? stripRanges(text, [
        ...options.emotes.map((emote) => ({
          start: emote.start,
          end: getEmoteConsumedEnd(emote),
        })),
        ...options.gifs.map((gif) => ({
          start: gif.start,
          end: getGifConsumedEnd(gif),
        })),
      ])
    : text
  const withoutLinks = options.stripLinks
    ? withoutEmotes.replaceAll(MESSAGE_URL_PATTERN, "")
    : withoutEmotes
  const withoutMentions = options.stripMentions
    ? withoutLinks.replaceAll(MENTION_PATTERN, "$1")
    : withoutLinks
  const withoutControlCharacters = Array.from(withoutMentions, (character) => {
    const codePoint = character.codePointAt(0) ?? 0
    if (
      codePoint <= 31 ||
      codePoint === 127 ||
      character === MARKER_START ||
      character === MARKER_END
    ) {
      return " "
    }
    return character
  }).join("")

  return withoutControlCharacters.replaceAll(/\s+/g, " ").trim()
}

const blockedLookupCache = new WeakMap<
  TtsConfig,
  { blockedUsers: Set<string>; blockedTerms: string[]; soundNames: Set<string> }
>()

function getBlockedLookups(config: TtsConfig) {
  let cached = blockedLookupCache.get(config)
  if (!cached) {
    cached = {
      blockedUsers: new Set(config.blockedUsers.map(normalizeLookupValue)),
      blockedTerms: config.blockedTerms
        .map((term) => term.trim().toLowerCase())
        .filter(Boolean),
      soundNames: new Set(
        config.soundEffects.map((sound) => normalizeLookupValue(sound.name))
      ),
    }
    blockedLookupCache.set(config, cached)
  }
  return cached
}

export function getSpeakableMessageText(
  message: {
    userName: string
    text: string
    emotes: TwitchEmote[]
    gifs: TwitchChatGif[]
    flags: TtsMessageFlags
  },
  config: TtsConfig
): string | null {
  const userName = normalizeLookupValue(message.userName)
  const { blockedUsers, blockedTerms, soundNames } = getBlockedLookups(config)

  if (config.ignoreCommands && /^\s*[!?]/.test(message.text)) {
    return null
  }
  if (config.skipBots && userName.endsWith("bot")) {
    return null
  }
  if (config.skipBroadcaster && message.flags.isBroadcaster) {
    return null
  }
  if (config.skipModerators && message.flags.isModerator) {
    return null
  }
  if (
    config.subscribersOnly &&
    !message.flags.isSubscriber &&
    !message.flags.isBroadcaster
  ) {
    return null
  }
  if (blockedUsers.has(userName)) {
    return null
  }

  const sanitized = sanitizeMessageText(message.text, {
    stripLinks: config.stripLinks,
    stripMentions: config.stripMentions,
    stripEmotes: config.stripEmotes,
    emotes: message.emotes,
    gifs: message.gifs,
  })
  const lowered = sanitized.toLowerCase()

  if (blockedTerms.some((term) => lowered.includes(term))) {
    return null
  }

  const speakable = applyWordReplacements(
    sanitized.replace(SOUND_EFFECT_TOKEN_PATTERN, (match, name: string) =>
      soundNames.has(normalizeLookupValue(name)) ? " " : match
    ),
    config.wordReplacements
  ).trim()
  const hasSoundToken = config.soundEffects.some(
    (sound) => sound.enabled && lowered.includes(`(${sound.name})`)
  )

  if (!speakable && !hasSoundToken) {
    return null
  }
  if (speakable.length < config.minMessageLength && !hasSoundToken) {
    return null
  }
  if (speakable.length > config.maxMessageLength) {
    return null
  }

  return sanitized
}

const ROLE_RANK = {
  broadcaster: 4,
  moderator: 3,
  vip: 2,
  subscriber: 1,
  everyone: 0,
} as const

function userRoleRank(flags: TtsMessageFlags): number {
  if (flags.isBroadcaster) return ROLE_RANK.broadcaster
  if (flags.isModerator) return ROLE_RANK.moderator
  if (flags.isVip) return ROLE_RANK.vip
  if (flags.isSubscriber) return ROLE_RANK.subscriber
  return ROLE_RANK.everyone
}

export function canUseTtsPermission(
  setting: { enabled: boolean; minRole: keyof typeof ROLE_RANK },
  flags: TtsMessageFlags,
  userName: string,
  whitelist: string[]
): boolean {
  if (!setting.enabled) {
    return false
  }

  const normalizedUser = normalizeLookupValue(userName)
  if (
    whitelist.some((entry) => normalizeLookupValue(entry) === normalizedUser)
  ) {
    return true
  }

  return userRoleRank(flags) >= ROLE_RANK[setting.minRole]
}

function buildSpeechText(
  template: string,
  values: {
    message: string
    userName: string
    channel: string
  }
): string {
  const tokens: Record<string, string> = {
    "{message}": values.message,
    "{user}": values.userName,
    "{channel}": values.channel,
  }

  return template.replace(
    /\{(message|user|channel)\}/g,
    (token) => tokens[token] ?? token
  )
}

export function buildSpeechSegments(options: {
  template: string
  message: string
  userName: string
  channel: string
  sounds: TtsSoundEffect[]
  canUseSound: (sound: TtsSoundEffect) => boolean
  replacements: TtsWordReplacement[]
}): { segments: TtsSpeechSegment[]; text: string } {
  const soundByName = new Map<string, TtsSoundEffect>()
  const soundById = new Map<string, TtsSoundEffect>()

  for (const sound of options.sounds) {
    soundByName.set(normalizeLookupValue(sound.name), sound)
    soundById.set(sound.id, sound)
  }

  const withMarkers = options.message.replace(
    SOUND_EFFECT_TOKEN_PATTERN,
    (match, rawName: string) => {
      const sound = soundByName.get(normalizeLookupValue(rawName))
      if (!sound) {
        return match
      }
      return sound.enabled && options.canUseSound(sound)
        ? ` ${MARKER_START}${sound.id}${MARKER_END} `
        : " "
    }
  )

  const templated = buildSpeechText(options.template, {
    message: withMarkers,
    userName: options.userName,
    channel: options.channel,
  })

  const segments: TtsSpeechSegment[] = []
  const pushSpeech = (value: string) => {
    const replaced = applyWordReplacements(value, options.replacements)
    const collapsed = replaced.replace(/\s+/g, " ").trim()
    if (collapsed) {
      segments.push({ kind: "speech", text: collapsed })
    }
  }

  let cursor = 0
  for (const match of templated.matchAll(MARKER_PATTERN)) {
    const index = match.index ?? 0
    pushSpeech(templated.slice(cursor, index))

    const sound = soundById.get(match[1] ?? "")
    if (sound) {
      segments.push({ kind: "sound", soundId: sound.id, name: sound.name })
    }

    cursor = index + match[0].length
  }
  pushSpeech(templated.slice(cursor))

  const text = segments
    .map((segment) =>
      segment.kind === "speech" ? segment.text : `(${segment.name})`
    )
    .join(" ")
    .trim()

  return { segments, text }
}

export async function ensureVoiceAssignment(
  config: TtsConfig,
  userName: string,
  displayName: string
): Promise<TtsVoiceAssignment | null> {
  const normalizedUserName = normalizeLookupValue(userName)
  const now = new Date().toISOString()
  const existing = await getVoiceAssignment(normalizedUserName).catch(
    () => undefined
  )

  if (
    existing &&
    hasVoiceProfile(config.voiceProfiles, existing.voiceProfileId)
  ) {
    const updated: TtsVoiceAssignment = {
      ...existing,
      displayName: displayName || existing.displayName,
      lastSeenAt: now,
    }
    void putVoiceAssignment(updated).catch(() => undefined)
    return updated
  }

  if (!config.autoAssignVoices) {
    const voiceProfileId = hasVoiceProfile(
      config.voiceProfiles,
      config.defaultVoiceProfileId
    )
      ? config.defaultVoiceProfileId
      : pickRandomVoiceProfileId(config.voiceProfiles)

    if (!voiceProfileId) {
      return null
    }

    return {
      userName: normalizedUserName,
      displayName: displayName || userName,
      voiceProfileId,
      createdAt: now,
      lastSeenAt: now,
    }
  }

  const voiceProfileId = pickRandomVoiceProfileId(config.voiceProfiles)
  if (!voiceProfileId) {
    return null
  }

  const assignment: TtsVoiceAssignment = {
    userName: normalizedUserName,
    displayName: displayName || userName,
    voiceProfileId,
    createdAt: existing?.createdAt ?? now,
    lastSeenAt: now,
  }
  await putVoiceAssignment(assignment).catch(() => undefined)
  return assignment
}

export async function reassignRandomVoice(
  config: TtsConfig,
  userName: string,
  displayName: string
): Promise<boolean> {
  const normalizedUserName = normalizeLookupValue(userName)
  const existing = await getVoiceAssignment(normalizedUserName)
  if (!existing) {
    return false
  }

  const voiceProfileId = pickRandomVoiceProfileId(
    config.voiceProfiles,
    existing.voiceProfileId
  )
  if (!voiceProfileId) {
    return false
  }

  await putVoiceAssignment({
    ...existing,
    displayName: displayName || existing.displayName,
    voiceProfileId,
    lastSeenAt: new Date().toISOString(),
  })
  return true
}
