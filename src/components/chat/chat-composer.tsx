import * as React from "react"
import { SendHorizontalIcon } from "lucide-react"

import { ChatSuggestions } from "@/components/chat/chat-suggestions"
import { ChatterSuggestions } from "@/components/chat/chatter-suggestions"
import { CommandSuggestions } from "@/components/chat/command-suggestions"
import { ComposerNoticeBanner } from "@/components/chat/composer-notice-banner"
import { EmotePicker } from "@/components/chat/emote-picker"
import { ChatReplyThreadTray } from "@/components/chat/chat-reply-thread-tray"
import { useChannelRoom } from "@/hooks/chat-ui/use-channel-room"
import { useUserCardContext } from "@/hooks/twitch/use-user-card-context"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { usePeepochat } from "@/lib/peepochat/peepochat-context"
import { buildReplyThread } from "@/lib/chat/reply-threads"
import { CHAT_RATE_LIMIT_MESSAGES } from "@/lib/chat/chat-send"
import {
  isAutomodHoldNoticeText,
  isPersistentSendBlockText,
  isTimeoutComposerNoticeText,
} from "@/lib/chat/chat-send-notice"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import type { TwitchChatReply } from "@/lib/twitch/twitch-chat"
import {
  BLOCKED_USER_DISPLAY_NAME,
  maskReplyForBlockedUser,
} from "@/lib/twitch/blocked-users"
import {
  applyEmoteSuggestion,
  createEmoteCompleterState,
  findColonEmoteSuggestions,
  findTabEmoteMatches,
  getSearchRange,
  getWordAtCursor,
  insertEmoteAtEnd,
  isTabStateCurrent,
  nextSuggestionIndex,
  prevSuggestionIndex,
  resetEmoteCompleter,
  shouldResetTabState,
  type EmoteCompleterState,
  type EmoteReplaceRange,
  type EmoteSuggestion,
  type EmoteTabCompleterState,
} from "@/lib/chat/emote-completion"
import {
  applyChatterSuggestion,
  chatterMentionValue,
  createChatterCompleterState,
  findAtChatterSuggestions,
  getChatterSuggestionIndices,
  resetChatterCompleter,
  toChatterSuggestion,
  type ChatterCompleterState,
  type ChatterSuggestion,
  type ChatterTabCompleterState,
} from "@/lib/chat/chatter-completion"
import {
  applyCommandSuggestion,
  createCommandCompleterState,
  findCommandSuggestions,
  getCommandSuggestionIndices,
  shouldCompleteCommandOnSubmit,
  shouldSuppressEmoteCompletion,
  type CommandCompleterState,
  type CommandSuggestion,
} from "@/lib/chat/command-completion"

const MESSAGE_LIMIT = 500

type ComposerNotice = {
  id: string
  message: string
}

type ChatComposerProps = {
  channelLogin: string
  joined?: boolean
  onLayoutChange?: () => void
}

