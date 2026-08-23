import * as React from "react"
import { createPortal } from "react-dom"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ArrowDownAZIcon, ClockIcon, UsersIcon, XIcon } from "lucide-react"

import {
  useChannelChatters,
  useChannelChattersLoading,
} from "@/hooks/chat-ui/use-channel-chatters"
import { useUserCardContext } from "@/hooks/twitch/use-user-card-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { ChannelChatter } from "@/lib/chat/chatter-store"
import { createUserCardTargetFromChatter } from "@/lib/chat/user-card"
import { usePeepochatChat } from "@/lib/peepochat/peepochat-context"

type ChatterListSort = "recency" | "alpha"

type ChatterRoleGroupId = "broadcaster" | "moderators" | "vips" | "chatters"

type ChatterListRow =
  | { kind: "header"; id: ChatterRoleGroupId; label: string; count: number }
  | { kind: "chatter"; chatter: ChannelChatter }

const ROLE_GROUPS: Array<{
  id: ChatterRoleGroupId
  label: string
  matches: (chatter: ChannelChatter) => boolean
}> = [
  {
    id: "broadcaster",
    label: "Broadcaster",
    matches: (chatter) => chatter.flags.isBroadcaster,
  },
  {
    id: "moderators",
    label: "Moderators",
    matches: (chatter) =>
      chatter.flags.isModerator && !chatter.flags.isBroadcaster,
  },
  {
    id: "vips",
    label: "VIPs",
    matches: (chatter) =>
      chatter.flags.isVip &&
      !chatter.flags.isBroadcaster &&
      !chatter.flags.isModerator,
  },
  {
    id: "chatters",
    label: "Chatters",
    matches: () => true,
  },
]

function matchesQuery(
  login: string,
  displayName: string,
  query: string
): boolean {
  if (!query) {
    return true
  }

  return login.startsWith(query) || displayName.toLowerCase().startsWith(query)
}

function compareChatters(
  left: ChannelChatter,
  right: ChannelChatter,
  sort: ChatterListSort
): number {
  if (sort === "alpha") {
    return left.displayName.localeCompare(right.displayName, undefined, {
      sensitivity: "base",
    })
  }

  if (left.lastSeenAt !== right.lastSeenAt) {
    return right.lastSeenAt - left.lastSeenAt
  }

  return left.displayName.localeCompare(right.displayName, undefined, {
    sensitivity: "base",
  })
}

const CHATTERS_SHEET_DISMISS_LAYER_SELECTOR = [
  '[data-slot="user-card-panel"]',
  '[data-slot="dropdown-menu-content"]',
  '[data-slot="dropdown-menu-sub-content"]',
  '[data-slot="dropdown-menu-trigger"]',
  "[data-radix-popper-content-wrapper]",
].join(", ")

const OPEN_CHATTERS_SHEET_DISMISS_LAYER_SELECTOR = [
  '[data-slot="dropdown-menu-content"][data-state="open"]',
  '[data-slot="dropdown-menu-sub-content"][data-state="open"]',
  '[data-slot="dropdown-menu-trigger"][data-state="open"]',
].join(", ")

let chattersSheetDismissDropdownOpenAtPointerDown = false
let chattersSheetDismissPointerGuardInstalled = false

function isChattersSheetDismissDropdownOpen() {
  return Boolean(
    document.querySelector(OPEN_CHATTERS_SHEET_DISMISS_LAYER_SELECTOR)
  )
}

function ensureChattersSheetDismissPointerGuard() {
  if (chattersSheetDismissPointerGuardInstalled) {
    return
  }

  const onPointerDownCapture = () => {
    chattersSheetDismissDropdownOpenAtPointerDown =
      isChattersSheetDismissDropdownOpen()
  }

  document.addEventListener("pointerdown", onPointerDownCapture, true)
  chattersSheetDismissPointerGuardInstalled = true
}

function shouldPreventChattersSheetDismiss(
  target: EventTarget | null,
  channelLogin: string
) {
  if (chattersSheetDismissDropdownOpenAtPointerDown) {
    return true
  }

  if (isChattersSheetDismissDropdownOpen()) {
    return true
  }

  if (!(target instanceof Element)) {
    return false
  }

  return Boolean(
    target.closest(
      `${CHATTERS_SHEET_DISMISS_LAYER_SELECTOR}, [data-chatters-trigger="${CSS.escape(channelLogin)}"]`
    )
  )
}

function buildChatterRows(
  chatters: ChannelChatter[],
  sort: ChatterListSort
): ChatterListRow[] {
  const assigned = new Set<string>()
  const rows: ChatterListRow[] = []

  for (const group of ROLE_GROUPS) {
    const members: ChannelChatter[] = []

    for (const chatter of chatters) {
      if (assigned.has(chatter.login) || !group.matches(chatter)) {
        continue
      }
      assigned.add(chatter.login)
      members.push(chatter)
    }

    if (members.length === 0) {
      continue
    }

    members.sort((left, right) => compareChatters(left, right, sort))
    rows.push({
      kind: "header",
      id: group.id,
      label: group.label,
      count: members.length,
    })
    for (const chatter of members) {
      rows.push({ kind: "chatter", chatter })
    }
  }

  return rows
}

