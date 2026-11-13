import type { PingMatchRange } from "@/lib/highlights/highlight-rules"
import { findMessageUrls } from "@/lib/peepochat/peepochat-config"
import { textHasChatMention } from "@/lib/chat/presentation/mentions"
import { isTimelineAppend } from "@/lib/chat/presentation/timeline-prefix"
import { normalizeChannelLogin } from "@/lib/twitch/channel/channel"
import type {
  TwitchBadge,
  TwitchChatMessage,
  TwitchSystemMessage,
  TwitchSystemModActionKind,
} from "@/lib/twitch/chat/chat"
import type { TwitchTimelineItem } from "@/lib/twitch/chat/types"

export const CHAT_SEARCH_FILTER_KEYS = ["in", "from", "role", "has"] as const

export const CHAT_SEARCH_NEGATION_PREFIX = "!"

export type ChatSearchFilterKey = (typeof CHAT_SEARCH_FILTER_KEYS)[number]

const FILTER_KEYS: ReadonlySet<string> = new Set(CHAT_SEARCH_FILTER_KEYS)

export type ChatSearchKnownChannel = {
  login: string
  displayName: string
}

export type ChatSearchFilter = {
  key: ChatSearchFilterKey
  value: string
  negated: boolean
  start: number
  end: number
}

export type ChatSearchCommittedFilter = {
  key: ChatSearchFilterKey
  value: string
  negated: boolean
}

export type ParsedChatSearchQuery = {
  filters: ChatSearchFilter[]
  keywords: string[]
  raw: string
}

export type ChatSearchToken = {
  start: number
  end: number
  text: string
}

export type ChatSearchSuggestion = {
  id: string
  insert: string
  label: string
  description: string
}

export type ChatSearchSystemMessage = TwitchSystemMessage & { channel: string }

export type ChatSearchEntry =
  | { kind: "chat"; message: TwitchChatMessage }
  | { kind: "system"; message: ChatSearchSystemMessage }

export type ChatSearchResult =
  | {
      kind: "chat"
      message: TwitchChatMessage
      highlightRanges: PingMatchRange[]
      usernameHighlightRanges: PingMatchRange[]
    }
  | { kind: "system"; message: ChatSearchSystemMessage }

export type ChatSearchUsername = {
  userName: string
  displayName: string
}

const FILTER_TYPE_SUGGESTIONS: ChatSearchSuggestion[] = [
  {
    id: "filter:in",
    insert: "in:",
    label: "in:",
    description: "Search a channel",
  },
  {
    id: "filter:from",
    insert: "from:",
    label: "from:",
    description: "Messages from a user",
  },
  {
    id: "filter:role",
    insert: "role:",
    label: "role:",
    description: "Filter by badge role",
  },
  {
    id: "filter:has",
    insert: "has:",
    label: "has:",
    description: "Messages containing something",
  },
]

const NEGATED_FILTER_TYPE_DESCRIPTIONS: Record<ChatSearchFilterKey, string> = {
  in: "Exclude a channel",
  from: "Exclude messages from a user",
  role: "Exclude a badge role",
  has: "Exclude messages containing something",
}

const ROLE_SUGGESTIONS: ChatSearchSuggestion[] = [
  {
    id: "role:mod",
    insert: "role:mod",
    label: "role:mod",
    description: "Moderators",
  },
  {
    id: "role:vip",
    insert: "role:vip",
    label: "role:vip",
    description: "VIPs",
  },
  {
    id: "role:subscriber",
    insert: "role:subscriber",
    label: "role:subscriber",
    description: "Subscribers",
  },
  {
    id: "role:broadcaster",
    insert: "role:broadcaster",
    label: "role:broadcaster",
    description: "Broadcaster",
  },
]

type ChatSearchHasDefinition = {
  value: string
  aliases: readonly string[]
  description: string
  category: "content" | "type"
  matchChat: (message: TwitchChatMessage) => boolean
  matchSystem: (message: TwitchSystemMessage) => boolean
}

const GIFT_SUB_MSG_IDS: ReadonlySet<string> = new Set([
  "subgift",
  "submysterygift",
  "anonsubgift",
  "anonsubmysterygift",
])

const UPGRADE_SUB_MSG_IDS: ReadonlySet<string> = new Set([
  "giftpaidupgrade",
  "anongiftpaidupgrade",
  "primepaidupgrade",
])

const BAN_MOD_ACTION_KINDS: ReadonlySet<TwitchSystemModActionKind> = new Set([
  "ban",
  "anonymous_ban",
])

const TIMEOUT_MOD_ACTION_KINDS: ReadonlySet<TwitchSystemModActionKind> =
  new Set(["timeout", "anonymous_timeout"])

function never() {
  return false
}

function systemMsgIdIn(message: TwitchSystemMessage, ids: ReadonlySet<string>) {
  return message.msgId !== null && ids.has(message.msgId.toLowerCase())
}

function systemModActionIn(
  message: TwitchSystemMessage,
  kinds: ReadonlySet<TwitchSystemModActionKind>
) {
  return (
    message.event === "mod_action" &&
    message.modActionKind !== null &&
    kinds.has(message.modActionKind)
  )
}

function isChannelEventSystemMessage(message: TwitchSystemMessage) {
  switch (message.event) {
    case "subscription":
    case "raid":
    case "announcement":
      return true
    case "status":
      return message.msgId !== null
    default:
      return false
  }
}

