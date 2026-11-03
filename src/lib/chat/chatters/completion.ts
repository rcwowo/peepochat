import {
  CHATTER_COMPLETION_MAX,
  mentionTokenForChatter,
  type ChannelChatter,
} from "@/lib/chat/chatters/store"
import {
  applyEmoteSuggestion,
  getWordAtCursor,
  nextSuggestionIndex,
  prevSuggestionIndex,
  type EmoteReplaceRange,
} from "@/lib/chat/emotes/completion"

export type ChatterSuggestion = {
  type: "chatter"
  login: string
  displayName: string
  color: string | null
  nickname: string | null
  mention: string
}

export type ChatterNicknameResolver = (login: string) => string | null

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
  chatter: ChannelChatter,
  nickname: string | null = null
): ChatterSuggestion {
  return {
    type: "chatter",
    login: chatter.login,
    displayName: chatter.displayName,
    color: chatter.color,
    nickname,
    mention: nickname ?? mentionTokenForChatter(chatter),
  }
}

export function chatterMentionValue(suggestion: ChatterSuggestion): string {
  return `@${suggestion.mention}`
}

export function findAtChatterSuggestions(
  text: string,
  cursor: number,
  chatters: ChannelChatter[],
  options?: { getNicknameByLogin?: ChatterNicknameResolver }
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
    .map((chatter) =>
      toChatterSuggestion(
        chatter,
        options?.getNicknameByLogin?.(chatter.login) ?? null
      )
    )

  return {
    query: word,
    replaceRange: { start, end },
    active: true,
    suggestions,
    current: 0,
  }
}

/**
 * Chatters whose nickname matches the query prefix, ranked like nickname
 * matches take priority: exact nickname first, then most recently seen.
 */
export function findNicknameChatterMatches({
  chatters,
  query,
  nicknames,
  isBlocked,
}: {
  chatters: ChannelChatter[]
  query: string
  nicknames: Map<string, string>
  isBlocked?: (userId?: string | null, login?: string | null) => boolean
}): ChannelChatter[] {
  const needle = query.toLowerCase()
  const matches: ChannelChatter[] = []

  for (const chatter of chatters) {
    if (isBlocked?.(chatter.userId, chatter.login)) {
      continue
    }

    const nickname = nicknames.get(chatter.login.toLowerCase())
    if (!nickname) {
      continue
    }

    if (needle && !nickname.toLowerCase().startsWith(needle)) {
      continue
    }

    matches.push(chatter)
  }

  matches.sort((left, right) => {
    const leftNickname = nicknames.get(left.login.toLowerCase()) ?? ""
    const rightNickname = nicknames.get(right.login.toLowerCase()) ?? ""

    if (needle) {
      const leftExact = leftNickname === needle ? 0 : 1
      const rightExact = rightNickname === needle ? 0 : 1
      if (leftExact !== rightExact) {
        return leftExact - rightExact
      }
    }

    if (left.lastSeenAt !== right.lastSeenAt) {
      return right.lastSeenAt - left.lastSeenAt
    }

    return leftNickname.localeCompare(rightNickname, undefined, {
      sensitivity: "base",
    })
  })

  return matches
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
