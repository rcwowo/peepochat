import * as React from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  CheckIcon,
  EyeIcon,
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
import { usePeepochatSettings } from "@/lib/peepochat/peepochat-context"
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

function FollowedChannelLiveMeta({
  channel,
  added,
}: {
  channel: FollowedChannelRow
  added: boolean
}) {
  const subtitle = [channel.gameName, channel.title]
    .filter((value) => value.trim().length > 0)
    .join(" · ")

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium">{channel.displayName}</span>
          {added ? (
            <CheckIcon className="size-3 shrink-0 text-muted-foreground" />
          ) : null}
        </span>
        {subtitle ? (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-red-500 tabular-nums">
        <EyeIcon className="size-3" aria-hidden />
        {formatCompactViewerCount(channel.viewerCount)}
      </span>
    </div>
  )
}

function FollowedChannelOfflineMeta({
  channel,
  added,
}: {
  channel: FollowedChannelRow
  added: boolean
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span className="min-w-0 flex-1 truncate font-medium">
        {channel.displayName}
      </span>
      {added ? (
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
          <CheckIcon className="size-3" aria-hidden />
          Added
        </span>
      ) : null}
    </div>
  )
}

function AddChannelList({
  rows,
  activeKey,
  addedLogins,
  savedAvatars,
  submitting,
  scrollKey,
  onHover,
  onSelect,
}: {
  rows: FollowedChannelListRow[]
  activeKey: string | null
  addedLogins: Set<string>
  savedAvatars: Map<string, string>
  submitting: boolean
  scrollKey: string
  onHover: (key: string) => void
  onSelect: (login: string) => void
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
              {row.kind === "header" ? (
                <div className="flex items-baseline gap-1.5 px-4 pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {row.label}
                  <span aria-hidden="true">—</span>
                  <span className="font-normal normal-case tabular-nums">
                    {row.count}
                  </span>
                </div>
              ) : row.kind === "add" ? (
                <button
                  type="button"
                  role="option"
                  aria-selected={activeKey === key}
                  disabled={submitting}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 px-4 py-1.5 text-left text-sm",
                    activeKey === key
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted"
                  )}
                  onMouseMove={() => onHover(key)}
                  onClick={() => onSelect(row.login)}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <PlusIcon className="size-4" />
                  </span>
                  <span className="min-w-0 truncate font-medium">
                    Add {row.login}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  role="option"
                  aria-selected={activeKey === key}
                  disabled={submitting}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 px-4 py-1.5 text-left text-sm",
                    activeKey === key
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted"
                  )}
                  onMouseMove={() => onHover(key)}
                  onClick={() => onSelect(row.channel.login)}
                >
                  <FollowedChannelAvatar
                    login={row.channel.login}
                    displayName={row.channel.displayName}
                    profileImageUrl={savedAvatars.get(row.channel.login)}
                  />
                  {row.channel.live ? (
                    <FollowedChannelLiveMeta
                      channel={row.channel}
                      added={addedLogins.has(row.channel.login)}
                    />
                  ) : (
                    <FollowedChannelOfflineMeta
                      channel={row.channel}
                      added={addedLogins.has(row.channel.login)}
                    />
                  )}
                </button>
              )}
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
  const followed = useFollowedChannels(account, open)
  const [draft, setDraft] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [activeKey, setActiveKey] = React.useState<string | null>(null)
  const [wasOpen, setWasOpen] = React.useState(open)
  const inputRef = React.useRef<HTMLInputElement>(null)

  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) {
      setDraft("")
      setSubmitting(false)
      setActiveKey(null)
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

  const addLogin = React.useCallback(
    async (login: string) => {
      const value = normalizeChannelLogin(login)
      if (!value || submitting) {
        return
      }

      setSubmitting(true)
      try {
        await addChannel(value)
        onOpenChange(false)
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

  const addActiveOrDraft = React.useCallback(() => {
    if (resolvedActiveKey) {
      const row = listRows.find(
        (entry) => followedChannelListRowKey(entry) === resolvedActiveKey
      )
      if (row && isSelectableFollowedChannelListRow(row)) {
        void addLogin(row.kind === "add" ? row.login : row.channel.login)
        return
      }
    }

    void addLogin(draft)
  }, [addLogin, draft, listRows, resolvedActiveKey])

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

    if (event.key === "Enter") {
      event.preventDefault()
      addActiveOrDraft()
    }
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
        className="flex h-[min(36rem,80vh)] w-[calc(100%-1rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border py-2 pr-2 pl-4">
          <div className="min-w-0">
            <DialogTitle className="truncate text-sm">Add channel</DialogTitle>
            <DialogDescription className="sr-only">
              Search the channels you follow or enter a username to join.
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Close add channel"
            >
              <XIcon className="size-4" />
            </Button>
          </DialogClose>
        </div>

        <div className="shrink-0 border-b border-border px-4 py-3">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
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
              className="h-9 pr-8 pl-8 text-sm"
            />
            {draft ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
                aria-label="Clear search"
                onClick={() => {
                  setDraft("")
                  inputRef.current?.focus()
                }}
              >
                <XIcon className="size-3.5" />
              </Button>
            ) : null}
          </div>
        </div>

        {followed.missingScope ? (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
            <p className="text-xs text-muted-foreground">
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
          <div className="shrink-0 border-b border-border px-4 py-2 text-xs text-muted-foreground">
            {followed.error}
          </div>
        ) : null}

        {followed.refreshing && followed.rows.length > 0 ? (
          <div
            role="status"
            className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground"
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
              addedLogins={addedLogins}
              savedAvatars={savedAvatars}
              submitting={submitting}
              scrollKey={query}
              onHover={setActiveKey}
              onSelect={(login) => void addLogin(login)}
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
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-popover px-4 text-center">
              <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                <UsersIcon className="size-4 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">{emptyMessage}</p>
              {showTypeHint ? (
                <p className="text-xs text-muted-foreground">
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
