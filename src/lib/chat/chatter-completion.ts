import {
  CHATTER_COMPLETION_MAX,
  mentionTokenForChatter,
  type ChannelChatter,
} from "@/lib/chat/chatter-store"
import {
  applyEmoteSuggestion,
  getWordAtCursor,
  nextSuggestionIndex,
  prevSuggestionIndex,
  type EmoteReplaceRange,
} from "@/lib/chat/emote-completion"

export type ChatterSuggestion = {
  type: "chatter"
  login: string
  displayName: string
  color: string | null
  mention: string
}

export type ChatterTabCompleterState = {
  matches: ChatterSuggestion[]
  index: number
  replaceRange: EmoteReplaceRange
  expectedWord: string
}

export type ChatterCompleterState = {
  query: string
  replaceRange: EmoteReplaceRange | null
  active: boolean
  current: number
  suggestions: ChatterSuggestion[]
  tab: ChatterTabCompleterState | null
}

export function createChatterCompleterState(): ChatterCompleterState {
  return {
    query: "",
    replaceRange: null,
    active: false,
    current: 0,
    suggestions: [],
    tab: null,
  }
}

export function resetChatterCompleter(): ChatterCompleterState {
  return createChatterCompleterState()
}

export function toChatterSuggestion(
  chatter: ChannelChatter
): ChatterSuggestion {
  return {
    type: "chatter",
    login: chatter.login,
    displayName: chatter.displayName,
    color: chatter.color,
    mention: mentionTokenForChatter(chatter),
  }
}

export function chatterMentionValue(suggestion: ChatterSuggestion): string {
  return `@${suggestion.mention}`
}

export function findAtChatterSuggestions(
  text: string,
  cursor: number,
  chatters: ChannelChatter[]
): Pick<
  ChatterCompleterState,
  "query" | "replaceRange" | "active" | "suggestions" | "current"
> {
  const wordAtCursor = getWordAtCursor(text, cursor)
  if (!wordAtCursor?.word.startsWith("@")) {
    return {
      query: "",
      replaceRange: null,
      active: false,
      suggestions: [],
      current: 0,
    }
  }

  const { word, start, end } = wordAtCursor
  const suggestions = chatters
    .slice(0, CHATTER_COMPLETION_MAX)
    .map(toChatterSuggestion)

  return {
    query: word,
    replaceRange: { start, end },
    active: true,
    suggestions,
    current: 0,
  }
}

export function applyChatterSuggestion(
  text: string,
  replaceRange: EmoteReplaceRange | null,
  suggestion: ChatterSuggestion
): { value: string; caret: number } {
  return applyEmoteSuggestion(
    text,
    replaceRange,
    chatterMentionValue(suggestion),
    { trailingSpace: true }
  )
}

export function getChatterSuggestionIndices(
  current: number,
  length: number,
  direction: "next" | "prev"
): number {
  return direction === "next"
    ? nextSuggestionIndex(current, length)
    : prevSuggestionIndex(current, length)
}
