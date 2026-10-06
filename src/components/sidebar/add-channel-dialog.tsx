import * as React from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  ArrowRightLeftIcon,
  CheckIcon,
  EyeIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useFollowedChannels } from "@/hooks/twitch/use-followed-channels"
import {
  usePeepochatPlayer,
  usePeepochatSettings,
} from "@/lib/peepochat/peepochat-context"
import { normalizeChannelLogin } from "@/lib/twitch/channel/channel"
import {
  buildFollowedChannelListRows,
  followedChannelListRowKey,
  isSelectableFollowedChannelListRow,
  type FollowedChannelListRow,
  type FollowedChannelRow,
} from "@/lib/twitch/channel/followed-channels"
import { formatCompactViewerCount } from "@/lib/twitch/channel/stream-display"
import {
  fetchUserAvatarUrl,
  getCachedUserAvatarUrl,
  subscribeToUserAvatars,
} from "@/lib/twitch/channel/user-avatars"
import { cn } from "@/lib/utils"

type RowActionKind = "watch" | "add"

function FollowedChannelAvatar({
  login,
  displayName,
  profileImageUrl,
}: {
  login: string
  displayName: string
  profileImageUrl?: string
}) {
  const { account } = usePeepochatSettings()
  const cacheKey = login.toLowerCase()
  const getSnapshot = React.useCallback(
    () => getCachedUserAvatarUrl(cacheKey) ?? null,
    [cacheKey]
  )
  const cachedUrl = React.useSyncExternalStore(
    subscribeToUserAvatars,
    getSnapshot,
    getSnapshot
  )
  const imageUrl = profileImageUrl || cachedUrl

  React.useEffect(() => {
    if (profileImageUrl || !account) {
      return
    }

    void fetchUserAvatarUrl(login, account.accessToken, account.clientId)
  }, [account, login, profileImageUrl])

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className="size-8 shrink-0 rounded-full object-cover"
        loading="lazy"
        decoding="async"
      />
    )
  }

  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary uppercase">
      {(displayName || login).slice(0, 2)}
    </span>
  )
}

function AddedIndicator() {
  return (
    <span
      title="Already added"
      aria-label="Already added"
      className="inline-flex shrink-0 items-center text-muted-foreground"
    >
      <CheckIcon className="size-3.5" aria-hidden />
    </span>
  )
}

function FollowedChannelMeta({
  channel,
  added,
}: {
  channel: FollowedChannelRow
  added: boolean
}) {
  const gameName = channel.gameName.trim()
  const title = channel.title.trim()

  return (
    <div className="min-w-0 flex-1">
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 truncate font-medium">
          {channel.displayName}
        </span>
        {added ? <AddedIndicator /> : null}
      </span>
      {channel.live && (gameName || title) ? (
        <span className="mt-0.5 flex min-w-0 items-baseline gap-2 text-xs text-muted-foreground">
          {gameName ? (
            <span className="max-w-[45%] shrink-0 truncate">{gameName}</span>
          ) : null}
          {gameName && title ? (
            <span aria-hidden="true" className="shrink-0">
              ·
            </span>
          ) : null}
          {title ? (
            <span className="min-w-0 flex-1 truncate">{title}</span>
          ) : null}
        </span>
      ) : null}
    </div>
  )
}