function isNoticeSystemMessage(message: TwitchSystemMessage) {
  switch (message.event) {
    case "notice":
    case "connection":
      return true
    case "status":
      return message.msgId === null
    default:
      return false
  }
}

const HAS_DEFINITIONS: readonly ChatSearchHasDefinition[] = [
  {
    value: "link",
    aliases: ["links", "url", "urls"],
    description: "Contains a link",
    category: "content",
    matchChat: (message) => findMessageUrls(message.text).length > 0,
    matchSystem: (message) => findMessageUrls(message.text).length > 0,
  },
  {
    value: "emote",
    aliases: ["emotes"],
    description: "Contains an emote",
    category: "content",
    matchChat: (message) => message.emotes.length > 0,
    matchSystem: (message) => (message.detailsEmotes?.length ?? 0) > 0,
  },
  {
    value: "gif",
    aliases: ["gifs"],
    description: "Contains a GIF message",
    category: "content",
    matchChat: (message) => message.gifs.length > 0,
    matchSystem: never,
  },
  {
    value: "mention",
    aliases: ["mentions"],
    description: "Contains an @mention",
    category: "content",
    matchChat: (message) => textHasChatMention(message.text),
    matchSystem: (message) => textHasChatMention(message.text),
  },
  {
    value: "reply",
    aliases: ["replies"],
    description: "Is a reply",
    category: "content",
    matchChat: (message) => message.reply !== null,
    matchSystem: never,
  },
  {
    value: "bits",
    aliases: ["bit", "cheer", "cheers"],
    description: "Contains a cheer",
    category: "content",
    matchChat: (message) => (message.bits ?? 0) > 0,
    matchSystem: never,
  },
  {
    value: "first",
    aliases: ["firstmessage"],
    description: "First-time chatter",
    category: "content",
    matchChat: (message) => message.flags.isFirst,
    matchSystem: never,
  },
  {
    value: "chat",
    aliases: ["message", "messages"],
    description: "Chat messages",
    category: "type",
    matchChat: () => true,
    matchSystem: never,
  },
  {
    value: "event",
    aliases: ["events"],
    description: "Any channel event",
    category: "type",
    matchChat: never,
    matchSystem: isChannelEventSystemMessage,
  },
  {
    value: "sub",
    aliases: ["subs", "subscription", "subscriptions"],
    description: "Any subscription event",
    category: "type",
    matchChat: never,
    matchSystem: (message) => message.event === "subscription",
  },
  {
    value: "newsub",
    aliases: ["newsubs"],
    description: "New subscriptions",
    category: "type",
    matchChat: never,
    matchSystem: (message) => message.msgId?.toLowerCase() === "sub",
  },
  {
    value: "resub",
    aliases: ["resubs"],
    description: "Resubscriptions",
    category: "type",
    matchChat: never,
    matchSystem: (message) => message.msgId?.toLowerCase() === "resub",
  },
  {
    value: "gift",
    aliases: ["gifts", "subgift", "subgifts"],
    description: "Gifted subscriptions",
    category: "type",
    matchChat: never,
    matchSystem: (message) => systemMsgIdIn(message, GIFT_SUB_MSG_IDS),
  },
  {
    value: "upgrade",
    aliases: ["upgrades"],
    description: "Subscription upgrades",
    category: "type",
    matchChat: never,
    matchSystem: (message) => systemMsgIdIn(message, UPGRADE_SUB_MSG_IDS),
  },
  {
    value: "raid",
    aliases: ["raids"],
    description: "Raids",
    category: "type",
    matchChat: never,
    matchSystem: (message) => message.event === "raid",
  },
  {
    value: "announcement",
    aliases: ["announcements"],
    description: "Announcements",
    category: "type",
    matchChat: never,
    matchSystem: (message) => message.event === "announcement",
  },
  {
    value: "notice",
    aliases: ["notices"],
    description: "Chat notices and status messages",
    category: "type",
    matchChat: never,
    matchSystem: isNoticeSystemMessage,
  },
  {
    value: "modaction",
    aliases: ["modactions", "mod_action", "moderation"],
    description: "Moderation actions",
    category: "type",
    matchChat: never,
    matchSystem: (message) => message.event === "mod_action",
  },
  {
    value: "ban",
    aliases: ["bans"],
    description: "Bans",
    category: "type",
    matchChat: never,
    matchSystem: (message) => systemModActionIn(message, BAN_MOD_ACTION_KINDS),
  },
  {
    value: "timeout",
    aliases: ["timeouts"],
    description: "Timeouts",
    category: "type",
    matchChat: never,
    matchSystem: (message) =>
      systemModActionIn(message, TIMEOUT_MOD_ACTION_KINDS),
  },
]

const HAS_DEFINITIONS_BY_VALUE: ReadonlyMap<string, ChatSearchHasDefinition> =
  new Map(
    HAS_DEFINITIONS.flatMap((definition) =>
      [definition.value, ...definition.aliases].map(
        (value) => [value, definition] as const
      )
    )
  )

const HAS_SUGGESTIONS: ChatSearchSuggestion[] = HAS_DEFINITIONS.map(
  (definition) => ({
    id: `has:${definition.value}`,
    insert: `has:${definition.value}`,
    label: `has:${definition.value}`,
    description: definition.description,
  })
)

