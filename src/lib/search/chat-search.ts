import type { PingMatchRange } from "@/lib/highlights/highlight-rules"
import { findMessageUrls } from "@/lib/peepochat/peepochat-config"
import { textHasChatMention } from "@/lib/chat/chat-mentions"
import { isTimelineAppend } from "@/lib/chat/timeline-prefix"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import type { TwitchChatMessage } from "@/lib/twitch/twitch-chat"
import type { TwitchTimelineItem } from "@/lib/twitch/twitch-chat-types"

const FILTER_KEYS = new Set(["in", "from", "role", "has"] as const)

export const CHAT_SEARCH_FILTER_KEYS = ["in", "from", "role", "has"] as const

export type ChatSearchFilterKey = (typeof CHAT_SEARCH_FILTER_KEYS)[number]

export type ChatSearchKnownChannel = {
  login: string
  displayName: string
}

export type ChatSearchFilter = {
  key: ChatSearchFilterKey
  value: string
  start: number
  end: number
}

export type ChatSearchCommittedFilter = {
  key: ChatSearchFilterKey
  value: string
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

export type ChatSearchResult = {
  message: TwitchChatMessage
  highlightRanges: PingMatchRange[]
}

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

const HAS_SUGGESTIONS: ChatSearchSuggestion[] = [
  {
    id: "has:link",
    insert: "has:link",
    label: "has:link",
    description: "Contains a link",
  },
  {
    id: "has:emote",
    insert: "has:emote",
    label: "has:emote",
    description: "Contains an emote",
  },
  {
    id: "has:mention",
    insert: "has:mention",
    label: "has:mention",
    description: "Contains an @mention",
  },
]

function isFilterKey(value: string): value is ChatSearchFilterKey {
  return FILTER_KEYS.has(value as ChatSearchFilterKey)
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

    const colon = raw.indexOf(":", index)
    if (colon > index && colon < tokenEnd) {
      const key = raw.slice(index, colon).toLowerCase()
      if (isFilterKey(key)) {
        index = colon + 1
        const value = raw[index] === '"' ? readQuoted() : readUnquoted()
        const trimmed = value.trim()
        if (trimmed) {
          filters.push({
            key,
            value: trimmed,
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
    })),
    remainder,
  }
}

export function serializeChatSearchQuery(
  filters: ChatSearchCommittedFilter[],
  remainder: string
) {
  const filterText = filters
    .map((filter) => {
      const value = /\s/.test(filter.value) ? `"${filter.value}"` : filter.value
      return `${filter.key}:${value}`
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
  const inFilters = parsed.filters.filter((filter) => filter.key === "in")
  if (inFilters.length === 0) {
    return defaultChannelLogins.map((login) => normalizeChannelLogin(login))
  }

  if (inFilters.some((filter) => isAllChannelsSearchValue(filter.value))) {
    return channels.map((channel) => normalizeChannelLogin(channel.login))
  }

  const resolved = new Set<string>()
  for (const filter of inFilters) {
    const login = resolveChannelSearchLogin(filter.value, channels)
    if (login) {
      resolved.add(login)
    }
  }

  return [...resolved]
}

function normalizeUserFilter(value: string) {
  return value.trim().replace(/^@/, "").toLowerCase()
}

function messageMatchesFrom(message: TwitchChatMessage, value: string) {
  const needle = normalizeUserFilter(value)
  if (!needle) {
    return false
  }

  return (
    message.userName.toLowerCase() === needle ||
    message.displayName.toLowerCase() === needle
  )
}

function messageMatchesRole(message: TwitchChatMessage, value: string) {
  switch (value.trim().toLowerCase()) {
    case "mod":
    case "moderator":
      return message.flags.isModerator
    case "vip":
      return message.flags.isVip
    case "sub":
    case "subscriber":
      return message.flags.isSubscriber
    case "broadcaster":
    case "streamer":
      return message.flags.isBroadcaster
    default:
      return false
  }
}

function messageMatchesHas(message: TwitchChatMessage, value: string) {
  switch (value.trim().toLowerCase()) {
    case "link":
    case "links":
    case "url":
      return findMessageUrls(message.text).length > 0
    case "emote":
    case "emotes":
      return message.emotes.length > 0
    case "mention":
    case "mentions":
      return textHasChatMention(message.text)
    default:
      return false
  }
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

    const escaped = escapeRegExp(keyword)
    let pattern: RegExp
    try {
      pattern = new RegExp(escaped, "giu")
    } catch {
      pattern = new RegExp(escaped, "gi")
    }

    let found = false
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0
      found = true
      ranges.push({
        start,
        end: start + match[0].length,
      })
    }

    if (!found) {
      return null
    }
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

function messageMatchesFilters(
  message: TwitchChatMessage,
  parsed: ParsedChatSearchQuery
) {
  const fromFilters = parsed.filters.filter((filter) => filter.key === "from")
  if (
    fromFilters.length > 0 &&
    !fromFilters.some((filter) => messageMatchesFrom(message, filter.value))
  ) {
    return false
  }

  const roleFilters = parsed.filters.filter((filter) => filter.key === "role")
  if (
    roleFilters.length > 0 &&
    !roleFilters.some((filter) => messageMatchesRole(message, filter.value))
  ) {
    return false
  }

  const hasFilters = parsed.filters.filter((filter) => filter.key === "has")
  for (const filter of hasFilters) {
    if (!messageMatchesHas(message, filter.value)) {
      return false
    }
  }

  return true
}

export function matchChatSearchMessage(
  message: TwitchChatMessage,
  parsed: ParsedChatSearchQuery
): ChatSearchResult | null {
  if (!messageMatchesFilters(message, parsed)) {
    return null
  }

  const highlightRanges = findKeywordHighlightRanges(
    message.text,
    parsed.keywords
  )
  if (!highlightRanges) {
    return null
  }

  return { message, highlightRanges }
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

export function searchChatMessages(
  messages: TwitchChatMessage[],
  parsed: ParsedChatSearchQuery
): ChatSearchResult[] {
  if (!isChatSearchQueryActive(parsed)) {
    return []
  }

  const results: ChatSearchResult[] = []
  for (const message of messages) {
    const match = matchChatSearchMessage(message, parsed)
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
  results: ChatSearchResult[]
}

export function createChatSearchResultsCache(): ChatSearchResultsCache {
  return {
    parsed: null,
    timelines: [],
    includeDeleted: true,
    hideBlockedUsers: false,
    results: [],
  }
}

export function updateChatSearchResults(
  cache: ChatSearchResultsCache,
  input: {
    open: boolean
    parsed: ParsedChatSearchQuery
    timelines: TwitchTimelineItem[][]
    includeDeleted: boolean
    hideBlockedUsers: boolean
    isHidden?: (message: TwitchChatMessage) => boolean
  }
) {
  const {
    open,
    parsed,
    timelines,
    includeDeleted,
    hideBlockedUsers,
    isHidden,
  } = input

  if (!open || !isChatSearchQueryActive(parsed)) {
    cache.parsed = null
    cache.timelines = []
    cache.results = []
    return []
  }

  const collectOptions = { includeDeleted, isHidden }
  const canAppend =
    cache.parsed === parsed &&
    cache.includeDeleted === includeDeleted &&
    cache.hideBlockedUsers === hideBlockedUsers &&
    cache.timelines.length === timelines.length &&
    cache.timelines.every((timeline, index) => {
      const next = timelines[index]
      return (
        next === timeline || (next != null && isTimelineAppend(timeline, next))
      )
    })

  let results: ChatSearchResult[]
  if (canAppend) {
    const appended: TwitchChatMessage[] = []
    for (let index = 0; index < timelines.length; index += 1) {
      const previous = cache.timelines[index] ?? []
      const next = timelines[index] ?? []
      if (next.length <= previous.length) {
        continue
      }
      appended.push(
        ...collectChatMessagesFromEntries(
          next.slice(previous.length),
          collectOptions
        )
      )
    }
    results = mergeChatSearchResults(
      cache.results,
      searchChatMessages(appended, parsed)
    )
  } else {
    results = searchChatMessages(
      collectChatMessagesFromTimelines(timelines, collectOptions),
      parsed
    )
  }

  cache.parsed = parsed
  cache.timelines = timelines
  cache.includeDeleted = includeDeleted
  cache.hideBlockedUsers = hideBlockedUsers
  cache.results = results
  return results
}

export function collectChatMessagesFromEntries(
  entries: TwitchTimelineItem[],
  options?: {
    includeDeleted?: boolean
    isHidden?: (message: TwitchChatMessage) => boolean
  }
) {
  const includeDeleted = options?.includeDeleted ?? true
  const isHidden = options?.isHidden
  const messages: TwitchChatMessage[] = []

  for (const entry of entries) {
    if (entry.kind !== "chat") {
      continue
    }

    if (!includeDeleted && entry.message.deletedAt) {
      continue
    }

    if (isHidden?.(entry.message)) {
      continue
    }

    messages.push(entry.message)
  }

  return messages
}

export function collectChatMessagesFromTimelines(
  timelines: TwitchTimelineItem[][],
  options?: {
    includeDeleted?: boolean
    isHidden?: (message: TwitchChatMessage) => boolean
  }
) {
  const messages: TwitchChatMessage[] = []

  for (const timeline of timelines) {
    messages.push(...collectChatMessagesFromEntries(timeline, options))
  }

  return messages
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

  const tokenText = token.text
  const colon = tokenText.indexOf(":")

  if (colon >= 0) {
    const key = tokenText.slice(0, colon).toLowerCase()
    const value = stripFilterValueDecorators(tokenText.slice(colon + 1))
    const needle = value.toLowerCase()

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

      if (!needle || "*".startsWith(needle)) {
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
      return filterSuggestions(ROLE_SUGGESTIONS, tokenText).slice(0, 8)
    }

    if (key === "has") {
      return filterSuggestions(HAS_SUGGESTIONS, tokenText).slice(0, 8)
    }

    return []
  }

  if (!tokenText) {
    return parsed.keywords.length > 0 ? [] : FILTER_TYPE_SUGGESTIONS
  }

  return filterSuggestions(FILTER_TYPE_SUGGESTIONS, tokenText)
}