export function ChatChattersPanel({
  channelLogin,
  open,
  onOpenChange,
}: {
  channelLogin: string
  channelDisplayName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const liveChatters = useChannelChatters(channelLogin)
  const chattersLoading = useChannelChattersLoading(channelLogin)
  const { hideBlockedUsers, isUserBlocked } = usePeepochatChat()
  const userCard = useUserCardContext()
  const [query, setQuery] = React.useState("")
  const [sort, setSort] = React.useState<ChatterListSort>("alpha")
  const [scrollElement, setScrollElement] =
    React.useState<HTMLDivElement | null>(null)

  const visibleChatters = React.useMemo(() => {
    const needle = query.trim().replace(/^@/, "").toLowerCase()
    return liveChatters.filter((chatter) => {
      if (hideBlockedUsers && isUserBlocked(chatter.userId, chatter.login)) {
        return false
      }

      return matchesQuery(chatter.login, chatter.displayName, needle)
    })
  }, [hideBlockedUsers, isUserBlocked, liveChatters, query])

  const rows = React.useMemo(
    () => buildChatterRows(visibleChatters, sort),
    [sort, visibleChatters]
  )

  /* React will skip memoizing this hook because of the useVirtualizer hook */
  /* eslint-disable-next-line react-hooks/incompatible-library */
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: (index) => (rows[index]?.kind === "header" ? 32 : 36),
    overscan: 12,
    getItemKey: (index) => {
      const row = rows[index]
      if (!row) {
        return index
      }
      return row.kind === "header" ? `header:${row.id}` : row.chatter.login
    },
  })

  const emptyDescription = query.trim()
    ? "No chatters match that name."
    : "Chatters appear here as they talk."

  const showLoading = chattersLoading && visibleChatters.length === 0
  const showEmpty = !showLoading && rows.length === 0
  const showLoadingHint = chattersLoading && visibleChatters.length > 0

  React.useEffect(() => {
    ensureChattersSheetDismissPointerGuard()
  }, [])

  React.useLayoutEffect(() => {
    if (!open || !scrollElement) {
      return
    }

    virtualizer.measure()
  }, [open, rows.length, scrollElement, virtualizer])

  return (
    <>
      {open
        ? createPortal(
            <button
              type="button"
              aria-label="Close panel"
              className="fixed inset-0 z-50 hidden cursor-default border-0 bg-black/55 sm:block"
              onPointerDown={(event) => {
                if (
                  shouldPreventChattersSheetDismiss(event.target, channelLogin)
                ) {
                  return
                }

                onOpenChange(false)
              }}
            />,
            document.body
          )
        : null}
      <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
        <SheetContent
          side="right"
          showCloseButton={false}
          showOverlay={false}
          data-hotkey-surface="viewer-list"
          className="h-svh gap-0 p-0 data-[side=right]:w-full max-sm:data-[side=right]:border-l-0 data-[side=right]:sm:max-w-72 sm:data-[side=right]:border-l"
          onAnimationEnd={() => virtualizer.measure()}
          onInteractOutside={(event) => {
            if (shouldPreventChattersSheetDismiss(event.target, channelLogin)) {
              event.preventDefault()
            }
          }}
          onPointerDownOutside={(event) => {
            if (shouldPreventChattersSheetDismiss(event.target, channelLogin)) {
              event.preventDefault()
            }
          }}
          onFocusOutside={(event) => {
            if (shouldPreventChattersSheetDismiss(event.target, channelLogin)) {
              event.preventDefault()
            }
          }}
        >
          <SheetHeader className="h-11 shrink-0 flex-row items-center justify-between border-b border-border bg-sidebar px-4 py-0">
            <SheetTitle>Chatters</SheetTitle>
            <SheetClose asChild>
              <Button variant="ghost" size="icon-sm">
                <XIcon />
                <span className="sr-only">Close</span>
              </Button>
            </SheetClose>
          </SheetHeader>

          <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search for chatters..."
              aria-label="Search for chatters"
              className="h-8 min-w-0 flex-1 text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={
                sort === "recency" ? "Sort alphabetically" : "Sort by recent"
              }
              onClick={() =>
                setSort((current) =>
                  current === "recency" ? "alpha" : "recency"
                )
              }
            >
              Sort
              {sort === "recency" ? (
                <ClockIcon className="size-3.5" />
              ) : (
                <ArrowDownAZIcon className="size-3.5" />
              )}
            </Button>
          </div>

          {showLoadingHint ? (
            <div
              role="status"
              className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground"
            >
              <Spinner className="size-3.5" />
              Loading chatters...
            </div>
          ) : null}

          <div className="relative min-h-0 flex-1" aria-busy={chattersLoading}>
            <div
              ref={setScrollElement}
              className="chat-scroll absolute inset-0 overflow-y-auto overscroll-contain"
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
                          <span className="font-normal normal-case">
                            {row.count}
                          </span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="flex w-full cursor-pointer items-center px-4 py-1.5 text-left text-sm hover:bg-muted"
                          onClick={(event) => {
                            userCard?.openUserCard(
                              createUserCardTargetFromChatter(
                                row.chatter,
                                channelLogin
                              ),
                              event.currentTarget
                            )
                          }}
                        >
                          <span className="min-w-0 truncate font-medium">
                            {row.chatter.displayName}
                          </span>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            {showLoading ? (
              <div
                role="status"
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-popover px-4 text-center"
              >
                <Spinner className="size-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Loading chatters...
                </p>
              </div>
            ) : showEmpty ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-popover px-4 text-center">
                <UsersIcon className="size-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {emptyDescription}
                </p>
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
