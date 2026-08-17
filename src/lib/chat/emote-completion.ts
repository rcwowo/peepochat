import type { ComposerEmote } from "@/lib/chat/chat-emote-catalog"

export type EmoteSuggestion = {
  type: "emote"
  value: string
  display: string
  imageUrl: string
  provider: ComposerEmote["provider"]
}

export type EmoteReplaceRange = {
  start: number
  end: number
}

export type EmoteCompletionSearchMode = "startsWith" | "includes"

/** SevenTV Extension defaults (`chat_input.autocomplete.*`). */
export const EMOTE_COMPLETION_DEFAULTS = {
  colonSearchMode: "includes" as EmoteCompletionSearchMode,
  tabSearchMode: "startsWith" as EmoteCompletionSearchMode,
  minColonQueryLength: 2,
  maxSuggestions: 25,
} as const

const PROVIDER_SORT_PRIORITY: Record<ComposerEmote["provider"], number> = {
  twitch: 2,
  "7tv": 3,
  bttv: 4,
  ffz: 5,
}

export type EmoteCompleterState = {
  query: string
  replaceRange: EmoteReplaceRange | null
  prefixed: boolean
  current: number
  suggestions: EmoteSuggestion[]
  tab: EmoteTabCompleterState | null
}

/** Tab carousel state aligned with SevenTV `tabState` in ChatInput.vue. */
export type EmoteTabCompleterState = {
  matches: EmoteSuggestion[]
  index: number
  replaceRange: EmoteReplaceRange
  expectedWord: string
}

export function createEmoteCompleterState(): EmoteCompleterState {
  return {
    query: "",
    replaceRange: null,
    prefixed: false,
    current: 0,
    suggestions: [],
    tab: null,
  }
}

export function resetEmoteCompleter(): EmoteCompleterState {
  return createEmoteCompleterState()
}

/** Word bounds at cursor (SevenTV `getSearchRange`). */
export function getSearchRange(
  text: string,
  position: number
): EmoteReplaceRange {
  let start: number
  let end: number

  for (let index = position; ; index--) {
    if (index < 1 || (text.charAt(index - 1) === " " && index !== position)) {
      start = index
      break
    }
  }

  for (let index = position + 1; ; index++) {
    if (index > text.length || text.charAt(index - 1) === " ") {
      end = index - 1
      break
    }
  }

  return { start, end }
}

export function getWordAtCursor(
  text: string,
  cursor: number
): { word: string; start: number; end: number } | null {
  const range = getSearchRange(text, cursor)
  const word = text.slice(range.start, range.end)

  if (!word || word === " ") {
    return null
  }

  return { word, start: range.start, end: range.end }
}

function testToken(
  token: string,
  prefix: string,
  mode: EmoteCompletionSearchMode
): boolean {
  const normalized = prefix.toLowerCase()
  if (!normalized) return true

  const haystack = token.toLowerCase()
  return mode === "startsWith"
    ? haystack.startsWith(normalized)
    : haystack.includes(normalized)
}

function toSuggestion(emote: ComposerEmote): EmoteSuggestion {
  return {
    type: "emote",
    value: emote.code,
    display: emote.code,
    imageUrl: emote.imageUrl,
    provider: emote.provider,
  }
}

/** SevenTV `findMatchingTokens` sort: priority, then name. */
function sortCompletionMatches(
  left: { value: string; priority: number },
  right: { value: string; priority: number }
): number {
  if (left.priority !== right.priority) {
    return left.priority - right.priority
  }

  return left.value.localeCompare(right.value)
}

function findMatchingEmotes(
  emotes: ComposerEmote[],
  prefix: string,
  mode: EmoteCompletionSearchMode,
  limit = EMOTE_COMPLETION_DEFAULTS.maxSuggestions
): EmoteSuggestion[] {
  const used = new Set<string>()
  const matches: Array<EmoteSuggestion & { priority: number }> = []

  for (const emote of emotes) {
    const token = emote.code
    if (used.has(token) || !testToken(token, prefix, mode)) continue

    used.add(token)
    matches.push({
      ...toSuggestion(emote),
      priority: PROVIDER_SORT_PRIORITY[emote.provider],
    })
  }

  return matches
    .sort(sortCompletionMatches)
    .slice(0, limit)
    .map(({ priority: _priority, ...suggestion }) => suggestion)
}

