import * as React from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { SearchIcon, XIcon } from "lucide-react"

import { ChatHoverTooltipProvider } from "@/components/chat/chat-hover-tooltip"
import { ChatMessageRow } from "@/components/chat/chat-message-row"
import { EmoteCardProvider } from "@/components/chat/emote-card-context"
import { UserCardProvider } from "@/components/chat/user-card-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useChatFontFamily } from "@/hooks/chat-ui/use-chat-font"
import { getChatPresentationStyle } from "@/lib/chat/chat-presentation-style"
import { mergeComposerEmoteCatalogs } from "@/lib/chat/chat-emote-catalog"
import {
  updateMergedRecentUserMessageBuckets,
  type RecentUserMessageBucketCache,
} from "@/lib/chat/recent-user-messages"
import type { UserCardTarget } from "@/lib/chat/user-card"
import {
  collectRecentSearchUsernames,
  createChatSearchResultsCache,
  getChatSearchSuggestions,
  getChatSearchTokenAtCursor,
  isAllChannelsSearchValue,
  isChatSearchQueryActive,
  parseChatSearchQuery,
  replaceChatSearchToken,
  resolveSearchChannelLogins,
  serializeChatSearchQuery,
  splitCommittedSearchQuery,
  updateChatSearchResults,
  type ChatSearchCommittedFilter,
  type ChatSearchResult,
  type ChatSearchSuggestion,
  type ChatSearchUsername,
} from "@/lib/search/chat-search"
import { shouldPreventSearchDismiss } from "@/lib/search/search-portaled-layers"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import type { TwitchTimelineItem } from "@/lib/twitch/twitch-chat-types"
import {
  usePeepochatChat,
  usePeepochatLayout,
  usePeepochatSettings,
} from "@/lib/peepochat/peepochat-context"
import { cn } from "@/lib/utils"

const SEARCH_SHORTCUT_LABEL =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform)
    ? "⌘F"
    : "Ctrl+F"

const EMPTY_TIMELINES: TwitchTimelineItem[][] = []
const EMPTY_SEARCH_USERNAMES: ChatSearchUsername[] = []

function useSearchTimelines(logins: string[], enabled: boolean) {
  const { subscribeToRoom, getTimeline } = usePeepochatChat()
  const loginsKey = logins.join("\0")
  const cacheRef = React.useRef<{
    key: string
    timelines: TwitchTimelineItem[][]
  } | null>(null)

  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      const currentLogins = loginsKey === "" ? [] : loginsKey.split("\0")
      if (!enabled || currentLogins.length === 0) {
        return () => {}
      }

      const unsubscribes = currentLogins.map((login) =>
        subscribeToRoom(login, onStoreChange)
      )
      return () => {
        for (const unsubscribe of unsubscribes) {
          unsubscribe()
        }
      }
    },
    [enabled, loginsKey, subscribeToRoom]
  )

  const getSnapshot = React.useCallback(() => {
    if (loginsKey === "") {
      return EMPTY_TIMELINES
    }

    const currentLogins = loginsKey.split("\0")
    const timelines = currentLogins.map((login) => getTimeline(login))
    const cached = cacheRef.current
    if (
      cached &&
      cached.key === loginsKey &&
      cached.timelines.length === timelines.length &&
      cached.timelines.every((timeline, index) => timeline === timelines[index])
    ) {
      return cached.timelines
    }

    cacheRef.current = { key: loginsKey, timelines }
    return timelines
  }, [getTimeline, loginsKey])

  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

