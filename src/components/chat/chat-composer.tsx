import * as React from "react"
import { AlertCircleIcon, SendHorizontalIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { ChatSuggestions } from "@/components/chat/chat-suggestions"
import { EmotePicker } from "@/components/chat/emote-picker"
import { ChatReplyPreview } from "@/components/chat/chat-reply-preview"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { usePeepochat } from "@/lib/peepochat/peepochat-context"
import type { TwitchChatReply } from "@/lib/twitch/twitch-chat"
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
} from "@/lib/chat/emote-completion"

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
    isComposerEmotesLoading,
    getRoomId,
    sendChatMessage,
    connectionState,
  } = usePeepochat()

  const [value, setValue] = React.useState("")
  const [error, setError] = React.useState("")
  const [reply, setReply] = React.useState<TwitchChatReply | null>(null)
  const [completer, setCompleter] = React.useState<EmoteCompleterState>(() =>
    createEmoteCompleterState()
  )
  const completerRef = React.useRef(completer)

  React.useLayoutEffect(() => {
    completerRef.current = completer
  })

  const inputRef = React.useRef<HTMLTextAreaElement>(null)
  const historyRef = React.useRef<string[]>([])
  const historyIndexRef = React.useRef(-1)

  const roomId = getRoomId(channelLogin)

  React.useEffect(() => {
    if (!roomId) return
    ensureComposerEmotes(channelLogin, roomId)
  }, [channelLogin, ensureComposerEmotes, roomId])

  const catalog = getComposerEmoteCatalog(channelLogin)
  const emotesLoading = isComposerEmotesLoading(channelLogin)
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
        let matchIndex: number

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

  const resizeTextarea = React.useCallback(() => {
    const el = inputRef.current
    if (!el) return
    const max = 160
    el.style.height = "0px"
    const next = el.scrollHeight
    if (next > max) {
      el.style.overflowY = "auto"
      el.style.height = `${max}px`
    } else {
      el.style.overflowY = "hidden"
      el.style.height = `${Math.max(next, 36)}px`
    }
  }, [])

  React.useLayoutEffect(() => {
    resizeTextarea()
  }, [resizeTextarea, value])

  React.useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ channelLogin?: string; text?: string }>
      if (!custom.detail || custom.detail.channelLogin !== channelLogin) return
      const text = custom.detail.text ?? ""
      if (!text) return
      setValue((current) => (current ? `${current} ${text}` : text))
      setCompleter(createEmoteCompleterState())
      requestAnimationFrame(() => {
        const el = inputRef.current
        if (!el) return
        el.focus()
        const end = el.value.length
        el.setSelectionRange(end, end)
      })
    }

    window.addEventListener("peepochat:composer-insert", handler)
    return () => window.removeEventListener("peepochat:composer-insert", handler)
  }, [channelLogin])

  React.useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{
        channelLogin?: string
        reply?: TwitchChatReply | null
      }>
      if (!custom.detail || custom.detail.channelLogin !== channelLogin) return
      if (!custom.detail.reply) return
      setReply(custom.detail.reply)
      requestAnimationFrame(() => inputRef.current?.focus())
    }

    window.addEventListener("peepochat:composer-reply", handler)
    return () => window.removeEventListener("peepochat:composer-reply", handler)
  }, [channelLogin])

  const sendCurrentMessage = () => {
    const message = value.trim()
    if (!message) return

    if (showSuggestions) {
      completeSuggestion(completer.suggestions[completer.current]!, {
        reset: true,
      })
      return
    }

    const sent = sendChatMessage(channelLogin, message, reply)
    if (!sent) {
      setError("Message could not be sent. Check your connection and login.")
      toast.error("Failed to send message")
      return
    }

    setValue("")
    setReply(null)
    setCompleter(createEmoteCompleterState())
    historyRef.current = [...historyRef.current, message].slice(-50)
    historyIndexRef.current = -1
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
      if (!event.shiftKey) {
        event.preventDefault()
        sendCurrentMessage()
        return
      }
    }

    if (event.key === "Escape") {
      if (reply) {
        event.preventDefault()
        setReply(null)
      }
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

      {reply ? (
        <div className="px-2 pt-2">
          <div className="flex items-start justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-muted-foreground">
                Replying to
              </div>
              <ChatReplyPreview reply={reply} />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Cancel reply"
              className="mt-0.5 text-muted-foreground hover:text-foreground"
              onClick={() => setReply(null)}
            >
              <XIcon className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : null}

      <div className="relative flex items-end gap-1 px-2 py-2">
        <div className="relative min-w-0 flex-1">
          <ChatSuggestions
            open={showSuggestions}
            index={completer.current}
            suggestions={completer.suggestions}
            onSelect={(suggestion) =>
              completeSuggestion(suggestion, { reset: true })
            }
          />
          <Textarea
            ref={inputRef}
            value={value}
            disabled={disabled}
            maxLength={MESSAGE_LIMIT}
            placeholder={placeholder}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            rows={1}
            className="min-h-9 max-h-40 resize-none overflow-y-hidden border-border/50 bg-background/40 py-2 pr-10 text-sm leading-5 shadow-none backdrop-blur-sm field-sizing-fixed focus-visible:ring-1 focus-visible:ring-border/40 dark:bg-input/30"
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
            loading={emotesLoading}
            disabled={disabled}
            onSelect={(code) => {
              setValue((current) => insertEmoteAtEnd(current, code))
              setCompleter(createEmoteCompleterState())
              inputRef.current?.focus()
            }}
          />
        </div>

        <Button
          type="button"
          size="icon-lg"
          disabled={disabled || !value.trim()}
          aria-label="Send chat message"
          onClick={sendCurrentMessage}
          className="shrink-0"
        >
          <SendHorizontalIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}