function RowActions({
  live,
  added,
  disabled,
  focus,
  preview,
  onFocus,
  onWatch,
  onAdd,
}: {
  live?: boolean
  added?: boolean
  disabled: boolean
  focus: RowActionKind
  preview: RowActionKind | null
  onFocus: (action: RowActionKind) => void
  onWatch?: () => void
  onAdd: () => void
}) {
  const canWatch = Boolean(live && onWatch)
  const switchLabel = added ? "Switch to channel" : "Add channel"
  const switchText = added ? "Switch" : "Add"

  if (preview === "watch" && canWatch) {
    return (
      <span
        className="flex shrink-0 items-center gap-1.5 rounded-md bg-background/80 py-0.5 pr-2.5 pl-1 shadow-sm ring-1 ring-border/40 backdrop-blur-sm"
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          tabIndex={-1}
          aria-label="Watch channel"
          disabled={disabled}
          className="cursor-pointer text-foreground"
          onClick={onWatch}
        >
          <PlayIcon className="size-3.5" />
        </Button>
        <span className="text-xs font-medium text-foreground">Watch</span>
      </span>
    )
  }

  if (preview === "add") {
    return (
      <span
        className="flex shrink-0 items-center gap-1.5 rounded-md bg-background/80 py-0.5 pr-2.5 pl-1 shadow-sm ring-1 ring-border/40 backdrop-blur-sm"
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          tabIndex={-1}
          aria-label={switchLabel}
          disabled={disabled}
          className="cursor-pointer text-foreground"
          onClick={onAdd}
        >
          {added ? (
            <ArrowRightLeftIcon className="size-3.5" />
          ) : (
            <PlusIcon className="size-3.5" />
          )}
        </Button>
        <span className="text-xs font-medium text-foreground">
          {switchText}
        </span>
      </span>
    )
  }

  const buttonClass = (isFocused: boolean) =>
    cn(
      "cursor-pointer",
      isFocused
        ? "bg-muted text-foreground"
        : "text-muted-foreground hover:text-foreground"
    )

  return (
    <span
      className="flex shrink-0 items-center gap-1 rounded-md bg-background/80 p-0.5 shadow-sm ring-1 ring-border/40 backdrop-blur-sm"
      onClick={(event) => event.stopPropagation()}
    >
      {canWatch ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          tabIndex={-1}
          aria-label="Watch channel"
          disabled={disabled}
          className={buttonClass(focus === "watch")}
          onMouseEnter={() => onFocus("watch")}
          onClick={onWatch}
        >
          <PlayIcon className="size-3.5" />
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        tabIndex={-1}
        aria-label={switchLabel}
        disabled={disabled}
        className={buttonClass(focus === "add")}
        onMouseEnter={() => onFocus("add")}
        onClick={onAdd}
      >
        {added ? (
          <ArrowRightLeftIcon className="size-3.5" />
        ) : (
          <PlusIcon className="size-3.5" />
        )}
      </Button>
    </span>
  )
}

function AddChannelList({
  rows,
  activeKey,
  actionFocus,
  preview,
  addedLogins,
  savedAvatars,
  submitting,
  scrollKey,
  onHover,
  onActionFocus,
  onWatch,
  onAdd,
}: {
  rows: FollowedChannelListRow[]
  activeKey: string | null
  actionFocus: RowActionKind
  preview: RowActionKind | null
  addedLogins: Set<string>
  savedAvatars: Map<string, string>
  submitting: boolean
  scrollKey: string
  onHover: (key: string) => void
  onActionFocus: (action: RowActionKind) => void
  onWatch: (login: string) => void
  onAdd: (login: string) => void
}) {
  const parentRef = React.useRef<HTMLDivElement>(null)

  /* React will skip memoizing this hook because of the useVirtualizer hook */
  /* eslint-disable-next-line react-hooks/incompatible-library */
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const row = rows[index]
      if (!row) {
        return 44
      }
      if (row.kind === "header") {
        return 32
      }
      if (row.kind === "add") {
        return 44
      }
      return row.channel.live ? 56 : 44
    },
    overscan: 12,
    useFlushSync: false,
    getItemKey: (index) => {
      const row = rows[index]
      return row ? followedChannelListRowKey(row) : index
    },
  })

  React.useLayoutEffect(() => {
    parentRef.current?.scrollTo({ top: 0 })
  }, [scrollKey])

  const previousActiveKeyRef = React.useRef<string | null>(null)

  React.useLayoutEffect(() => {
    const previousActiveKey = previousActiveKeyRef.current
    previousActiveKeyRef.current = activeKey

    if (!activeKey || activeKey === previousActiveKey) {
      return
    }

    const index = rows.findIndex(
      (row) => followedChannelListRowKey(row) === activeKey
    )
    if (index < 0) {
      return
    }

    virtualizer.scrollToIndex(index, { align: "auto" })
  }, [activeKey, rows, virtualizer])

  return (
    <div
      ref={parentRef}
      className="chat-scroll h-full overflow-y-auto overscroll-contain"
      role="listbox"
      aria-label="Followed channels"
    >
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const row = rows[virtualItem.index]
          if (!row) {
            return null
          }

          const key = followedChannelListRowKey(row)
          const isActive = activeKey === key

          if (row.kind === "header") {
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                className="absolute top-0 left-0 flex w-full items-baseline gap-1.5 px-4 pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
                style={{
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {row.id === "live" ? (
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full bg-red-500"
                  />
                ) : null}
                {row.label}
                <span className="font-normal normal-case tabular-nums">
                  {row.count}
                </span>
              </div>
            )
          }

          if (row.kind === "add") {
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
                <div
                  role="option"
                  aria-selected={isActive}
                  aria-disabled={submitting}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 px-4 py-1.5 text-left text-sm transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted"
                  )}
                  onMouseMove={() => onHover(key)}
                  onClick={submitting ? undefined : () => onAdd(row.login)}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
                    <PlusIcon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    Add {row.login}
                  </span>
                  {isActive ? (
                    <RowActions
                      added={addedLogins.has(row.login)}
                      disabled={submitting}
                      focus={actionFocus}
                      preview={preview}
                      onFocus={onActionFocus}
                      onAdd={() => onAdd(row.login)}
                    />
                  ) : null}
                </div>
              </div>
            )
          }

          const channel = row.channel
          const added = addedLogins.has(channel.login)

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
              <div
                role="option"
                aria-selected={isActive}
                aria-disabled={submitting}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 px-4 py-1.5 text-left text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted"
                )}
                onMouseMove={() => onHover(key)}
                onClick={submitting ? undefined : () => onAdd(channel.login)}
              >
                <FollowedChannelAvatar
                  login={channel.login}
                  displayName={channel.displayName}
                  profileImageUrl={savedAvatars.get(channel.login)}
                />
                <FollowedChannelMeta channel={channel} added={added} />

                {channel.live && !isActive ? (
                  <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-red-500 tabular-nums">
                    <EyeIcon className="size-3" aria-hidden />
                    {formatCompactViewerCount(channel.viewerCount)}
                  </span>
                ) : null}

                {isActive ? (
                  <RowActions
                    live={channel.live}
                    added={added}
                    disabled={submitting}
                    focus={actionFocus}
                    preview={preview}
                    onFocus={onActionFocus}
                    onWatch={() => onWatch(channel.login)}
                    onAdd={() => onAdd(channel.login)}
                  />
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function AddChannelDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { account, addChannel, channels, loginWithTwitch } =
    usePeepochatSettings()
  const { openPlayer } = usePeepochatPlayer()
  const followed = useFollowedChannels(account, open)
  const [draft, setDraft] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [activeKey, setActiveKey] = React.useState<string | null>(null)
  const [actionFocusOverride, setActionFocusOverride] = React.useState<{
    key: string
    action: RowActionKind
  } | null>(null)
  const [actionPreview, setActionPreview] =
    React.useState<RowActionKind | null>(null)
  const [wasOpen, setWasOpen] = React.useState(open)
  const inputRef = React.useRef<HTMLInputElement>(null)

  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) {
      setDraft("")
      setSubmitting(false)
      setActiveKey(null)
      setActionFocusOverride(null)
      setActionPreview(null)
    }
  }

  const addedLogins = React.useMemo(
    () => new Set(channels.map((channel) => channel.login)),
    [channels]
  )
  const savedAvatars = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const channel of channels) {
      if (channel.profileImageUrl) {
        map.set(channel.login, channel.profileImageUrl)
      }
    }
    return map
  }, [channels])

  const listRows = React.useMemo(
    () => buildFollowedChannelListRows(followed.rows, draft),
    [draft, followed.rows]
  )
  const selectableKeys = React.useMemo(
    () =>
      listRows
        .filter(isSelectableFollowedChannelListRow)
        .map(followedChannelListRowKey),
    [listRows]
  )

  const resolvedActiveKey =
    activeKey && selectableKeys.includes(activeKey)
      ? activeKey
      : (selectableKeys[0] ?? null)

  const getActiveRow = React.useCallback(() => {
    if (!resolvedActiveKey) {
      return null
    }
    const row = listRows.find(
      (entry) => followedChannelListRowKey(entry) === resolvedActiveKey
    )
    return row && isSelectableFollowedChannelListRow(row) ? row : null
  }, [listRows, resolvedActiveKey])

  const actionFocus =
    actionFocusOverride?.key === resolvedActiveKey
      ? actionFocusOverride.action
      : "add"
  const setActionFocus = React.useCallback(
    (action: RowActionKind) => {
      if (!resolvedActiveKey) {
        return
      }
      setActionFocusOverride({ key: resolvedActiveKey, action })
    },
    [resolvedActiveKey]
  )

  const refocusInputRef = React.useRef(false)

  React.useEffect(() => {
    if (refocusInputRef.current && !submitting && open) {
      refocusInputRef.current = false
      inputRef.current?.focus()
    }
  }, [open, submitting])

  const addLogin = React.useCallback(
    async (login: string, options?: { keepOpen?: boolean }) => {
      const value = normalizeChannelLogin(login)
      if (!value || submitting) {
        return
      }

      setSubmitting(true)
      try {
        await addChannel(value)
        if (options?.keepOpen) {
          setDraft("")
          refocusInputRef.current = true
        } else {
          onOpenChange(false)
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not add channel"
        )
      } finally {
        setSubmitting(false)
      }
    },
    [addChannel, onOpenChange, submitting]
  )

  const watchLogin = React.useCallback(
    (login: string) => {
      const value = normalizeChannelLogin(login)
      if (!value || submitting) {
        return
      }

      openPlayer(value)
      onOpenChange(false)
    },
    [onOpenChange, openPlayer, submitting]
  )

  const confirmActive = React.useCallback(
    (options?: { keepOpen?: boolean }) => {
      const row = getActiveRow()
      if (!row) {
        void addLogin(draft, options)
        return
      }

      const login = row.kind === "add" ? row.login : row.channel.login
      if (options?.keepOpen) {
        void addLogin(login, options)
        return
      }

      if (row.kind === "add") {
        void addLogin(login, options)
        return
      }

      if (actionFocus === "watch" && row.channel.live) {
        watchLogin(row.channel.login)
        return
      }
      void addLogin(login, options)
    },
    [actionFocus, addLogin, draft, getActiveRow, watchLogin]
  )

  const watchActiveLive = React.useCallback(() => {
    const row = getActiveRow()
    if (row) {
      if (row.kind === "channel" && row.channel.live) {
        watchLogin(row.channel.login)
        return
      }
      if (row.kind === "add") {
        watchLogin(row.login)
        return
      }
    }

    const query = normalizeChannelLogin(draft)
    if (!query) {
      return
    }
    const match = followed.rows.find(
      (channel) => channel.live && channel.login === query
    )
    watchLogin(match ? match.login : query)
  }, [draft, followed.rows, getActiveRow, watchLogin])

  const moveActive = React.useCallback(
    (direction: 1 | -1) => {
      if (selectableKeys.length === 0) {
        return
      }

      const currentIndex = resolvedActiveKey
        ? selectableKeys.indexOf(resolvedActiveKey)
        : -1
      const nextIndex =
        currentIndex < 0
          ? 0
          : (currentIndex + direction + selectableKeys.length) %
            selectableKeys.length
      setActiveKey(selectableKeys[nextIndex] ?? null)
    },
    [resolvedActiveKey, selectableKeys]
  )

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) {
      return
    }

    setActionPreview(
      event.shiftKey ? "watch" : event.ctrlKey || event.metaKey ? "add" : null
    )

    if (event.key === "ArrowDown") {
      event.preventDefault()
      moveActive(1)
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      moveActive(-1)
      return
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        return
      }
      const row = getActiveRow()
      if (!row) {
        return
      }
      const canWatch = row.kind === "channel" && row.channel.live
      event.preventDefault()
      if (event.key === "ArrowLeft") {
        setActionFocus(canWatch ? "watch" : "add")
      } else {
        setActionFocus("add")
      }
      return
    }

    if (event.key === "Enter") {
      event.preventDefault()
      if (event.shiftKey) {
        watchActiveLive()
      } else if (event.ctrlKey || event.metaKey) {
        confirmActive({ keepOpen: true })
      } else {
        confirmActive()
      }
    }
  }

  const handleInputKeyUp = (event: React.KeyboardEvent<HTMLInputElement>) => {
    setActionPreview(
      event.shiftKey ? "watch" : event.ctrlKey || event.metaKey ? "add" : null
    )
  }

  const handleInputBlur = () => {
    setActionPreview(null)
  }

  const query = normalizeChannelLogin(draft)
  const showLoading = followed.loading && followed.rows.length === 0 && !query
  const showEmpty = !showLoading && listRows.length === 0
  const emptyMessage =
    followed.missingScope || followed.error
      ? "Type a channel name to add it."
      : account
        ? "You're not following anyone yet."
        : "Sign in to search channels you follow."
  const showTypeHint =
    !query && !followed.missingScope && !followed.error && Boolean(account)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-hotkey-surface="add-channel"
        showCloseButton={false}
        className="flex h-[min(40rem,86vh)] w-[calc(100%-1rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border p-3 pr-2.5 pl-4">
          <div className="min-w-0">
            <DialogTitle className="truncate text-base">
              Add channel
            </DialogTitle>
            <DialogDescription className="sr-only">
              Search the channels you follow or enter a username to join.
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Close add channel"
            >
              <XIcon />
            </Button>
          </DialogClose>
        </div>

        <div className="shrink-0 px-4 pt-3.5 pb-3">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              id="add-channel-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Search follows or add a channel"
              disabled={submitting}
              autoComplete="off"
              spellCheck={false}
              aria-autocomplete="list"
              onKeyDown={handleInputKeyDown}
              onKeyUp={handleInputKeyUp}
              onBlur={handleInputBlur}
              className="h-10 pr-9 pl-9 text-sm"
            />
            {draft ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
                aria-label="Clear search"
                onClick={() => {
                  setDraft("")
                  inputRef.current?.focus()
                }}
              >
                <XIcon />
              </Button>
            ) : null}
          </div>
        </div>

        {followed.missingScope ? (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Sign in again to search channels you follow.
            </p>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={loginWithTwitch}
            >
              Sign in
            </Button>
          </div>
        ) : null}

        {followed.error && followed.rows.length === 0 ? (
          <div className="shrink-0 border-b border-border px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
            {followed.error}
          </div>
        ) : null}

        {followed.refreshing && followed.rows.length > 0 ? (
          <div
            role="status"
            className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5 text-xs text-muted-foreground"
          >
            <Spinner className="size-3.5" />
            Loading follows...
          </div>
        ) : null}

        <div className="relative min-h-0 flex-1">
          {listRows.length > 0 ? (
            <AddChannelList
              rows={listRows}
              activeKey={resolvedActiveKey}
              actionFocus={actionFocus}
              preview={actionPreview}
              addedLogins={addedLogins}
              savedAvatars={savedAvatars}
              submitting={submitting}
              scrollKey={query}
              onHover={setActiveKey}
              onActionFocus={setActionFocus}
              onWatch={watchLogin}
              onAdd={(login) => void addLogin(login)}
            />
          ) : null}

          {showLoading ? (
            <div
              role="status"
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-popover px-4 text-center"
            >
              <Spinner className="size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Loading follows...
              </p>
            </div>
          ) : showEmpty ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2.5 bg-popover px-4 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <UsersIcon className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">{emptyMessage}</p>
              {showTypeHint ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Type a channel name to add it.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
