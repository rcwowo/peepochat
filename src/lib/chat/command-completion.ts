import {
  CHAT_COMMAND_DEFINITIONS,
  KNOWN_CHAT_COMMANDS,
  resolveCommandDefinition,
  type ChatCommandDefinition,
} from "@/lib/chat/chat-command-definitions"
import { parseSlashCommand } from "@/lib/chat/chat-command-parse"
import {
  nextSuggestionIndex,
  prevSuggestionIndex,
  type EmoteReplaceRange,
} from "@/lib/chat/emote-completion"

export type { ChatCommandDefinition } from "@/lib/chat/chat-command-definitions"
export {
  ANNOUNCEMENT_COLORS,
  ANNOUNCEMENT_COLOR_SET,
  CHAT_COMMAND_DEFINITIONS,
  KNOWN_CHAT_COMMANDS,
} from "@/lib/chat/chat-command-definitions"

export type CommandSuggestion = {
  type: "command"
  name: string
  display: string
  usage: string
  description: string
}

export type CommandCompleterState = {
  query: string
  replaceRange: EmoteReplaceRange | null
  active: boolean
  current: number
  suggestions: CommandSuggestion[]
  usageHint: string | null
  usageHintDetail: string | null
}

export function createCommandCompleterState(): CommandCompleterState {
  return {
    query: "",
    replaceRange: null,
    active: false,
    current: 0,
    suggestions: [],
    usageHint: null,
    usageHintDetail: null,
  }
}

function toSuggestion(command: ChatCommandDefinition): CommandSuggestion {
  return {
    type: "command",
    name: command.name,
    display: `/${command.name}`,
    usage: command.usage,
    description: command.description,
  }
}

function getCommandTokenRange(
  text: string,
  cursor: number
): EmoteReplaceRange | null {
  if (!text.startsWith("/")) {
    return null
  }

  const firstSpace = text.indexOf(" ")
  const end = firstSpace === -1 ? text.length : firstSpace

  if (cursor > end) {
    return null
  }

  return { start: 0, end }
}

export function findCommandSuggestions(
  text: string,
  cursor: number
): Pick<
  CommandCompleterState,
  | "query"
  | "replaceRange"
  | "active"
  | "suggestions"
  | "current"
  | "usageHint"
  | "usageHintDetail"
> {
  if (!text.startsWith("/")) {
    return {
      query: "",
      replaceRange: null,
      active: false,
      suggestions: [],
      current: 0,
      usageHint: null,
      usageHintDetail: null,
    }
  }

  const tokenRange = getCommandTokenRange(text, cursor)
  if (!tokenRange) {
    const parsed = parseSlashCommand(text)
    const matched = parsed?.name ? resolveCommandDefinition(parsed.name) : null
    if (!matched) {
      return {
        query: "",
        replaceRange: null,
        active: false,
        suggestions: [],
        current: 0,
        usageHint: null,
        usageHintDetail: null,
      }
    }

    const usageHint = matched.usage
      ? `Usage: /${matched.name} ${matched.usage}`
      : `Usage: /${matched.name}`

    return {
      query: `/${matched.name}`,
      replaceRange: null,
      active: true,
      suggestions: [],
      current: 0,
      usageHint,
      usageHintDetail: matched.usageDetail ?? null,
    }
  }

  const token = text.slice(tokenRange.start, tokenRange.end)
  const query = token.slice(1).toLowerCase()

  const suggestions = CHAT_COMMAND_DEFINITIONS.flatMap((command) => {
    if (!query) {
      return [toSuggestion(command)]
    }

    if (command.name.startsWith(query)) {
      return [toSuggestion(command)]
    }

    if (command.aliases?.some((alias) => alias.startsWith(query))) {
      return [toSuggestion(command)]
    }

    return []
  })

  return {
    query: token,
    replaceRange: tokenRange,
    active: true,
    suggestions,
    current: 0,
    usageHint: null,
    usageHintDetail: null,
  }
}

/** True when Enter/Tab should autocomplete the command name instead of submitting. */
export function shouldCompleteCommandOnSubmit(
  text: string,
  state: Pick<CommandCompleterState, "replaceRange" | "suggestions">
): boolean {
  if (!state.replaceRange || state.suggestions.length === 0) {
    return false
  }

  const token = text.slice(state.replaceRange.start, state.replaceRange.end)
  if (!token.startsWith("/")) {
    return false
  }

  const name = token.slice(1).toLowerCase()
  if (KNOWN_CHAT_COMMANDS.has(name)) {
    return false
  }

  return true
}

export function applyCommandSuggestion(
  _text: string,
  _replaceRange: EmoteReplaceRange,
  suggestion: CommandSuggestion
): { value: string; caret: number } {
  const next = `/${suggestion.name} `
  return { value: next, caret: next.length }
}

export function getCommandSuggestionIndices(
  current: number,
  length: number,
  direction: "next" | "prev"
): number {
  return direction === "next"
    ? nextSuggestionIndex(current, length)
    : prevSuggestionIndex(current, length)
}

/** Suppress colon emote completion while typing a slash command. */
export function shouldSuppressEmoteCompletion(text: string): boolean {
  return text.startsWith("/")
}