function resolveHasDefinition(value: string) {
  return HAS_DEFINITIONS_BY_VALUE.get(value.trim().toLowerCase()) ?? null
}

function isFilterKey(value: string): value is ChatSearchFilterKey {
  return FILTER_KEYS.has(value)
}

function isWhitespace(char: string) {
  return char === " " || char === "\t" || char === "\n"
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function stripFilterValueDecorators(value: string) {
  return value.replace(/^@/, "").replace(/^"/, "").replace(/"$/, "")
}

function isIncompleteQuotedFilter(text: string, filter: ChatSearchFilter) {
  const raw = text.slice(filter.start, filter.end)
  const colon = raw.indexOf(":")
  if (colon < 0) {
    return false
  }

  const valuePart = raw.slice(colon + 1)
  if (!valuePart.startsWith('"')) {
    return false
  }

  return !valuePart.slice(1).includes('"')
}

export function parseChatSearchQuery(raw: string): ParsedChatSearchQuery {
  const filters: ChatSearchFilter[] = []
  const keywords: string[] = []
  const length = raw.length
  let index = 0

  const skipSpaces = () => {
    while (index < length && isWhitespace(raw[index]!)) {
      index += 1
    }
  }

  const readQuoted = () => {
    index += 1
    const start = index
    while (index < length && raw[index] !== '"') {
      index += 1
    }
    const value = raw.slice(start, index)
    if (index < length && raw[index] === '"') {
      index += 1
    }
    return value
  }

  const readUnquoted = () => {
    const start = index
    while (index < length && !isWhitespace(raw[index]!)) {
      index += 1
    }
    return raw.slice(start, index)
  }

  while (index < length) {
    skipSpaces()
    if (index >= length) {
      break
    }

    const tokenStart = index

    if (raw[index] === '"') {
      const phrase = readQuoted().trim()
      if (phrase) {
        keywords.push(phrase)
      }
      continue
    }

    let tokenEnd = index
    while (tokenEnd < length && !isWhitespace(raw[tokenEnd]!)) {
      tokenEnd += 1
    }

    const negated = raw.startsWith(CHAT_SEARCH_NEGATION_PREFIX, index)
    const keyStart = negated
      ? index + CHAT_SEARCH_NEGATION_PREFIX.length
      : index
    const colon = raw.indexOf(":", keyStart)
    if (colon > keyStart && colon < tokenEnd) {
      const key = raw.slice(keyStart, colon).toLowerCase()
      if (isFilterKey(key)) {
        index = colon + 1
        const value = raw[index] === '"' ? readQuoted() : readUnquoted()
        const trimmed = value.trim()
        if (trimmed) {
          filters.push({
            key,
            value: trimmed,
            negated,
            start: tokenStart,
            end: index,
          })
        }
        continue
      }
    }

    const token = readUnquoted()
    if (token) {
      keywords.push(token)
    }
  }

  return { filters, keywords, raw }
}

export function isChatSearchQueryActive(parsed: ParsedChatSearchQuery) {
  return parsed.filters.length > 0 || parsed.keywords.length > 0
}

export function getChatSearchTokenAtCursor(
  query: string,
  cursor: number
): ChatSearchToken {
  const clamped = Math.max(0, Math.min(cursor, query.length))
  let quoted = false
  for (let index = 0; index < clamped; index += 1) {
    if (query[index] === '"') {
      quoted = !quoted
    }
  }

  let start = clamped
  if (quoted) {
    while (start > 0 && query[start - 1] !== '"') {
      start -= 1
    }
    if (start > 0 && query[start - 1] === '"') {
      start -= 1
    }
    while (start > 0 && !isWhitespace(query[start - 1]!)) {
      start -= 1
    }
  } else {
    while (start > 0 && !isWhitespace(query[start - 1]!)) {
      start -= 1
    }
  }

  let end = start
  quoted = false
  while (end < query.length) {
    const char = query[end]!
    if (char === '"') {
      quoted = !quoted
      end += 1
      continue
    }
    if (!quoted && isWhitespace(char)) {
      break
    }
    end += 1
  }

  return {
    start,
    end,
    text: query.slice(start, end),
  }
}

export function replaceChatSearchToken(
  query: string,
  token: ChatSearchToken,
  insert: string
): { query: string; cursor: number } {
  const addSpace = !insert.endsWith(":")
  const trailing = query.slice(token.end).replace(/^\s*/, "")
  const spacer = addSpace ? " " : ""
  const next = `${query.slice(0, token.start)}${insert}${spacer}${trailing}`
  return {
    query: next,
    cursor: token.start + insert.length + spacer.length,
  }
}

export function removeChatSearchFilterRange(
  raw: string,
  start: number,
  end: number
) {
  return `${raw.slice(0, start)}${raw.slice(end)}`
    .replace(/\s{2,}/g, " ")
    .trim()
}

export function splitCommittedSearchQuery(text: string): {
  filters: ChatSearchCommittedFilter[]
  remainder: string
} {
  const parsed = parseChatSearchQuery(text)
  if (parsed.filters.length === 0) {
    return { filters: [], remainder: text }
  }

  const endsWithSpace = text.length > 0 && isWhitespace(text[text.length - 1]!)

  const committed: ChatSearchFilter[] = []
  for (const filter of parsed.filters) {
    if (isIncompleteQuotedFilter(text, filter)) {
      continue
    }

    const trailing = text.slice(filter.end)
    const isAtEnd = trailing.trim() === ""
    if (isAtEnd && !endsWithSpace) {
      continue
    }

    committed.push(filter)
  }

  if (committed.length === 0) {
    return { filters: [], remainder: text }
  }

  let remainder = text
  for (let index = committed.length - 1; index >= 0; index -= 1) {
    const filter = committed[index]!
    remainder = `${remainder.slice(0, filter.start)}${remainder.slice(filter.end)}`
  }
  remainder = remainder.replace(/\s{2,}/g, " ").replace(/^\s+/, "")
  if (endsWithSpace) {
    remainder = remainder.replace(/\s+$/, "")
  }

  return {
    filters: committed.map((filter) => ({
      key: filter.key,
      value: filter.value,
      negated: filter.negated,
    })),
    remainder,
  }
}

export function formatChatSearchFilter(filter: ChatSearchCommittedFilter) {
  const prefix = filter.negated ? CHAT_SEARCH_NEGATION_PREFIX : ""
  return `${prefix}${filter.key}:${filter.value}`
}

export function serializeChatSearchQuery(
  filters: ChatSearchCommittedFilter[],
  remainder: string
) {
  const filterText = filters
    .map((filter) => {
      const value = /\s/.test(filter.value) ? `"${filter.value}"` : filter.value
      const prefix = filter.negated ? CHAT_SEARCH_NEGATION_PREFIX : ""
      return `${prefix}${filter.key}:${value}`
    })
    .join(" ")
  const rest = remainder.replace(/^\s+/, "")
  if (!filterText) {
    return remainder
  }
  return rest ? `${filterText} ${rest}` : filterText
}

export function isAllChannelsSearchValue(value: string) {
  return value.trim().replace(/^#/, "") === "*"
}

export function resolveChannelSearchLogin(
  value: string,
  channels: ChatSearchKnownChannel[]
) {
  if (isAllChannelsSearchValue(value)) {
    return ""
  }

  const normalized = normalizeChannelLogin(value)
  if (!normalized) {
    return ""
  }

  const exactLogin = channels.find(
    (channel) => normalizeChannelLogin(channel.login) === normalized
  )
  if (exactLogin) {
    return normalizeChannelLogin(exactLogin.login)
  }

  const exactDisplay = channels.find(
    (channel) => channel.displayName.trim().toLowerCase() === normalized
  )
  if (exactDisplay) {
    return normalizeChannelLogin(exactDisplay.login)
  }

  return ""
}

export function resolveSearchChannelLogins(
  parsed: ParsedChatSearchQuery,
  defaultChannelLogins: string[],
  channels: ChatSearchKnownChannel[]
) {
  const includeFilters: ChatSearchFilter[] = []
  const excludeFilters: ChatSearchFilter[] = []
  for (const filter of parsed.filters) {
    if (filter.key !== "in") {
      continue
    }
    if (filter.negated) {
      excludeFilters.push(filter)
    } else {
      includeFilters.push(filter)
    }
  }

  const allChannelLogins = () =>
    channels.map((channel) => normalizeChannelLogin(channel.login))

  let logins: string[]
  if (includeFilters.length === 0) {
    logins =
      excludeFilters.length === 0
        ? defaultChannelLogins.map((login) => normalizeChannelLogin(login))
        : allChannelLogins()
  } else if (
    includeFilters.some((filter) => isAllChannelsSearchValue(filter.value))
  ) {
    logins = allChannelLogins()
  } else {
    const resolved = new Set<string>()
    for (const filter of includeFilters) {
      const login = resolveChannelSearchLogin(filter.value, channels)
      if (login) {
        resolved.add(login)
      }
    }
    logins = [...resolved]
  }

  if (excludeFilters.length === 0) {
    return logins
  }

  const excluded = new Set<string>()
  for (const filter of excludeFilters) {
    if (isAllChannelsSearchValue(filter.value)) {
      return []
    }
    const login =
      resolveChannelSearchLogin(filter.value, channels) ||
      normalizeChannelLogin(filter.value)
    if (login) {
      excluded.add(login)
    }
  }

  return logins.filter((login) => !excluded.has(login))
}

function normalizeUserFilter(value: string) {
  return value.trim().replace(/^@/, "").toLowerCase()
}

function userMatchesFilter(
  user: { userName: string; displayName: string } | null,
  needle: string
) {
  return (
    user !== null &&
    (user.userName.toLowerCase() === needle ||
      user.displayName.toLowerCase() === needle)
  )
}

function entryMatchesFrom(entry: ChatSearchEntry, needle: string) {
  if (entry.kind === "chat") {
    return userMatchesFilter(entry.message, needle)
  }

  return (
    userMatchesFilter(entry.message.actor, needle) ||
    userMatchesFilter(entry.message.target, needle)
  )
}

type ChatSearchRole = "moderator" | "vip" | "subscriber" | "broadcaster"

type ChatSearchRoleFlags = {
  isBroadcaster: boolean
  isModerator: boolean
  isSubscriber: boolean
  isVip: boolean
}

function resolveChatSearchRole(value: string): ChatSearchRole | null {
  switch (value.trim().toLowerCase()) {
    case "mod":
    case "mods":
    case "moderator":
    case "moderators":
      return "moderator"
    case "vip":
    case "vips":
      return "vip"
    case "sub":
    case "subs":
    case "subscriber":
    case "subscribers":
      return "subscriber"
    case "broadcaster":
    case "streamer":
      return "broadcaster"
    default:
      return null
  }
}

function getBadgeRoleFlags(badges: TwitchBadge[]): ChatSearchRoleFlags {
  const sets = new Set(badges.map((badge) => badge.set))
  return {
    isBroadcaster: sets.has("broadcaster"),
    isModerator: sets.has("moderator"),
    isSubscriber: sets.has("subscriber") || sets.has("founder"),
    isVip: sets.has("vip"),
  }
}

function entryHasRole(entry: ChatSearchEntry, role: ChatSearchRole) {
  const flags =
    entry.kind === "chat"
      ? entry.message.flags
      : getBadgeRoleFlags(entry.message.badges)

  switch (role) {
    case "moderator":
      return flags.isModerator
    case "vip":
      return flags.isVip
    case "subscriber":
      return flags.isSubscriber
    case "broadcaster":
      return flags.isBroadcaster
  }
}

function entryMatchesHas(
  entry: ChatSearchEntry,
  definition: ChatSearchHasDefinition
) {
  return entry.kind === "chat"
    ? definition.matchChat(entry.message)
    : definition.matchSystem(entry.message)
}

function findKeywordRanges(text: string, keyword: string): PingMatchRange[] {
  if (!keyword || !text) {
    return []
  }

  const escaped = escapeRegExp(keyword)
  let pattern: RegExp
  try {
    pattern = new RegExp(escaped, "giu")
  } catch {
    pattern = new RegExp(escaped, "gi")
  }

  const ranges: PingMatchRange[] = []
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0
    ranges.push({
      start,
      end: start + match[0].length,
    })
  }

  return ranges
}

export function findKeywordHighlightRanges(
  text: string,
  keywords: string[]
): PingMatchRange[] | null {
  if (keywords.length === 0) {
    return []
  }

  const ranges: PingMatchRange[] = []

  for (const keyword of keywords) {
    if (!keyword) {
      continue
    }

    const found = findKeywordRanges(text, keyword)
    if (found.length === 0) {
      return null
    }

    ranges.push(...found)
  }

  return mergeHighlightRanges(ranges)
}

export function mergeHighlightRanges(
  ranges: PingMatchRange[]
): PingMatchRange[] {
  if (ranges.length <= 1) {
    return ranges
  }

  const sorted = [...ranges].sort((left, right) => left.start - right.start)
  const merged: PingMatchRange[] = [{ ...sorted[0]! }]

  for (let index = 1; index < sorted.length; index += 1) {
    const range = sorted[index]!
    const last = merged[merged.length - 1]!
    if (range.start <= last.end) {
      last.end = Math.max(last.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }

  return merged
}

type CompiledChatSearchQuery = {
  unsatisfiable: boolean
  includeFrom: string[]
  excludeFrom: string[]
  includeRoles: ChatSearchRole[]
  excludeRoles: ChatSearchRole[]
  includeTypes: ChatSearchHasDefinition[]
  excludeTypes: ChatSearchHasDefinition[]
  includeContent: ChatSearchHasDefinition[]
  excludeContent: ChatSearchHasDefinition[]
}

const compiledChatSearchQueries = new WeakMap<
  ParsedChatSearchQuery,
  CompiledChatSearchQuery
>()

function compileChatSearchQuery(
  parsed: ParsedChatSearchQuery
): CompiledChatSearchQuery {
  const cached = compiledChatSearchQueries.get(parsed)
  if (cached) {
    return cached
  }

  const compiled: CompiledChatSearchQuery = {
    unsatisfiable: false,
    includeFrom: [],
    excludeFrom: [],
    includeRoles: [],
    excludeRoles: [],
    includeTypes: [],
    excludeTypes: [],
    includeContent: [],
    excludeContent: [],
  }
  let includeFromCount = 0
  let includeRoleCount = 0

  for (const filter of parsed.filters) {
    switch (filter.key) {
      case "in":
        break
      case "from": {
        if (!filter.negated) {
          includeFromCount += 1
        }
        const needle = normalizeUserFilter(filter.value)
        if (needle) {
          ;(filter.negated ? compiled.excludeFrom : compiled.includeFrom).push(
            needle
          )
        }
        break
      }
      case "role": {
        if (!filter.negated) {
          includeRoleCount += 1
        }
        const role = resolveChatSearchRole(filter.value)
        if (role) {
          ;(filter.negated
            ? compiled.excludeRoles
            : compiled.includeRoles
          ).push(role)
        }
        break
      }
      case "has": {
        const definition = resolveHasDefinition(filter.value)
        if (!definition) {
          if (!filter.negated) {
            compiled.unsatisfiable = true
          }
          break
        }
        if (definition.category === "type") {
          ;(filter.negated
            ? compiled.excludeTypes
            : compiled.includeTypes
          ).push(definition)
        } else {
          ;(filter.negated
            ? compiled.excludeContent
            : compiled.includeContent
          ).push(definition)
        }
        break
      }
    }
  }

  if (
    (includeFromCount > 0 && compiled.includeFrom.length === 0) ||
    (includeRoleCount > 0 && compiled.includeRoles.length === 0)
  ) {
    compiled.unsatisfiable = true
  }

  compiledChatSearchQueries.set(parsed, compiled)
  return compiled
}

function entryMatchesFilters(
  entry: ChatSearchEntry,
  query: CompiledChatSearchQuery
) {
  if (query.unsatisfiable) {
    return false
  }

  if (query.includeTypes.length > 0) {
    if (
      !query.includeTypes.some((definition) =>
        entryMatchesHas(entry, definition)
      )
    ) {
      return false
    }
  } else if (
    entry.kind !== "chat" &&
    !query.excludeTypes.some((definition) => definition.value === "chat")
  ) {
    return false
  }

  if (
    query.excludeTypes.some((definition) => entryMatchesHas(entry, definition))
  ) {
    return false
  }

  if (
    query.includeFrom.length > 0 &&
    !query.includeFrom.some((needle) => entryMatchesFrom(entry, needle))
  ) {
    return false
  }

  if (query.excludeFrom.some((needle) => entryMatchesFrom(entry, needle))) {
    return false
  }

  if (
    query.includeRoles.length > 0 &&
    !query.includeRoles.some((role) => entryHasRole(entry, role))
  ) {
    return false
  }

  if (query.excludeRoles.some((role) => entryHasRole(entry, role))) {
    return false
  }

  if (
    !query.includeContent.every((definition) =>
      entryMatchesHas(entry, definition)
    )
  ) {
    return false
  }

  return !query.excludeContent.some((definition) =>
    entryMatchesHas(entry, definition)
  )
}

export type ChatSearchNicknameResolver = (userName: string) => string | null

type ChatSearchMatchOptions = {
  getNicknameByLogin?: ChatSearchNicknameResolver
}

function getChatSearchDisplayName(
  message: TwitchChatMessage,
  options: ChatSearchMatchOptions | undefined
) {
  const nickname = options?.getNicknameByLogin?.(message.userName) ?? null
  return nickname || message.displayName
}

function textContainsKeyword(text: string | null | undefined, keyword: string) {
  return Boolean(text) && findKeywordRanges(text!, keyword).length > 0
}

function systemMessageMatchesKeywords(
  message: TwitchSystemMessage,
  keywords: string[],
  options: ChatSearchMatchOptions | undefined
) {
  const actorNickname = message.actor
    ? (options?.getNicknameByLogin?.(message.actor.userName) ?? null)
    : null
  const targetNickname = message.target
    ? (options?.getNicknameByLogin?.(message.target.userName) ?? null)
    : null
  const haystacks = [
    message.text,
    message.actor?.displayName,
    message.actor?.userName,
    actorNickname,
    message.target?.displayName,
    message.target?.userName,
    targetNickname,
  ]

  return keywords.every(
    (keyword) =>
      !keyword ||
      haystacks.some((haystack) => textContainsKeyword(haystack, keyword))
  )
}

function matchChatMessageKeywords(
  message: TwitchChatMessage,
  keywords: string[],
  options: ChatSearchMatchOptions | undefined
): ChatSearchResult | null {
  if (keywords.length === 0) {
    return {
      kind: "chat",
      message,
      highlightRanges: [],
      usernameHighlightRanges: [],
    }
  }

  const datasetDisplayName = getChatSearchDisplayName(message, options)
  const highlightRanges: PingMatchRange[] = []
  const usernameHighlightRanges: PingMatchRange[] = []

  for (const keyword of keywords) {
    if (!keyword) {
      continue
    }

    const textRanges = findKeywordRanges(message.text, keyword)
    const displayRanges = findKeywordRanges(datasetDisplayName, keyword)
    const loginRanges = findKeywordRanges(message.userName, keyword)

    if (
      textRanges.length === 0 &&
      displayRanges.length === 0 &&
      loginRanges.length === 0
    ) {
      return null
    }

    highlightRanges.push(...textRanges)
    if (displayRanges.length > 0) {
      usernameHighlightRanges.push(...displayRanges)
    } else if (loginRanges.length > 0 && datasetDisplayName.length > 0) {
      usernameHighlightRanges.push({
        start: 0,
        end: datasetDisplayName.length,
      })
    }
  }

  return {
    kind: "chat",
    message,
    highlightRanges: mergeHighlightRanges(highlightRanges),
    usernameHighlightRanges: mergeHighlightRanges(usernameHighlightRanges),
  }
}

export function matchChatSearchEntry(
  entry: ChatSearchEntry,
  parsed: ParsedChatSearchQuery,
  options?: ChatSearchMatchOptions
): ChatSearchResult | null {
  if (!entryMatchesFilters(entry, compileChatSearchQuery(parsed))) {
    return null
  }

  if (entry.kind === "system") {
    return systemMessageMatchesKeywords(entry.message, parsed.keywords, options)
      ? { kind: "system", message: entry.message }
      : null
  }

  return matchChatMessageKeywords(entry.message, parsed.keywords, options)
}

function compareChatSearchResults(
  left: ChatSearchResult,
  right: ChatSearchResult
) {
  const byTime = right.message.receivedAt.localeCompare(left.message.receivedAt)
  if (byTime !== 0) {
    return byTime
  }
  return right.message.id.localeCompare(left.message.id)
}

export function searchChatEntries(
  entries: ChatSearchEntry[],
  parsed: ParsedChatSearchQuery,
  options?: ChatSearchMatchOptions
): ChatSearchResult[] {
  if (!isChatSearchQueryActive(parsed)) {
    return []
  }

  const results: ChatSearchResult[] = []
  for (const entry of entries) {
    const match = matchChatSearchEntry(entry, parsed, options)
    if (match) {
      results.push(match)
    }
  }

  results.sort(compareChatSearchResults)
  return results
}

export function mergeChatSearchResults(
  existing: ChatSearchResult[],
  extra: ChatSearchResult[]
) {
  if (extra.length === 0) {
    return existing
  }
  if (existing.length === 0) {
    return extra
  }

  const seen = new Set(
    existing.map((result) => `${result.message.channel}:${result.message.id}`)
  )
  const merged = [...existing]
  for (const result of extra) {
    const key = `${result.message.channel}:${result.message.id}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    merged.push(result)
  }

  merged.sort(compareChatSearchResults)
  return merged
}

export type ChatSearchResultsCache = {
  parsed: ParsedChatSearchQuery | null
  timelines: TwitchTimelineItem[][]
  includeDeleted: boolean
  hideBlockedUsers: boolean
  nicknamesKey: string | null
  results: ChatSearchResult[]
}

export function createChatSearchResultsCache(): ChatSearchResultsCache {
  return {
    parsed: null,
    timelines: [],
    includeDeleted: true,
    hideBlockedUsers: false,
    nicknamesKey: null,
    results: [],
  }
}

type ChatSearchCollectOptions = {
  includeDeleted?: boolean
  isHidden?: (message: TwitchChatMessage) => boolean
  isSystemHidden?: (message: TwitchSystemMessage) => boolean
}

export function updateChatSearchResults(
  cache: ChatSearchResultsCache,
  input: {
    open: boolean
    parsed: ParsedChatSearchQuery
    timelines: TwitchTimelineItem[][]
    includeDeleted: boolean
    hideBlockedUsers: boolean
    getNicknameByLogin?: ChatSearchNicknameResolver
    nicknamesKey?: string | null
    isHidden?: (message: TwitchChatMessage) => boolean
    isSystemHidden?: (message: TwitchSystemMessage) => boolean
  }
) {
  const {
    open,
    parsed,
    timelines,
    includeDeleted,
    hideBlockedUsers,
    getNicknameByLogin,
    nicknamesKey,
    isHidden,
    isSystemHidden,
  } = input

  if (!open || !isChatSearchQueryActive(parsed)) {
    cache.parsed = null
    cache.timelines = []
    cache.results = []
    return []
  }

  const collectOptions: ChatSearchCollectOptions = {
    includeDeleted,
    isHidden,
    isSystemHidden,
  }
  const effectiveNicknamesKey = nicknamesKey ?? null
  const canAppend =
    cache.parsed === parsed &&
    cache.includeDeleted === includeDeleted &&
    cache.hideBlockedUsers === hideBlockedUsers &&
    cache.nicknamesKey === effectiveNicknamesKey &&
    cache.timelines.length === timelines.length &&
    cache.timelines.every((timeline, index) => {
      const next = timelines[index]
      return (
        next === timeline || (next != null && isTimelineAppend(timeline, next))
      )
    })

  let results: ChatSearchResult[]
  if (canAppend) {
    const appended: ChatSearchEntry[] = []
    for (let index = 0; index < timelines.length; index += 1) {
      const previous = cache.timelines[index] ?? []
      const next = timelines[index] ?? []
      if (next.length <= previous.length) {
        continue
      }
      for (const entry of collectChatSearchEntries(
        next.slice(previous.length),
        collectOptions
      )) {
        appended.push(entry)
      }
    }
    results = mergeChatSearchResults(
      cache.results,
      searchChatEntries(appended, parsed, { getNicknameByLogin })
    )
  } else {
    results = searchChatEntries(
      collectChatSearchEntriesFromTimelines(timelines, collectOptions),
      parsed,
      { getNicknameByLogin }
    )
  }

  cache.parsed = parsed
  cache.timelines = timelines
  cache.includeDeleted = includeDeleted
  cache.hideBlockedUsers = hideBlockedUsers
  cache.nicknamesKey = effectiveNicknamesKey
  cache.results = results
  return results
}

function isChatSearchSystemMessage(
  message: TwitchSystemMessage
): message is ChatSearchSystemMessage {
  return Boolean(message.channel)
}

export function collectChatSearchEntries(
  entries: TwitchTimelineItem[],
  options?: ChatSearchCollectOptions
) {
  const includeDeleted = options?.includeDeleted ?? true
  const isHidden = options?.isHidden
  const isSystemHidden = options?.isSystemHidden
  const collected: ChatSearchEntry[] = []

  for (const entry of entries) {
    if (entry.kind === "chat") {
      if (!includeDeleted && entry.message.deletedAt) {
        continue
      }

      if (isHidden?.(entry.message)) {
        continue
      }

      collected.push({ kind: "chat", message: entry.message })
      continue
    }

    if (entry.kind === "system") {
      if (!isChatSearchSystemMessage(entry.message)) {
        continue
      }

      if (isSystemHidden?.(entry.message)) {
        continue
      }

      collected.push({ kind: "system", message: entry.message })
    }
  }

  return collected
}

export function collectChatSearchEntriesFromTimelines(
  timelines: TwitchTimelineItem[][],
  options?: ChatSearchCollectOptions
) {
  const collected: ChatSearchEntry[] = []

  for (const timeline of timelines) {
    for (const entry of collectChatSearchEntries(timeline, options)) {
      collected.push(entry)
    }
  }

  return collected
}

export function collectRecentSearchUsernames(
  timelines: TwitchTimelineItem[][]
): ChatSearchUsername[] {
  const seen = new Set<string>()
  const users: ChatSearchUsername[] = []

  for (const timeline of timelines) {
    for (let index = timeline.length - 1; index >= 0; index -= 1) {
      const entry = timeline[index]
      if (entry?.kind !== "chat") {
        continue
      }

      const key = entry.message.userName.toLowerCase()
      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      users.push({
        userName: entry.message.userName,
        displayName: entry.message.displayName,
      })
    }
  }

  return users
}

function filterSuggestions(suggestions: ChatSearchSuggestion[], query: string) {
  if (!query) {
    return suggestions
  }

  const needle = query.toLowerCase()
  return suggestions.filter(
    (suggestion) =>
      suggestion.insert.toLowerCase().startsWith(needle) ||
      suggestion.label.toLowerCase().startsWith(needle)
  )
}

function negateChatSearchSuggestion(
  suggestion: ChatSearchSuggestion
): ChatSearchSuggestion {
  return {
    ...suggestion,
    id: `${CHAT_SEARCH_NEGATION_PREFIX}${suggestion.id}`,
    insert: `${CHAT_SEARCH_NEGATION_PREFIX}${suggestion.insert}`,
    label: `${CHAT_SEARCH_NEGATION_PREFIX}${suggestion.label}`,
  }
}

function getFilterValueSuggestions({
  key,
  value,
  negated,
  channels,
  usernames,
}: {
  key: string
  value: string
  negated: boolean
  channels: ChatSearchKnownChannel[]
  usernames: ChatSearchUsername[]
}): ChatSearchSuggestion[] {
  const needle = stripFilterValueDecorators(value).toLowerCase()

  if (key === "in") {
    const channelSuggestions = channels
      .filter((channel) => {
        if (!needle) {
          return true
        }
        return (
          channel.login.toLowerCase().startsWith(needle) ||
          channel.displayName.toLowerCase().startsWith(needle)
        )
      })
      .slice(0, 8)
      .map((channel) => ({
        id: `in:${channel.login}`,
        insert: `in:${channel.login}`,
        label: `in:${channel.login}`,
        description: channel.displayName,
      }))

    if (!negated && (!needle || "*".startsWith(needle))) {
      return [
        {
          id: "in:*",
          insert: "in:*",
          label: "in:*",
          description: "All channels",
        },
        ...channelSuggestions,
      ]
    }

    return channelSuggestions
  }

  if (key === "from") {
    return usernames
      .filter((user) => {
        if (!needle) {
          return true
        }
        return (
          user.userName.toLowerCase().startsWith(needle) ||
          user.displayName.toLowerCase().startsWith(needle)
        )
      })
      .slice(0, 8)
      .map((user) => ({
        id: `from:${user.userName.toLowerCase()}`,
        insert: `from:${user.userName}`,
        label: `from:${user.userName}`,
        description: user.displayName,
      }))
  }

  if (key === "role") {
    return filterSuggestions(ROLE_SUGGESTIONS, `role:${needle}`)
  }

  if (key === "has") {
    return filterSuggestions(HAS_SUGGESTIONS, `has:${needle}`)
  }

  return []
}

export function getChatSearchSuggestions({
  token,
  query,
  parsed,
  channels,
  usernames,
}: {
  token: ChatSearchToken
  query: string
  parsed: ParsedChatSearchQuery
  channels: ChatSearchKnownChannel[]
  usernames: ChatSearchUsername[]
}): ChatSearchSuggestion[] {
  if (!query.trim()) {
    return []
  }

  const negated = token.text.startsWith(CHAT_SEARCH_NEGATION_PREFIX)
  const tokenText = negated
    ? token.text.slice(CHAT_SEARCH_NEGATION_PREFIX.length)
    : token.text
  const colon = tokenText.indexOf(":")

  if (colon >= 0) {
    const suggestions = getFilterValueSuggestions({
      key: tokenText.slice(0, colon).toLowerCase(),
      value: tokenText.slice(colon + 1),
      negated,
      channels,
      usernames,
    })
    return negated ? suggestions.map(negateChatSearchSuggestion) : suggestions
  }

  if (negated) {
    return filterSuggestions(FILTER_TYPE_SUGGESTIONS, tokenText).map(
      (suggestion) => {
        const key = suggestion.insert.slice(0, -1) as ChatSearchFilterKey
        return {
          ...negateChatSearchSuggestion(suggestion),
          description: NEGATED_FILTER_TYPE_DESCRIPTIONS[key],
        }
      }
    )
  }

  if (!tokenText) {
    return parsed.keywords.length > 0 ? [] : FILTER_TYPE_SUGGESTIONS
  }

  return filterSuggestions(FILTER_TYPE_SUGGESTIONS, tokenText)
}