function SearchSuggestions({
  suggestions,
  activeIndex,
  onSelect,
}: {
  suggestions: ChatSearchSuggestion[]
  activeIndex: number
  onSelect: (suggestion: ChatSearchSuggestion) => void
}) {
  const listRef = React.useRef<HTMLUListElement>(null)

  React.useLayoutEffect(() => {
    const activeItem = listRef.current?.children.item(
      activeIndex
    ) as HTMLElement | null
    activeItem?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  if (suggestions.length === 0) {
    return null
  }

  return (
    <ul
      ref={listRef}
      className="max-h-48 shrink-0 overflow-y-auto overscroll-contain border-b border-border py-1"
      role="listbox"
      aria-label="Search filters"
    >
      {suggestions.map((suggestion, index) => (
        <li key={suggestion.id}>
          <button
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className={cn(
              "flex w-full items-center gap-2 px-4 py-1.5 text-left text-sm",
              index === activeIndex
                ? "bg-accent text-accent-foreground"
                : "hover:bg-muted"
            )}
            onMouseDown={(event) => {
              event.preventDefault()
              onSelect(suggestion)
            }}
          >
            <span className="font-medium">{suggestion.label}</span>
            <span className="ml-auto truncate text-xs text-muted-foreground">
              {suggestion.description}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function SearchResultsList({
  results,
  showChannelLabels,
  channelLabels,
  scrollKey,
}: {
  results: ChatSearchResult[]
  showChannelLabels: boolean
  channelLabels: Map<string, string>
  scrollKey: string
}) {
  const parentRef = React.useRef<HTMLDivElement>(null)
  const {
    getRoomId,
    getSelfChatState,
    getBadgeCatalog,
    getMemberBadge,
    hasBadgeSupport,
  } = usePeepochatChat()
  const { account, config } = usePeepochatSettings()
  const timestampFormat = config.chat.messageTimestampFormat
  const messageQuickActions = config.chat.messageQuickActions
  const deletedMessagesBehavior = config.chat.deletedMessagesBehavior
  const showTwitchBadges = config.chat.badges.twitchEnabled
  const showMemberBadges = config.chat.badges.owoMemberEnabled

  /* React will skip memoizing this hook because of the useVirtualizer hook */
  /* eslint-disable-next-line react-hooks/incompatible-library */
  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 10,
    getItemKey: (index) => {
      const result = results[index]
      return result ? `${result.message.channel}:${result.message.id}` : index
    },
  })

  React.useLayoutEffect(() => {
    parentRef.current?.scrollTo({ top: 0 })
  }, [scrollKey])

  return (
    <div
      ref={parentRef}
      className="chat-scroll h-full overflow-y-auto overscroll-y-contain"
    >
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const result = results[virtualItem.index]
          if (!result) {
            return null
          }

          const channelLogin = normalizeChannelLogin(result.message.channel)

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full"
              style={{
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <ChatMessageRow
                message={result.message}
                timestampFormat={timestampFormat}
                messageQuickActions={messageQuickActions}
                deletedMessagesBehavior={deletedMessagesBehavior}
                account={account}
                channelRoomId={getRoomId(channelLogin)}
                selfChatState={getSelfChatState(channelLogin)}
                badgeCatalog={getBadgeCatalog(channelLogin)}
                getMemberBadge={getMemberBadge}
                showBadgeFallback={!hasBadgeSupport}
                showTwitchBadges={showTwitchBadges}
                showMemberBadges={showMemberBadges}
                searchHighlightRanges={result.highlightRanges}
                channelLabel={
                  showChannelLabels
                    ? (channelLabels.get(channelLogin) ?? channelLogin)
                    : null
                }
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SearchEmptyState({
  hasQuery,
  onInsert,
}: {
  hasQuery: boolean
  onInsert: (insert: string) => void
}) {
  if (hasQuery) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
          <SearchIcon className="size-4 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">No messages found.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
        <SearchIcon className="size-4 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">Search messages</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Searches messages currently loaded in chat.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-1.5">
        {["in:*", "from:", "role:mod", "has:link"].map((insert) => (
          <Button
            key={insert}
            type="button"
            variant="outline"
            size="xs"
            className="font-mono"
            onMouseDown={(event) => {
              event.preventDefault()
              onInsert(insert)
            }}
          >
            {insert}
          </Button>
        ))}
      </div>
    </div>
  )
}

export function ChannelSearch() {
  const [open, setOpen] = React.useState(false)
  const [filters, setFilters] = React.useState<ChatSearchCommittedFilter[]>([])
  const [remainder, setRemainder] = React.useState("")
  const [cursor, setCursor] = React.useState(0)
  const [suggestionIndex, setSuggestionIndex] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const { channels, account, loginWithTwitch, config, activeChannelLogin } =
    usePeepochatSettings()
  const { visibleChannelLogins, isSplitView } = usePeepochatLayout()
  const {
    getComposerEmoteCatalog,
    getRoomId,
    getSelfChatState,
    hideBlockedUsers,
    isUserBlocked,
    blockUser,
    unblockUser,
  } = usePeepochatChat()

  const query = serializeChatSearchQuery(filters, remainder)
  const parsed = React.useMemo(() => parseChatSearchQuery(query), [query])
  const knownChannels = React.useMemo(
    () =>
      channels.map((channel) => ({
        login: normalizeChannelLogin(channel.login),
        displayName: channel.displayName || channel.login,
      })),
    [channels]
  )
  const defaultChannelLogins = React.useMemo(
    () =>
      visibleChannelLogins
        .map((login) => normalizeChannelLogin(login))
        .filter(Boolean),
    [visibleChannelLogins]
  )
  const searchChannelLogins = React.useMemo(
    () =>
      resolveSearchChannelLogins(parsed, defaultChannelLogins, knownChannels),
    [defaultChannelLogins, knownChannels, parsed]
  )
  const timelines = useSearchTimelines(searchChannelLogins, open)
  const token = React.useMemo(
    () => getChatSearchTokenAtCursor(remainder, cursor),
    [cursor, remainder]
  )
  const needsUsernames = token.text.toLowerCase().startsWith("from:")
  const usernames = React.useMemo(
    () =>
      needsUsernames
        ? collectRecentSearchUsernames(timelines)
        : EMPTY_SEARCH_USERNAMES,
    [needsUsernames, timelines]
  )
  const suggestions = React.useMemo(
    () =>
      getChatSearchSuggestions({
        token,
        query: remainder,
        parsed,
        channels: knownChannels,
        usernames,
      }),
    [knownChannels, parsed, remainder, token, usernames]
  )

  const [searchResultsCache] = React.useState(createChatSearchResultsCache)
  const results = React.useMemo(
    () =>
      updateChatSearchResults(searchResultsCache, {
        open,
        parsed,
        timelines,
        includeDeleted: config.chat.deletedMessagesBehavior !== "remove",
        hideBlockedUsers,
        isHidden: hideBlockedUsers
          ? (message) => isUserBlocked(message.userId, message.userName)
          : undefined,
      }),
    [
      config.chat.deletedMessagesBehavior,
      hideBlockedUsers,
      isUserBlocked,
      open,
      parsed,
      searchResultsCache,
      timelines,
    ]
  )

  const channelLabels = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const channel of knownChannels) {
      map.set(channel.login, channel.displayName)
    }
    return map
  }, [knownChannels])

  const showChannelLabels = searchChannelLogins.length > 1
  const userCardChannelLogin =
    searchChannelLogins[0] || normalizeChannelLogin(activeChannelLogin)
  const emoteCatalog = React.useMemo(
    () =>
      mergeComposerEmoteCatalogs(
        searchChannelLogins.map((login) => getComposerEmoteCatalog(login))
      ),
    [getComposerEmoteCatalog, searchChannelLogins]
  )
  const [recentBucketsCaches] = React.useState(
    () => new Map<string, RecentUserMessageBucketCache>()
  )
  const recentMessagesByUser = React.useMemo(
    () =>
      updateMergedRecentUserMessageBuckets(
        recentBucketsCaches,
        searchChannelLogins.map((login, index) => ({
          login,
          timeline: timelines[index] ?? [],
        }))
      ),
    [recentBucketsCaches, searchChannelLogins, timelines]
  )

  const getRecentMessages = React.useCallback(
    (target: UserCardTarget) => {
      if (target.userId) {
        return recentMessagesByUser.get(`id:${target.userId}`) ?? []
      }
      return (
        recentMessagesByUser.get(`login:${target.userName.toLowerCase()}`) ?? []
      )
    },
    [recentMessagesByUser]
  )

  const cssFontFamily = useChatFontFamily(config.chat.fontFamily)
  const presentationStyle = React.useMemo(
    () =>
      getChatPresentationStyle(
        {
          fontSizePx: config.chat.fontSizePx,
          emoteScale: config.chat.emoteScale,
        },
        cssFontFamily
      ),
    [config.chat.emoteScale, config.chat.fontSizePx, cssFontFamily]
  )
  const presentationClassName = cn(
    "chat-presentation flex min-h-0 flex-1 flex-col",
    config.chat.alternatingRowBackgrounds &&
      "chat-presentation--alternating-rows",
    config.chat.messageSeparators && "chat-presentation--message-separators"
  )

  const scopeLabel = React.useMemo(() => {
    const inFilters = parsed.filters.filter((filter) => filter.key === "in")
    if (inFilters.some((filter) => isAllChannelsSearchValue(filter.value))) {
      return "Searching all channels"
    }
    if (inFilters.length > 0 && searchChannelLogins.length === 0) {
      return "No matching channel"
    }
    if (inFilters.length === 1) {
      const login = searchChannelLogins[0]
      const label = login
        ? (channelLabels.get(login) ?? login)
        : inFilters[0]!.value
      return `Searching #${label}`
    }
    if (inFilters.length > 1) {
      return `Searching ${searchChannelLogins.length} channels`
    }
    if (isSplitView && defaultChannelLogins.length > 1) {
      return `Searching ${defaultChannelLogins.length} channels in this split`
    }
    const login = defaultChannelLogins[0]
    if (!login) {
      return "Add a channel to search chat"
    }
    return `Searching #${channelLabels.get(login) ?? login}`
  }, [
    channelLabels,
    defaultChannelLogins,
    isSplitView,
    parsed.filters,
    searchChannelLogins,
  ])

  const focusInput = React.useCallback((select = false) => {
    const input = inputRef.current
    if (!input) {
      return
    }
    input.focus()
    if (select) {
      input.select()
    }
  }, [])

  const moveCursor = React.useCallback((nextCursor: number) => {
    setCursor(nextCursor)
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }, [])

  const applyRemainderText = React.useCallback(
    (text: string, nextCursor?: number) => {
      const split = splitCommittedSearchQuery(text)
      if (split.filters.length > 0) {
        setFilters((current) => [...current, ...split.filters])
        setRemainder(split.remainder)
        setSuggestionIndex(0)
        moveCursor(nextCursor ?? split.remainder.length)
        return
      }

      setRemainder(text)
      setSuggestionIndex(0)
      if (nextCursor !== undefined) {
        moveCursor(nextCursor)
      }
    },
    [moveCursor]
  )

  const applySuggestion = React.useCallback(
    (suggestion: ChatSearchSuggestion) => {
      const next = replaceChatSearchToken(remainder, token, suggestion.insert)
      applyRemainderText(next.query, next.cursor)
      requestAnimationFrame(() => inputRef.current?.focus())
    },
    [applyRemainderText, remainder, token]
  )

  const insertFilter = React.useCallback(
    (insert: string) => {
      const next = replaceChatSearchToken(
        remainder,
        getChatSearchTokenAtCursor(remainder, remainder.length),
        insert
      )
      applyRemainderText(next.query, next.cursor)
      requestAnimationFrame(() => inputRef.current?.focus())
    },
    [applyRemainderText, remainder]
  )

  const clearSearch = React.useCallback(() => {
    setFilters([])
    setRemainder("")
    setCursor(0)
    setSuggestionIndex(0)
    focusInput()
  }, [focusInput])

  const openSearch = React.useCallback(
    (prefill?: string) => {
      if (prefill && !query.trim()) {
        const split = splitCommittedSearchQuery(prefill)
        setFilters(split.filters)
        setRemainder(split.remainder)
        setCursor(split.remainder.length)
      }
      setOpen(true)
    },
    [query]
  )

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) {
        return
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
        return
      }
      if (event.key !== "f" && event.key !== "F") {
        return
      }
      if (document.querySelector('[data-slot="sheet-content"]')) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      if (open) {
        focusInput(true)
        return
      }

      const selection = window.getSelection()?.toString().trim() ?? ""
      const prefill =
        selection.length > 0 &&
        selection.length <= 80 &&
        !selection.includes("\n")
          ? selection
          : undefined
      openSearch(prefill)
    }

    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [focusInput, open, openSearch])

  const activeSuggestionIndex =
    suggestions.length === 0
      ? 0
      : Math.min(suggestionIndex, suggestions.length - 1)

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) {
      return
    }

    if (
      event.key === "Backspace" &&
      remainder.length === 0 &&
      filters.length > 0 &&
      (event.currentTarget.selectionStart ?? 0) === 0
    ) {
      event.preventDefault()
      setFilters((current) => current.slice(0, -1))
      return
    }

    if (suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        setSuggestionIndex((current) => {
          if (suggestions.length === 0) {
            return 0
          }
          const clamped = Math.min(current, suggestions.length - 1)
          return clamped + 1 >= suggestions.length ? 0 : clamped + 1
        })
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        setSuggestionIndex((current) => {
          if (suggestions.length === 0) {
            return 0
          }
          const clamped = Math.min(current, suggestions.length - 1)
          return clamped - 1 < 0 ? suggestions.length - 1 : clamped - 1
        })
        return
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const suggestion = suggestions[activeSuggestionIndex]
        if (suggestion) {
          event.preventDefault()
          applySuggestion(suggestion)
        }
      }
    }
  }

  const hasQuery = isChatSearchQueryActive(parsed)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <DialogTrigger asChild>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex h-7 cursor-pointer items-center gap-1.5 border border-border px-1.5 text-sm"
              aria-label="Search messages"
              aria-keyshortcuts="Control+F Meta+F"
            >
              <SearchIcon className="size-3.5" />
              <span className="hidden font-medium sm:inline">Search</span>
            </Button>
          </TooltipTrigger>
        </DialogTrigger>
        <TooltipContent>
          Search messages ({SEARCH_SHORTCUT_LABEL})
        </TooltipContent>
      </Tooltip>

      <DialogContent
        showCloseButton={false}
        className="flex h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:h-[min(36rem,70vh)] sm:w-[min(42rem,80vw)] sm:max-w-none"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
        }}
        onInteractOutside={(event) => {
          if (shouldPreventSearchDismiss(event.target)) {
            event.preventDefault()
          }
        }}
        onPointerDownOutside={(event) => {
          if (shouldPreventSearchDismiss(event.target)) {
            event.preventDefault()
          }
        }}
        onFocusOutside={(event) => {
          if (shouldPreventSearchDismiss(event.target)) {
            event.preventDefault()
          }
        }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border py-2 pr-2 pl-4">
          <div className="min-w-0">
            <DialogTitle className="truncate text-sm">Search</DialogTitle>
            <DialogDescription className="sr-only">
              Search loaded chat messages with filters like from:, in:, role:,
              and has:.
            </DialogDescription>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-xs text-muted-foreground">
              {scopeLabel}
            </p>
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Close search"
              >
                <XIcon className="size-4" />
              </Button>
            </DialogClose>
          </div>
        </div>

        <div className="shrink-0 border-b border-border px-4 py-3">
          <div
            className="flex min-h-9 cursor-text flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-2 py-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30"
            onClick={() => inputRef.current?.focus()}
          >
            {filters.map((filter, index) => (
              <Badge key={`${filter.key}:${filter.value}:${index}`} asChild>
                <button
                  type="button"
                  className="h-5 max-w-full cursor-pointer rounded-md px-1.5 font-medium"
                  aria-label={`Remove ${filter.key}:${filter.value}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    setFilters((current) =>
                      current.filter((_, filterIndex) => filterIndex !== index)
                    )
                    focusInput()
                  }}
                >
                  {filter.key}:{filter.value}
                </button>
              </Badge>
            ))}
            <input
              ref={inputRef}
              value={remainder}
              placeholder={
                filters.length === 0
                  ? "Start typing or use filters..."
                  : undefined
              }
              className="min-w-[8ch] flex-1 border-0 bg-transparent px-0.5 py-0.5 text-sm outline-none placeholder:text-muted-foreground"
              role="combobox"
              aria-label="Search messages"
              aria-autocomplete="list"
              aria-expanded={suggestions.length > 0}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                const nextValue = event.target.value
                const split = splitCommittedSearchQuery(nextValue)
                if (split.filters.length > 0) {
                  applyRemainderText(nextValue, split.remainder.length)
                  return
                }
                setRemainder(nextValue)
                setCursor(event.target.selectionStart ?? nextValue.length)
                setSuggestionIndex(0)
              }}
              onClick={(event) => {
                event.stopPropagation()
                setCursor(event.currentTarget.selectionStart ?? 0)
              }}
              onKeyUp={(event) => {
                setCursor(event.currentTarget.selectionStart ?? 0)
              }}
              onKeyDown={handleInputKeyDown}
            />
            {hasQuery ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="ml-auto shrink-0 text-muted-foreground"
                aria-label="Clear search"
                onClick={(event) => {
                  event.stopPropagation()
                  clearSearch()
                }}
              >
                <XIcon className="size-3.5" />
              </Button>
            ) : null}
          </div>
        </div>

        <SearchSuggestions
          suggestions={suggestions}
          activeIndex={activeSuggestionIndex}
          onSelect={applySuggestion}
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <UserCardProvider
            account={account}
            channelLogin={userCardChannelLogin}
            channelRoomId={getRoomId(userCardChannelLogin)}
            selfChatState={getSelfChatState(userCardChannelLogin)}
            loginWithTwitch={loginWithTwitch}
            getRecentMessages={getRecentMessages}
            timestampFormat={config.chat.messageTimestampFormat}
            isUserBlocked={isUserBlocked}
            blockUser={blockUser}
            unblockUser={unblockUser}
            getChannelRoomId={getRoomId}
            getChannelSelfChatState={getSelfChatState}
          >
            <EmoteCardProvider catalog={emoteCatalog}>
              <ChatHoverTooltipProvider>
                <div
                  className={presentationClassName}
                  style={presentationStyle}
                >
                  {results.length > 0 ? (
                    <>
                      <div className="shrink-0 border-b border-border px-4 py-1.5 text-xs text-muted-foreground">
                        {results.length}{" "}
                        {results.length === 1 ? "result" : "results"}
                      </div>
                      <div className="min-h-0 flex-1">
                        <SearchResultsList
                          results={results}
                          showChannelLabels={showChannelLabels}
                          channelLabels={channelLabels}
                          scrollKey={query}
                        />
                      </div>
                    </>
                  ) : (
                    <SearchEmptyState
                      hasQuery={hasQuery}
                      onInsert={insertFilter}
                    />
                  )}
                </div>
              </ChatHoverTooltipProvider>
            </EmoteCardProvider>
          </UserCardProvider>
        </div>
      </DialogContent>
    </Dialog>
  )
}