export function findColonEmoteSuggestions(
  text: string,
  cursor: number,
  emotes: ComposerEmote[],
  options: {
    searchMode?: EmoteCompletionSearchMode
    minQueryLength?: number
  } = {}
): Pick<
  EmoteCompleterState,
  "query" | "replaceRange" | "prefixed" | "suggestions" | "current"
> {
  const searchMode =
    options.searchMode ?? EMOTE_COMPLETION_DEFAULTS.colonSearchMode
  const minQueryLength =
    options.minQueryLength ?? EMOTE_COMPLETION_DEFAULTS.minColonQueryLength

  const wordAtCursor = getWordAtCursor(text, cursor)
  if (!wordAtCursor?.word.startsWith(":")) {
    return {
      query: "",
      replaceRange: null,
      prefixed: false,
      suggestions: [],
      current: 0,
    }
  }

  const { word, start, end } = wordAtCursor
  const searchQuery = word.slice(1)

  if (searchQuery.length < minQueryLength) {
    return {
      query: word,
      replaceRange: { start, end },
      prefixed: true,
      suggestions: [],
      current: 0,
    }
  }

  const suggestions = findMatchingEmotes(emotes, searchQuery, searchMode)

  return {
    query: word,
    replaceRange: { start, end },
    prefixed: true,
    suggestions,
    current: 0,
  }
}

export function findTabEmoteMatches(
  emotes: ComposerEmote[],
  word: string,
  options: {
    searchMode?: EmoteCompletionSearchMode
  } = {}
): EmoteSuggestion[] {
  const searchMode =
    options.searchMode ?? EMOTE_COMPLETION_DEFAULTS.tabSearchMode
  const searchWord = word.endsWith(" ") ? word.slice(0, -1) : word

  if (!searchWord.trim()) {
    return []
  }

  return findMatchingEmotes(emotes, searchWord, searchMode)
}

/** New tab sequence when the word anchor moves (SevenTV path/offset guard). */
export function shouldResetTabState(
  tab: { replaceRange: EmoteReplaceRange } | null,
  replaceRange: EmoteReplaceRange | null
): boolean {
  if (!tab || !replaceRange) return true
  return tab.replaceRange.start !== replaceRange.start
}

export function isTabStateCurrent(
  tab: { replaceRange: EmoteReplaceRange; expectedWord: string } | null,
  text: string,
  cursor: number
): boolean {
  if (!tab) return false

  const { start, end } = tab.replaceRange
  if (cursor < start || cursor > end) return false

  return text.slice(start, end) === tab.expectedWord
}

export function nextSuggestionIndex(current: number, length: number): number {
  if (length === 0) return 0
  return (current + 1) % length
}

export function prevSuggestionIndex(current: number, length: number): number {
  if (length === 0) return 0
  return (current - 1 + length) % length
}

export function applyEmoteSuggestion(
  text: string,
  replaceRange: EmoteReplaceRange | null,
  display: string,
  options: { trailingSpace?: boolean } = {}
): { value: string; caret: number } {
  const trailingSpace = options.trailingSpace ?? true

  if (!replaceRange) {
    const spacer = text.length > 0 && !text.endsWith(" ") ? " " : ""
    const suffix = trailingSpace ? " " : ""
    const value = `${text}${spacer}${display}${suffix}`
    return { value, caret: value.length }
  }

  const left = text.slice(0, replaceRange.start)
  const right = text.slice(replaceRange.end)
  const suffix = trailingSpace ? " " : ""
  const value = `${left}${display}${suffix}${right}`

  return {
    value,
    caret: replaceRange.start + display.length + suffix.length,
  }
}

export function insertEmoteAtEnd(text: string, code: string): string {
  if (!text) return `${code} `
  if (text.endsWith(" ")) return `${text}${code} `
  return `${text} ${code} `
}
