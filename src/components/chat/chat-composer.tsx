import * as React from "react"
import { AlertCircleIcon } from "lucide-react"
import { toast } from "sonner"

import { ChatSuggestions } from "@/components/chat/chat-suggestions"
import { EmotePicker } from "@/components/chat/emote-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { usePeeepochat } from "@/lib/peepochat-context"
import {
  applyEmoteSuggestion,
  createEmoteCompleterState,
  findColonEmoteSuggestions,
  findTabEmoteMatches,
  getSearchRange,
  getWordAtCursor,
  insertEmoteAtEnd,
  nextSuggestionIndex,
  prevSuggestionIndex,
  resetEmoteCompleter,
  shouldResetTabState,
  type EmoteCompleterState,
  type EmoteReplaceRange,
  type EmoteSuggestion,
  type EmoteTabCompleterState,
} from "@/lib/emote-completion"

const MESSAGE_LIMIT = 500

type ChatComposerProps = {
  channelLogin: string
  joined?: boolean
}

export function ChatComposer({
  channelLogin,
  joined = true,
}: ChatComposerProps) {
  const {
    account,
    canSendChat,
    getComposerEmoteCatalog,
    ensureComposerEmotes,
    getRoomId,
    sendChatMessage,
    connectionState,
  } = usePeeepochat()

  const [value, setValue] = React.useState("")
  const [error, setError] = React.useState("")
  const [completer, setCompleter] = React.useState<EmoteCompleterState>(() =>
    createEmoteCompleterState()
  )
  const completerRef = React.useRef(completer)

  React.useLayoutEffect(() => {
    completerRef.current = completer
  })

  const inputRef = React.useRef<HTMLInputElement>(null)
  const historyRef = React.useRef<string[]>([])
  const historyIndexRef = React.useRef(-1)

  const roomId = getRoomId(channelLogin)

  React.useEffect(() => {
    if (!roomId) return
    ensureComposerEmotes(channelLogin, roomId)
  }, [channelLogin, ensureComposerEmotes, roomId])

  const catalog = getComposerEmoteCatalog(channelLogin)
  const emoteList = React.useMemo(
    () => [...catalog.byCode.values()],
    [catalog]
  )

  const showSuggestions =
    completer.prefixed && completer.suggestions.length > 0

  const disabled = !canSendChat || !joined
  const placeholder = !account
    ? "Sign in with Twitch to send messages"
    : !connectionState.connected
      ? "Connect to Twitch chat to send messages"
      : !joined
        ? `Connecting to #${channelLogin}…`
        : `Message #${channelLogin}`

  React.useEffect(() => {
    if (!error) return

    const timeout = window.setTimeout(() => setError(""), 5000)
    return () => window.clearTimeout(timeout)
  }, [error])

  const updateColonCompleter = React.useCallback(
    (text: string, cursor: number) => {
      const result = findColonEmoteSuggestions(text, cursor, emoteList)

      setCompleter((current) => ({
        ...current,
        ...result,
        tab: null,
      }))
    },
    [emoteList]
  )

  const applyTabMatch = React.useCallback(
    (
      match: EmoteSuggestion,
      replaceRange: EmoteReplaceRange,
      tabState: EmoteTabCompleterState
    ) => {
      const applied = applyEmoteSuggestion(value, replaceRange, match.display, {
        trailingSpace: true,
      })
      setValue(applied.value)

      const nextReplaceRange: EmoteReplaceRange = {
        start: replaceRange.start,
        end: replaceRange.start + match.display.length + 1,
      }

      const nextTab: EmoteTabCompleterState = {
        ...tabState,
        index: tabState.index,
        replaceRange: nextReplaceRange,
        expectedWord: `${match.display} `,
      }

      setCompleter((current) => ({
        ...current,
        query: match.display,
        replaceRange: nextReplaceRange,
        prefixed: false,
        suggestions: [],
        current: 0,
        tab: nextTab,
      }))

      requestAnimationFrame(() => {
        const el = inputRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(applied.caret, applied.caret)
      })
    },
    [value]
  )

  const completeSuggestion = React.useCallback(
    (
      suggestion: EmoteSuggestion,
      options: {
        reset?: boolean
        replaceRange?: EmoteReplaceRange | null
      } = {}
    ) => {
      const input = inputRef.current
      const cursor = input?.selectionStart ?? value.length
      const range =
        options.replaceRange ??
        completerRef.current.replaceRange ??
        getWordAtCursor(value, cursor)

      const applied = applyEmoteSuggestion(
        value,
        range,
        suggestion.display,
        { trailingSpace: true }
      )
      setValue(applied.value)

      setCompleter(
        options.reset
          ? () => resetEmoteCompleter()
          : (current) => ({
              ...current,
              query: suggestion.display,
              replaceRange: range,
              tab: null,
            })
      )

      requestAnimationFrame(() => {
        const el = inputRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(applied.caret, applied.caret)
      })
    },
    [value]
  )

  const handleTab = React.useCallback(
    (shift: boolean) => {
      const input = inputRef.current
      const cursor = input?.selectionStart ?? value.length
      const range = getSearchRange(value, cursor)
      const activeCompleter = completerRef.current

      if (cursor !== range.start) {
        const wordAtCursor = getWordAtCursor(value, cursor)
        if (!wordAtCursor) return

        if (activeCompleter.prefixed && activeCompleter.suggestions.length > 0) {
          completeSuggestion(
            activeCompleter.suggestions[activeCompleter.current]!
          )
          return
        }

        const { word, start, end } = wordAtCursor
        const replaceRange = { start, end }

        let tabState = activeCompleter.tab
        let matches: EmoteSuggestion[]
        let matchIndex = 0

        if (shouldResetTabState(tabState, replaceRange)) {
          matches = findTabEmoteMatches(emoteList, word)
          if (matches.length === 0) return

          matchIndex = 0
          tabState = {
            matches,
            index: matchIndex,
            replaceRange,
            expectedWord: word,
          }
        } else {
          matches = tabState!.matches
          matchIndex = shift
            ? prevSuggestionIndex(tabState!.index, matches.length)
            : nextSuggestionIndex(tabState!.index, matches.length)
          tabState = { ...tabState!, index: matchIndex }
        }

        applyTabMatch(matches[matchIndex]!, tabState.replaceRange, tabState)
      }
    },
    [applyTabMatch, completeSuggestion, emoteList, value]
  )

  const sendCurrentMessage = () => {
    const message = value.trim()
    if (!message) return

    if (showSuggestions) {
      completeSuggestion(completer.suggestions[completer.current]!, {
        reset: true,
      })
      return
    }

    const sent = sendChatMessage(channelLogin, message)
    if (!sent) {
      setError("Message could not be sent. Check your connection and login.")
      toast.error("Failed to send message")
      return
    }

    setValue("")
    setCompleter(createEmoteCompleterState())
    historyRef.current = [...historyRef.current, message].slice(-50)
    historyIndexRef.current = -1
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget

    if (event.key === "Tab") {
      event.preventDefault()
      handleTab(event.shiftKey)
      return
    }

    if (event.key === "ArrowUp") {
      if (showSuggestions) {
        event.preventDefault()
        setCompleter((current) => ({
          ...current,
          current: prevSuggestionIndex(
            current.current,
            current.suggestions.length
          ),
        }))
        return
      }

      if (historyRef.current.length === 0) return

      event.preventDefault()
      setCompleter((current) => ({ ...current, tab: null }))

      if (historyIndexRef.current === -1) {
        historyIndexRef.current = historyRef.current.length - 1
      } else if (historyIndexRef.current > 0) {
        historyIndexRef.current -= 1
      }

      const nextValue = historyRef.current[historyIndexRef.current] ?? ""
      setValue(nextValue)
      requestAnimationFrame(() => {
        input.setSelectionRange(nextValue.length, nextValue.length)
      })
      return
    }

    if (event.key === "ArrowDown") {
      if (showSuggestions) {
        event.preventDefault()
        setCompleter((current) => ({
          ...current,
          current: nextSuggestionIndex(
            current.current,
            current.suggestions.length
          ),
        }))
        return
      }

      if (historyIndexRef.current === -1) return

      event.preventDefault()
      setCompleter((current) => ({ ...current, tab: null }))

      if (historyIndexRef.current < historyRef.current.length - 1) {
        historyIndexRef.current += 1
        const nextValue = historyRef.current[historyIndexRef.current] ?? ""
        setValue(nextValue)
      } else {
        historyIndexRef.current = -1
        setValue("")
      }

      requestAnimationFrame(() => {
        const end = input.value.length
        input.setSelectionRange(end, end)
      })
      return
    }

    if (event.key === "Enter") {
      event.preventDefault()
      sendCurrentMessage()
      return
    }
  }

  return (
    <div className="shrink-0">
      {error ? (
        <div className="flex items-start gap-2 px-3 py-2 text-sm text-muted-foreground">
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <p>{error}</p>
        </div>
      ) : null}

      <div className="relative flex items-center gap-1 px-2 py-2">
        <ChatSuggestions
          open={showSuggestions}
          index={completer.current}
          suggestions={completer.suggestions}
          onSelect={(suggestion) =>
            completeSuggestion(suggestion, { reset: true })
          }
        />
        <Input
          ref={inputRef}
          type="text"
          value={value}
          disabled={disabled}
          maxLength={MESSAGE_LIMIT}
          placeholder={placeholder}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="h-9 flex-1 border-border/50 bg-background/40 text-sm shadow-none backdrop-blur-sm focus-visible:ring-1 focus-visible:ring-border/40 dark:bg-input/30"
          onChange={(event) => {
            const nextValue = event.target.value
            setValue(nextValue)

            const cursor =
              event.target.selectionStart ?? nextValue.length
            updateColonCompleter(nextValue, cursor)
          }}
          onKeyDown={handleKeyDown}
          onSelect={(event) => {
            const cursor = event.currentTarget.selectionStart ?? value.length
            updateColonCompleter(event.currentTarget.value, cursor)
          }}
          onClick={(event) => {
            const cursor = event.currentTarget.selectionStart ?? value.length
            updateColonCompleter(event.currentTarget.value, cursor)
          }}
        />

        <EmotePicker
          catalog={catalog}
          disabled={disabled}
          onSelect={(code) => {
            setValue((current) => insertEmoteAtEnd(current, code))
            setCompleter(createEmoteCompleterState())
            inputRef.current?.focus()
          }}
        />

        <Button
          type="button"
          size="sm"
          disabled={disabled || !value.trim()}
          onClick={sendCurrentMessage}
          className="shrink-0"
        >
          Chat
        </Button>
      </div>
    </div>
  )
}