export function ChatComposer({
  channelLogin,
  joined = true,
  onLayoutChange,
}: ChatComposerProps) {
  const {
    account,
    canSendChat,
    getComposerEmoteCatalog,
    ensureComposerEmotes,
    isComposerEmotesLoading,
    getRoomId,
    sendChatMessage,
    sendActionMessage,
    executeChatCommand,
    connectionState,
    getChannelSendBlock,
    registerSendOutcomeListener,
    replayPendingComposerNotice,
    dismissComposerNotice,
    hideBlockedUsers,
    isUserBlocked,
    searchChatters,
    visibleChannelLogins,
    getBadgeCatalog,
    getMemberBadge,
    hasBadgeSupport,
    config,
  } = usePeepochat()
  const showTwitchBadges = config.chat.badges.twitchEnabled
  const showMemberBadges = config.chat.badges.owoMemberEnabled
  const badgeCatalog = getBadgeCatalog(channelLogin)

  const userCardContext = useUserCardContext()
  const chatVisible = visibleChannelLogins.some(
    (login) =>
      normalizeChannelLogin(login) === normalizeChannelLogin(channelLogin)
  )

  const [value, setValue] = React.useState("")
  const [notices, setNotices] = React.useState<ComposerNotice[]>([])
  const [noticesChannel, setNoticesChannel] = React.useState(channelLogin)
  const [rateLimitHint, setRateLimitHint] = React.useState<string | null>(null)
  const noticeIdRef = React.useRef(0)

  if (noticesChannel !== channelLogin) {
    setNoticesChannel(channelLogin)
    setNotices([])
  }

  const pushNotice = React.useCallback((notice: ComposerNotice) => {
    setNotices((current) => {
      if (current.some((entry) => entry.id === notice.id)) {
        return current
      }
      return [...current, notice]
    })
  }, [])

  const dismissFrontNotice = React.useCallback(() => {
    const front = notices[0]
    if (!front) {
      return
    }
    dismissComposerNotice({ channel: channelLogin, id: front.id })
  }, [channelLogin, dismissComposerNotice, notices])

  const dismissNoticeById = React.useCallback((id: string) => {
    setNotices((current) => current.filter((entry) => entry.id !== id))
  }, [])

  const [reply, setReply] = React.useState<TwitchChatReply | null>(null)
  const room = useChannelRoom(channelLogin)
  const replyThread = React.useMemo(() => {
    if (!reply) {
      return null
    }
    const displayReply =
      hideBlockedUsers && isUserBlocked(null, reply.parentUserName)
        ? maskReplyForBlockedUser(reply)
        : reply
    const thread = buildReplyThread(room?.timeline ?? [], displayReply)
    if (
      !hideBlockedUsers ||
      thread.root.kind !== "snapshot" ||
      !isUserBlocked(null, thread.root.userName)
    ) {
      return thread
    }
    return {
      ...thread,
      root: {
        ...thread.root,
        displayName: BLOCKED_USER_DISPLAY_NAME,
        color: null,
      },
    }
  }, [hideBlockedUsers, isUserBlocked, reply, room?.timeline])
  const [completer, setCompleter] = React.useState<EmoteCompleterState>(() =>
    createEmoteCompleterState()
  )
  const [commandCompleter, setCommandCompleter] =
    React.useState<CommandCompleterState>(() => createCommandCompleterState())
  const [chatterCompleter, setChatterCompleter] =
    React.useState<ChatterCompleterState>(() => createChatterCompleterState())
  const completerRef = React.useRef(completer)
  const commandCompleterRef = React.useRef(commandCompleter)
  const chatterCompleterRef = React.useRef(chatterCompleter)

  React.useLayoutEffect(() => {
    completerRef.current = completer
  })

  React.useLayoutEffect(() => {
    commandCompleterRef.current = commandCompleter
  })

  React.useLayoutEffect(() => {
    chatterCompleterRef.current = chatterCompleter
  })

  const inputRef = React.useRef<HTMLTextAreaElement>(null)
  const historyRef = React.useRef<string[]>([])
  const historyIndexRef = React.useRef(-1)
  const commandSubmitRef = React.useRef(0)
  const commandPendingRef = React.useRef(false)
  const pendingSendRef = React.useRef<{
    composerMessage: string
    sentText: string
    isAction: boolean
    reply: TwitchChatReply | null
    timeoutId: number
  } | null>(null)
  const [syncedChannelLogin, setSyncedChannelLogin] =
    React.useState(channelLogin)
  const [commandPending, setCommandPending] = React.useState(false)

  if (channelLogin !== syncedChannelLogin) {
    setSyncedChannelLogin(channelLogin)
    setCommandPending(false)
  }

  React.useEffect(() => {
    commandPendingRef.current = false
    const submitRef = commandSubmitRef
    return () => {
      submitRef.current += 1
    }
  }, [channelLogin, commandSubmitRef])

  const roomId = getRoomId(channelLogin)

  React.useEffect(() => {
    if (!roomId) return
    ensureComposerEmotes(channelLogin, roomId)
  }, [channelLogin, ensureComposerEmotes, roomId])

  const catalog = getComposerEmoteCatalog(channelLogin)
  const emotesLoading = isComposerEmotesLoading(channelLogin)
  const sendBlock = getChannelSendBlock(channelLogin)
  const emoteList = React.useMemo(() => [...catalog.byCode.values()], [catalog])

  const showEmoteSuggestions =
    !shouldSuppressEmoteCompletion(value) &&
    completer.prefixed &&
    completer.suggestions.length > 0

  const showChatterSuggestions =
    chatterCompleter.active && chatterCompleter.suggestions.length > 0

  const showCommandSuggestions =
    commandCompleter.active &&
    (commandCompleter.suggestions.length > 0 ||
      Boolean(commandCompleter.usageHint) ||
      Boolean(commandCompleter.usageHintDetail))

  const shouldCompleteCommand = shouldCompleteCommandOnSubmit(
    value,
    commandCompleter
  )

  const disabled =
    !canSendChat || !joined || commandPending || sendBlock?.kind === "ban"
  const activeNotice = sendBlock?.kind === "ban" ? null : (notices[0] ?? null)
  const placeholder = !account
    ? "Sign in with Twitch to send messages"
    : sendBlock?.kind === "ban"
      ? sendBlock.message
      : !connectionState.connected
        ? "Connect to Twitch chat to send messages"
        : !joined
          ? `Connecting to #${channelLogin}…`
          : `Message #${channelLogin}`

  React.useEffect(() => {
    if (!rateLimitHint) return

    const timeout = window.setTimeout(() => setRateLimitHint(null), 3000)
    return () => window.clearTimeout(timeout)
  }, [rateLimitHint])

  const clearPendingSend = React.useCallback(() => {
    const pending = pendingSendRef.current
    if (!pending) return

    window.clearTimeout(pending.timeoutId)
    pendingSendRef.current = null
  }, [])

  const clearComposerUI = React.useCallback(() => {
    setValue("")
    setReply(null)
    setRateLimitHint(null)
    setCompleter(createEmoteCompleterState())
    setCommandCompleter(createCommandCompleterState())
    setChatterCompleter(createChatterCompleterState())
  }, [])

  const clearComposerAfterSend = React.useCallback(
    (message: string) => {
      clearPendingSend()
      clearComposerUI()
      historyRef.current = [...historyRef.current, message].slice(-50)
      historyIndexRef.current = -1
    },
    [clearComposerUI, clearPendingSend]
  )

  const handleSendResult = React.useCallback(
    (
      result: import("@/lib/chat/chat-send").ChatSendResult,
      composerMessage: string,
      options: {
        sentText?: string
        isAction?: boolean
        reply?: TwitchChatReply | null
      } = {}
    ) => {
      const sentText = (options.sentText ?? composerMessage)
        .replace(/\r?\n/g, " ")
        .trim()
      const isAction = options.isAction ?? false
      const replySnapshot = options.reply ?? null

      if (result.ok) {
        clearPendingSend()
        clearComposerUI()
        historyRef.current = [...historyRef.current, composerMessage].slice(-50)
        historyIndexRef.current = -1

        const timeoutId = window.setTimeout(() => {
          clearPendingSend()
        }, 8_000)
        pendingSendRef.current = {
          composerMessage,
          sentText,
          isAction,
          reply: replySnapshot,
          timeoutId,
        }
        return
      }

      if (result.reason === "too_fast" || result.reason === "too_many") {
        setRateLimitHint(CHAT_RATE_LIMIT_MESSAGES[result.reason])
        return
      }

      if (result.reason === "blocked") {
        noticeIdRef.current += 1
        pushNotice({
          id: `blocked:${noticeIdRef.current}`,
          message:
            result.message ?? "You cannot send messages in this channel.",
        })
        return
      }

      noticeIdRef.current += 1
      pushNotice({
        id: `send-error:${noticeIdRef.current}`,
        message:
          result.message ??
          "Message could not be sent. Check your connection and login.",
      })
    },
    [clearComposerUI, clearPendingSend, pushNotice]
  )

  React.useEffect(() => {
    return registerSendOutcomeListener(
      (event) => {
        const normalizedChannel = normalizeChannelLogin(channelLogin)

        if (event.type === "dismiss-notice") {
          if (normalizeChannelLogin(event.channel) !== normalizedChannel) {
            return
          }
          dismissNoticeById(event.id)
          return
        }

        if (event.type === "notice") {
          if (normalizeChannelLogin(event.channel) !== normalizedChannel) {
            return
          }

          if (event.discardPending) {
            clearPendingSend()
          }

          if (isAutomodHoldNoticeText(event.message)) {
            setNotices((current) => {
              const withoutAutomod = current.filter(
                (entry) => !isAutomodHoldNoticeText(entry.message)
              )
              if (withoutAutomod.some((entry) => entry.id === event.id)) {
                return withoutAutomod
              }
              return [
                ...withoutAutomod,
                { id: event.id, message: event.message },
              ]
            })
            return
          }

          if (isTimeoutComposerNoticeText(event.message)) {
            setNotices((current) => {
              const withoutTimeout = current.filter(
                (entry) => !isTimeoutComposerNoticeText(entry.message)
              )
              if (withoutTimeout.some((entry) => entry.id === event.id)) {
                return withoutTimeout
              }
              return [
                ...withoutTimeout,
                { id: event.id, message: event.message },
              ]
            })
            return
          }

          pushNotice({
            id: event.id,
            message: event.message,
          })
          return
        }

        if (event.type === "rejected") {
          if (normalizeChannelLogin(event.channel) !== normalizedChannel) {
            return
          }

          const pending = pendingSendRef.current
          clearPendingSend()

          if (pending) {
            setValue(pending.composerMessage)
            setReply(pending.reply)
          }

          if (isTimeoutComposerNoticeText(event.message)) {
            if (!pending) {
              return
            }
            noticeIdRef.current += 1
            const noticeId = `rejected-timeout:${noticeIdRef.current}`
            setNotices((current) => {
              const withoutTimeout = current.filter(
                (entry) => !isTimeoutComposerNoticeText(entry.message)
              )
              return [
                ...withoutTimeout,
                { id: noticeId, message: event.message },
              ]
            })
            return
          }

          if (isPersistentSendBlockText(event.message)) {
            return
          }

          if (isAutomodHoldNoticeText(event.message)) {
            setNotices((current) => {
              if (
                current.some((entry) => isAutomodHoldNoticeText(entry.message))
              ) {
                return current
              }
              noticeIdRef.current += 1
              return [
                ...current,
                {
                  id: `rejected-automod:${noticeIdRef.current}`,
                  message: event.message,
                },
              ]
            })
            return
          }

          noticeIdRef.current += 1
          pushNotice({
            id: `rejected:${noticeIdRef.current}`,
            message: event.message,
          })
          return
        }

        const pending = pendingSendRef.current
        if (!pending) {
          return
        }

        if (
          normalizeChannelLogin(event.message.channel) !== normalizedChannel
        ) {
          return
        }

        if (event.message.text !== pending.sentText) {
          return
        }

        if (event.message.flags.isAction !== pending.isAction) {
          return
        }

        clearPendingSend()
      },
      { channel: channelLogin }
    )
  }, [
    channelLogin,
    clearPendingSend,
    dismissNoticeById,
    pushNotice,
    registerSendOutcomeListener,
  ])

  React.useEffect(() => {
    if (!chatVisible) {
      return
    }
    replayPendingComposerNotice(channelLogin)
  }, [channelLogin, chatVisible, replayPendingComposerNotice])

  React.useEffect(() => {
    clearPendingSend()
  }, [channelLogin, clearPendingSend])

  const updateColonCompleter = React.useCallback(
    (text: string, cursor: number) => {
      if (shouldSuppressEmoteCompletion(text)) {
        setCompleter((current) => ({
          ...current,
          query: "",
          replaceRange: null,
          prefixed: false,
          suggestions: [],
          current: 0,
          tab: null,
        }))
        return
      }

      const result = findColonEmoteSuggestions(text, cursor, emoteList)

      setCompleter((current) => ({
        ...current,
        ...result,
        tab: isTabStateCurrent(current.tab, text, cursor) ? current.tab : null,
      }))
    },
    [emoteList]
  )

  const updateCommandCompleter = React.useCallback(
    (text: string, cursor: number) => {
      const result = findCommandSuggestions(text, cursor)
      setCommandCompleter((current) => ({
        ...current,
        ...result,
      }))
    },
    []
  )

  const updateChatterCompleter = React.useCallback(
    (text: string, cursor: number) => {
      const wordAtCursor = getWordAtCursor(text, cursor)
      if (!wordAtCursor?.word.startsWith("@")) {
        setChatterCompleter((current) => ({
          ...resetChatterCompleter(),
          tab: isTabStateCurrent(current.tab, text, cursor)
            ? current.tab
            : null,
        }))
        return
      }

      const query = wordAtCursor.word.endsWith(" ")
        ? wordAtCursor.word.slice(1, -1)
        : wordAtCursor.word.slice(1)
      const chatters = searchChatters(channelLogin, query, {
        isBlocked: hideBlockedUsers ? isUserBlocked : undefined,
      })
      const result = findAtChatterSuggestions(text, cursor, chatters)

      setChatterCompleter((current) => {
        const tab = isTabStateCurrent(current.tab, text, cursor)
          ? current.tab
          : null
        if (tab) {
          return {
            ...current,
            query: wordAtCursor.word,
            replaceRange: { start: wordAtCursor.start, end: wordAtCursor.end },
            active: true,
            suggestions: tab.matches,
            current: tab.index,
            tab,
          }
        }

        return {
          ...current,
          ...result,
          tab: null,
        }
      })
    },
    [channelLogin, hideBlockedUsers, isUserBlocked, searchChatters]
  )

  const updateCompleters = React.useCallback(
    (text: string, cursor: number) => {
      updateCommandCompleter(text, cursor)
      updateChatterCompleter(text, cursor)
      updateColonCompleter(text, cursor)
    },
    [updateChatterCompleter, updateColonCompleter, updateCommandCompleter]
  )

  const completeChatterSuggestion = React.useCallback(
    (
      suggestion: ChatterSuggestion,
      options: {
        reset?: boolean
        replaceRange?: EmoteReplaceRange | null
      } = {}
    ) => {
      const input = inputRef.current
      const cursor = input?.selectionStart ?? value.length
      const range =
        options.replaceRange ??
        chatterCompleterRef.current.replaceRange ??
        getWordAtCursor(value, cursor)

      const applied = applyChatterSuggestion(value, range, suggestion)
      setValue(applied.value)
      setChatterCompleter(
        options.reset
          ? () => resetChatterCompleter()
          : (current) => ({
              ...current,
              query: chatterMentionValue(suggestion),
              replaceRange: range,
              tab: null,
            })
      )
      setCompleter((current) => ({ ...current, tab: null }))

      requestAnimationFrame(() => {
        const el = inputRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(applied.caret, applied.caret)
      })
    },
    [value]
  )

  const applyChatterTabMatch = React.useCallback(
    (
      match: ChatterSuggestion,
      replaceRange: EmoteReplaceRange,
      tabState: ChatterTabCompleterState
    ) => {
      const applied = applyChatterSuggestion(value, replaceRange, match)
      setValue(applied.value)

      const mention = chatterMentionValue(match)
      const nextReplaceRange: EmoteReplaceRange = {
        start: replaceRange.start,
        end: replaceRange.start + mention.length + 1,
      }

      const nextTab: ChatterTabCompleterState = {
        ...tabState,
        index: tabState.index,
        replaceRange: nextReplaceRange,
        expectedWord: `${mention} `,
      }

      setChatterCompleter((current) => ({
        ...current,
        query: mention,
        replaceRange: nextReplaceRange,
        active: true,
        suggestions: tabState.matches,
        current: tabState.index,
        tab: nextTab,
      }))
      setCompleter((current) => ({ ...current, tab: null }))

      requestAnimationFrame(() => {
        const el = inputRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(applied.caret, applied.caret)
      })
    },
    [value]
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

  const completeCommandSuggestion = React.useCallback(
    (suggestion: CommandSuggestion) => {
      const range = commandCompleterRef.current.replaceRange
      if (!range) return

      const applied = applyCommandSuggestion(value, range, suggestion)
      setValue(applied.value)
      setCommandCompleter(createCommandCompleterState())
      updateCommandCompleter(applied.value, applied.caret)

      requestAnimationFrame(() => {
        const el = inputRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(applied.caret, applied.caret)
      })
    },
    [updateCommandCompleter, value]
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

      const applied = applyEmoteSuggestion(value, range, suggestion.display, {
        trailingSpace: true,
      })
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
      const activeCommandCompleter = commandCompleterRef.current
      if (shouldCompleteCommandOnSubmit(value, activeCommandCompleter)) {
        const suggestion =
          activeCommandCompleter.suggestions[activeCommandCompleter.current]
        if (suggestion) {
          completeCommandSuggestion(suggestion)
        }
        return
      }

      const input = inputRef.current
      const cursor = input?.selectionStart ?? value.length
      const range = getSearchRange(value, cursor)
      const activeCompleter = completerRef.current

      if (cursor !== range.start) {
        const wordAtCursor = getWordAtCursor(value, cursor)
        if (!wordAtCursor) return

        if (wordAtCursor.word.startsWith("@")) {
          const { word, start, end } = wordAtCursor
          const replaceRange = { start, end }
          const activeChatterCompleter = chatterCompleterRef.current

          let tabState = activeChatterCompleter.tab
          let matches: ChatterSuggestion[]
          let matchIndex: number

          if (shouldResetTabState(tabState, replaceRange)) {
            matches =
              activeChatterCompleter.suggestions.length > 0
                ? activeChatterCompleter.suggestions
                : searchChatters(
                    channelLogin,
                    word.endsWith(" ") ? word.slice(1, -1) : word.slice(1),
                    {
                      isBlocked: hideBlockedUsers ? isUserBlocked : undefined,
                    }
                  ).map(toChatterSuggestion)
            if (matches.length === 0) return

            matchIndex = Math.min(
              activeChatterCompleter.current,
              matches.length - 1
            )
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

          applyChatterTabMatch(
            matches[matchIndex]!,
            tabState.replaceRange,
            tabState
          )
          return
        }

        if (
          activeCompleter.prefixed &&
          activeCompleter.suggestions.length > 0
        ) {
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
    [
      applyChatterTabMatch,
      applyTabMatch,
      channelLogin,
      completeCommandSuggestion,
      completeSuggestion,
      emoteList,
      hideBlockedUsers,
      isUserBlocked,
      searchChatters,
      value,
    ]
  )

  const onLayoutChangeRef = React.useRef(onLayoutChange)
  React.useLayoutEffect(() => {
    onLayoutChangeRef.current = onLayoutChange
  }, [onLayoutChange])

  const resizeTextarea = React.useCallback(() => {
    const el = inputRef.current
    if (!el) return
    const max = 160
    onLayoutChangeRef.current?.()
    el.style.height = "0px"
    const next = el.scrollHeight
    if (next > max) {
      el.style.overflowY = "auto"
      el.style.height = `${max}px`
    } else {
      el.style.overflowY = "hidden"
      el.style.height = `${Math.max(next, 36)}px`
    }
    onLayoutChangeRef.current?.()
  }, [])

  React.useLayoutEffect(() => {
    resizeTextarea()
  }, [resizeTextarea, value, placeholder])

  React.useLayoutEffect(() => {
    onLayoutChangeRef.current?.()
  }, [replyThread])

  React.useLayoutEffect(() => {
    const el = inputRef.current
    if (!el || typeof ResizeObserver === "undefined") return

    let observedWidth = el.getBoundingClientRect().width
    resizeTextarea()

    const observer = new ResizeObserver(([entry]) => {
      const nextWidth =
        entry?.contentRect.width ?? el.getBoundingClientRect().width
      if (nextWidth === observedWidth) return

      observedWidth = nextWidth
      resizeTextarea()
    })

    observer.observe(el)

    return () => {
      observer.disconnect()
    }
  }, [resizeTextarea])

  React.useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{
        channelLogin?: string
        text?: string
      }>
      if (!custom.detail || custom.detail.channelLogin !== channelLogin) return
      const text = custom.detail.text ?? ""
      if (!text) return
      setValue((current) => (current ? `${current} ${text}` : text))
      setCompleter(createEmoteCompleterState())
      setCommandCompleter(createCommandCompleterState())
      setChatterCompleter(createChatterCompleterState())
      requestAnimationFrame(() => {
        const el = inputRef.current
        if (!el) return
        el.focus()
        const end = el.value.length
        el.setSelectionRange(end, end)
      })
    }

    window.addEventListener("peepochat:composer-insert", handler)
    return () =>
      window.removeEventListener("peepochat:composer-insert", handler)
  }, [channelLogin])

  React.useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{
        channelLogin?: string
        messageId?: string
      }>
      if (!custom.detail || custom.detail.channelLogin !== channelLogin) return
      if (!custom.detail.messageId) return

      setReply((current) =>
        current?.parentMessageId === custom.detail?.messageId ? null : current
      )
    }

    window.addEventListener("peepochat:message-deleted", handler)
    return () =>
      window.removeEventListener("peepochat:message-deleted", handler)
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

    if (showChatterSuggestions) {
      completeChatterSuggestion(
        chatterCompleter.suggestions[chatterCompleter.current]!,
        { reset: true }
      )
      return
    }

    if (showEmoteSuggestions) {
      completeSuggestion(completer.suggestions[completer.current]!, {
        reset: true,
      })
      return
    }

    if (shouldCompleteCommand) {
      const suggestion = commandCompleter.suggestions[commandCompleter.current]
      if (suggestion) {
        completeCommandSuggestion(suggestion)
      }
      return
    }

    if (message.startsWith("/")) {
      if (commandPendingRef.current) {
        return
      }

      const submitId = ++commandSubmitRef.current
      commandPendingRef.current = true
      setCommandPending(true)

      void executeChatCommand(channelLogin, message).then((result) => {
        if (submitId !== commandSubmitRef.current) {
          return
        }

        commandPendingRef.current = false
        setCommandPending(false)

        if (!result.handled) {
          return
        }

        if (result.kind === "me") {
          const sendResult = sendActionMessage(channelLogin, result.text, reply)
          handleSendResult(sendResult, message, {
            sentText: result.text,
            isAction: true,
            reply,
          })
          return
        }

        if (result.kind === "open_user_card") {
          userCardContext?.openUserCard(result.target, null)
          clearComposerAfterSend(message)
          return
        }

        if (result.kind === "feedback" && result.level === "error") {
          return
        }

        if (result.kind === "feedback") {
          clearComposerAfterSend(message)
        }
      })
      return
    }

    const sendResult = sendChatMessage(channelLogin, message, reply)
    handleSendResult(sendResult, message, { reply })
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const input = event.currentTarget

    if (event.key === "Tab") {
      event.preventDefault()
      handleTab(event.shiftKey)
      return
    }

    if (event.key === "ArrowUp") {
      if (showCommandSuggestions && commandCompleter.suggestions.length > 0) {
        event.preventDefault()
        setCommandCompleter((current) => ({
          ...current,
          current: getCommandSuggestionIndices(
            current.current,
            current.suggestions.length,
            "prev"
          ),
        }))
        return
      }

      if (showChatterSuggestions) {
        event.preventDefault()
        setChatterCompleter((current) => ({
          ...current,
          current: getChatterSuggestionIndices(
            current.current,
            current.suggestions.length,
            "prev"
          ),
        }))
        return
      }

      if (showEmoteSuggestions) {
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
      if (showCommandSuggestions && commandCompleter.suggestions.length > 0) {
        event.preventDefault()
        setCommandCompleter((current) => ({
          ...current,
          current: getCommandSuggestionIndices(
            current.current,
            current.suggestions.length,
            "next"
          ),
        }))
        return
      }

      if (showChatterSuggestions) {
        event.preventDefault()
        setChatterCompleter((current) => ({
          ...current,
          current: getChatterSuggestionIndices(
            current.current,
            current.suggestions.length,
            "next"
          ),
        }))
        return
      }

      if (showEmoteSuggestions) {
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
      {replyThread ? (
        <ChatReplyThreadTray
          thread={replyThread}
          badgeCatalog={badgeCatalog}
          getMemberBadge={getMemberBadge}
          showTwitchBadges={showTwitchBadges}
          showMemberBadges={showMemberBadges}
          showBadgeFallback={!hasBadgeSupport}
          onClose={() => setReply(null)}
          onSelectReply={(nextReply) => {
            setReply(nextReply)
            requestAnimationFrame(() => inputRef.current?.focus())
          }}
        />
      ) : null}

      <div className="relative flex items-end gap-1 px-2 py-2">
        <div className="relative min-w-0 flex-1">
          {rateLimitHint ? (
            <div className="absolute bottom-full left-0 z-50 mb-1.5 w-full min-w-[min(24rem,100%)] overflow-hidden rounded-lg border border-border bg-popover shadow-md">
              <div className="space-y-1 px-2.5 py-2 text-xs text-muted-foreground">
                <p>{rateLimitHint}</p>
              </div>
            </div>
          ) : null}
          <CommandSuggestions
            open={showCommandSuggestions}
            index={commandCompleter.current}
            suggestions={commandCompleter.suggestions}
            usageHint={commandCompleter.usageHint}
            usageHintDetail={commandCompleter.usageHintDetail}
            onSelect={(suggestion) => completeCommandSuggestion(suggestion)}
          />
          <ChatterSuggestions
            open={showChatterSuggestions}
            index={chatterCompleter.current}
            suggestions={chatterCompleter.suggestions}
            onSelect={(suggestion) =>
              completeChatterSuggestion(suggestion, { reset: true })
            }
          />
          <ChatSuggestions
            open={showEmoteSuggestions}
            index={completer.current}
            suggestions={completer.suggestions}
            onSelect={(suggestion) =>
              completeSuggestion(suggestion, { reset: true })
            }
          />
          <div className="overflow-hidden rounded-lg border border-border/50 bg-background/40 shadow-none backdrop-blur-sm focus-within:border-border/40 focus-within:ring-1 focus-within:ring-border/40 dark:bg-input/30">
            {activeNotice ? (
              <ComposerNoticeBanner
                key={`${activeNotice.id}:${activeNotice.message}`}
                noticeId={activeNotice.id}
                message={activeNotice.message}
                queueCount={notices.length}
                chatVisible={chatVisible}
                onDismiss={dismissFrontNotice}
              />
            ) : null}
            <div className="relative">
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
                className="field-sizing-fixed max-h-40 min-h-9 resize-none overflow-y-hidden rounded-none border-0 bg-transparent py-2 pr-10 text-sm leading-5 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
                onChange={(event) => {
                  const nextValue = event.target.value
                  setValue(nextValue)

                  const cursor = event.target.selectionStart ?? nextValue.length
                  updateCompleters(nextValue, cursor)
                }}
                onKeyDown={handleKeyDown}
                onSelect={(event) => {
                  const cursor =
                    event.currentTarget.selectionStart ?? value.length
                  updateCompleters(event.currentTarget.value, cursor)
                }}
                onClick={(event) => {
                  const cursor =
                    event.currentTarget.selectionStart ?? value.length
                  updateCompleters(event.currentTarget.value, cursor)
                }}
              />

              <EmotePicker
                catalog={catalog}
                loading={emotesLoading}
                disabled={disabled}
                onSelect={(code) => {
                  setValue((current) => insertEmoteAtEnd(current, code))
                  setCompleter(createEmoteCompleterState())
                  setCommandCompleter(createCommandCompleterState())
                  setChatterCompleter(createChatterCompleterState())
                  inputRef.current?.focus()
                }}
              />
            </div>
          </div>
        </div>

        <Button
          type="button"
          size="icon-lg"
          disabled={disabled || !value.trim()}
          aria-label="Send chat message"
          onClick={sendCurrentMessage}
          className="size-[calc(--spacing(9)+2px)] shrink-0 border-2 border-[var(--shine)]"
        >
          <SendHorizontalIcon className="size-4" />
        </Button>
      </div>
    </div>
  )
}
