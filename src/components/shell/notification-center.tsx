import * as React from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import {
  BellIcon,
  BellOffIcon,
  BellRingIcon,
  CheckCheckIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  HistoryIcon,
  RadioIcon,
  Trash2Icon,
  Undo2Icon,
  XIcon,
} from "lucide-react"

import { PingMatchText } from "@/components/shell/ping-match-text"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  useNotificationCenter,
  formatLiveNotificationText,
  type LiveNotification,
  type MissedPingNotification,
  type PingNotification,
} from "@/lib/highlights/notification-center"
import {
  formatMessageTimestamp,
  usePeepochatSettings,
} from "@/lib/peepochat/peepochat-context"
import { fetchTwitchUsersByLogin } from "@/lib/twitch/twitch-api"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import { clamp, cn } from "@/lib/utils"

const MISSED_DRAWER_DEFAULT_RATIO = 0.4
const MISSED_DRAWER_MIN_PX = 148
const PING_PANE_MIN_PX = 128
const MISSED_DRAWER_RESIZE_HIT_AREA_PX = 11

const profileImageCache = new Map<string, string>()

const notificationRelativeDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

const notificationRowClassName =
  "relative border-b border-border last:border-b-0 transition-colors hover:bg-muted/40"

function formatRelativeTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60_000)

  if (diffMinutes < 1) {
    return "Just now"
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours}h ago`
  }

  return notificationRelativeDateFormatter.format(date)
}

function shouldPreventNotificationsSheetDismiss(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest("[data-notifications-trigger]"))
  )
}

function NotificationEmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
        <BellIcon className="size-4 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

function NotificationRowActions({
  isUnread,
  onToggleRead,
  onRemove,
}: {
  isUnread: boolean
  onToggleRead: () => void
  onRemove: () => void
}) {
  const readActionLabel = isUnread ? "Mark as read" : "Unmark as read"

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            onClick={(event) => {
              event.stopPropagation()
              onToggleRead()
            }}
          >
            {isUnread ? (
              <CheckIcon className="size-3.5" />
            ) : (
              <Undo2Icon className="size-3.5" />
            )}
            <span className="sr-only">{readActionLabel}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">{readActionLabel}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            onClick={(event) => {
              event.stopPropagation()
              onRemove()
            }}
          >
            <Trash2Icon className="size-3.5" />
            <span className="sr-only">Remove</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Remove from history</TooltipContent>
      </Tooltip>
    </div>
  )
}

function NotificationBulkActions({
  unreadCount,
  totalCount,
  onMarkAllRead,
  onClear,
}: {
  unreadCount: number
  totalCount: number
  onMarkAllRead: () => void
  onClear: () => void
}) {
  if (totalCount === 0) {
    return null
  }

  return (
    <div className="flex shrink-0 items-center justify-between px-4 py-2">
      <Button type="button" variant="outline" size="xs" onClick={onClear}>
        <Trash2Icon />
        Clear history
      </Button>
      <Button
        type="button"
        variant="outline"
        size="xs"
        disabled={unreadCount === 0}
        onClick={onMarkAllRead}
      >
        <CheckCheckIcon />
        Mark all as read
      </Button>
    </div>
  )
}

function ChannelAvatar({
  login,
  displayName,
  profileImageUrl,
}: {
  login: string
  displayName: string
  profileImageUrl?: string
}) {
  if (profileImageUrl) {
    return (
      <img
        src={profileImageUrl}
        alt=""
        className="size-9 shrink-0 rounded-full object-cover"
        loading="lazy"
        decoding="async"
      />
    )
  }

  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary uppercase">
      {(displayName || login).slice(0, 2)}
    </span>
  )
}

function PingUserAvatar({
  userName,
  displayName,
}: {
  userName: string
  displayName: string
}) {
  const { account } = usePeepochatSettings()
  const cacheKey = userName.toLowerCase()
  const [fetchedProfileImageUrl, setFetchedProfileImageUrl] = React.useState<
    string | null
  >(null)
  const profileImageUrl =
    profileImageCache.get(cacheKey) ?? fetchedProfileImageUrl

  React.useEffect(() => {
    if (profileImageCache.has(cacheKey) || !account) {
      return
    }

    let cancelled = false
    void fetchTwitchUsersByLogin(
      [userName],
      account.accessToken,
      account.clientId
    )
      .then((users) => {
        if (cancelled) {
          return
        }
        const url = users[0]?.profileImageUrl
        if (url) {
          profileImageCache.set(cacheKey, url)
          setFetchedProfileImageUrl(url)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [account, cacheKey, userName])

  if (profileImageUrl) {
    return (
      <img
        src={profileImageUrl}
        alt=""
        className="size-9 shrink-0 rounded-full object-cover"
        loading="lazy"
        decoding="async"
      />
    )
  }

  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary uppercase">
      {displayName.slice(0, 2)}
    </span>
  )
}

function PingNotificationRow({
  notification,
  channelLabel,
  onMarkRead,
  onMarkUnread,
  onRemove,
  onNavigate,
}: {
  notification: PingNotification
  channelLabel: string
  onMarkRead: (id: string) => void
  onMarkUnread: (id: string) => void
  onRemove: (id: string) => void
  onNavigate: (login: string) => void
}) {
  const isUnread = notification.readAt === null

  return (
    <div
      className={`${notificationRowClassName} ${isUnread ? "" : "opacity-70"}`}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          type="button"
          className="min-w-0 flex-1 cursor-pointer text-left"
          onClick={() => onNavigate(notification.channelLogin)}
        >
          <div className="flex gap-3">
            <PingUserAvatar
              userName={notification.userName}
              displayName={notification.displayName}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {notification.displayName}
                </span>
                <time
                  className="shrink-0 text-xs text-muted-foreground"
                  dateTime={notification.receivedAt}
                  title={
                    formatMessageTimestamp(
                      notification.receivedAt,
                      "12-hour-meridiem"
                    ) ?? undefined
                  }
                >
                  {formatRelativeTime(notification.receivedAt)}
                </time>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                Pinged you in {channelLabel}
              </p>
              <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-foreground/90">
                <PingMatchText
                  text={notification.text}
                  ruleId={notification.ruleId}
                  matchPattern={notification.matchPattern}
                />
              </p>
            </div>
          </div>
        </button>
        <NotificationRowActions
          isUnread={isUnread}
          onToggleRead={() =>
            isUnread
              ? onMarkRead(notification.id)
              : onMarkUnread(notification.id)
          }
          onRemove={() => onRemove(notification.id)}
        />
      </div>
    </div>
  )
}

function LiveNotificationRow({
  notification,
  channelLabel,
  profileImageUrl,
  onMarkRead,
  onMarkUnread,
  onRemove,
  onNavigate,
}: {
  notification: LiveNotification
  channelLabel: string
  profileImageUrl?: string
  onMarkRead: (id: string) => void
  onMarkUnread: (id: string) => void
  onRemove: (id: string) => void
  onNavigate: (login: string) => void
}) {
  const isUnread = notification.readAt === null

  return (
    <div
      className={`${notificationRowClassName} ${isUnread ? "" : "opacity-70"}`}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          type="button"
          className="min-w-0 flex-1 cursor-pointer text-left"
          onClick={() => onNavigate(notification.channelLogin)}
        >
          <div className="flex gap-3">
            <ChannelAvatar
              login={notification.channelLogin}
              displayName={channelLabel}
              profileImageUrl={profileImageUrl}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {channelLabel}
                </span>
                <time
                  className="shrink-0 text-xs text-muted-foreground"
                  dateTime={notification.wentLiveAt}
                  title={
                    formatMessageTimestamp(
                      notification.wentLiveAt,
                      "12-hour-meridiem"
                    ) ?? undefined
                  }
                >
                  {formatRelativeTime(notification.wentLiveAt)}
                </time>
              </div>
              <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-foreground/90">
                {formatLiveNotificationText(
                  notification.gameName ?? "",
                  notification.title
                )}
              </p>
            </div>
          </div>
        </button>
        <NotificationRowActions
          isUnread={isUnread}
          onToggleRead={() =>
            isUnread
              ? onMarkRead(notification.id)
              : onMarkUnread(notification.id)
          }
          onRemove={() => onRemove(notification.id)}
        />
      </div>
    </div>
  )
}

function MissedPingNotificationRow({
  notification,
  channelLabel,
  onNavigate,
}: {
  notification: MissedPingNotification
  channelLabel: string
  onNavigate: (login: string) => void
}) {
  return (
    <div className={notificationRowClassName}>
      <button
        type="button"
        className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left"
        onClick={() => onNavigate(notification.channelLogin)}
      >
        <PingUserAvatar
          userName={notification.userName}
          displayName={notification.displayName}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {notification.displayName}
            </span>
            <time
              className="shrink-0 text-xs text-muted-foreground"
              dateTime={notification.receivedAt}
              title={
                formatMessageTimestamp(
                  notification.receivedAt,
                  "12-hour-meridiem"
                ) ?? undefined
              }
            >
              {formatRelativeTime(notification.receivedAt)}
            </time>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            Pinged you in {channelLabel}
          </p>
          <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-foreground/90">
            <PingMatchText
              text={notification.text}
              ruleId={notification.ruleId}
              matchPattern={notification.matchPattern}
            />
          </p>
        </div>
      </button>
    </div>
  )
}

function clampMissedDrawerRatio(ratio: number, containerHeight: number) {
  if (containerHeight <= 0) {
    return MISSED_DRAWER_DEFAULT_RATIO
  }

  const minRatio = MISSED_DRAWER_MIN_PX / containerHeight
  const maxRatio = 1 - PING_PANE_MIN_PX / containerHeight
  if (maxRatio <= minRatio) {
    return clamp(ratio, 0.25, 0.75)
  }

  return clamp(ratio, minRatio, maxRatio)
}

function MissedDrawerResizeHandle({
  onPointerDown,
  onDoubleClick,
}: {
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
  onDoubleClick: () => void
}) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize missed pings"
      className="group relative z-10 shrink-0 cursor-row-resize touch-none bg-border transition-colors hover:bg-primary/60"
      style={{ height: 1 }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      <div
        className="absolute inset-x-0 top-1/2 -translate-y-1/2 cursor-row-resize bg-transparent"
        style={{ height: MISSED_DRAWER_RESIZE_HIT_AREA_PX }}
      />
    </div>
  )
}

function MissedPingsDrawer({
  notifications,
  channelMetaByLogin,
  expanded,
  heightRatio,
  onExpandedChange,
  onDismissAll,
  onNavigate,
}: {
  notifications: MissedPingNotification[]
  channelMetaByLogin: Map<string, { label: string; profileImageUrl?: string }>
  expanded: boolean
  heightRatio: number
  onExpandedChange: (expanded: boolean) => void
  onDismissAll: () => void
  onNavigate: (login: string) => void
}) {
  if (notifications.length === 0) {
    return null
  }

  return (
    <div
      className={cn(
        "flex min-h-0 shrink-0 flex-col bg-muted/20",
        expanded ? "" : "border-t border-border"
      )}
      style={expanded ? { height: `${heightRatio * 100}%` } : undefined}
    >
      <div className="flex shrink-0 items-start justify-between gap-1 px-2 py-1.5">
        <button
          type="button"
          className="min-w-0 flex-1 rounded-md px-2 py-1 text-left hover:bg-muted/70"
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
        >
          <div className="flex items-center gap-1.5">
            {expanded ? (
              <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronUpIcon className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <HistoryIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <p className="truncate text-sm font-medium text-foreground">
              You may have missed
            </p>
            <span className="shrink-0 text-xs text-muted-foreground">
              ({notifications.length})
            </span>
          </div>
          {expanded ? (
            <p className="mt-0.5 pl-9 text-xs text-muted-foreground">
              Pings from before you connected
            </p>
          ) : null}
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="mt-1 text-muted-foreground"
              onClick={onDismissAll}
            >
              <XIcon className="size-3.5" />
              <span className="sr-only">Remove</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Remove</TooltipContent>
        </Tooltip>
      </div>
      {expanded ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain border-t border-border">
          {notifications.map((notification) => {
            const channelMeta = channelMetaByLogin.get(
              notification.channelLogin
            )

            return (
              <MissedPingNotificationRow
                key={notification.id}
                notification={notification}
                channelLabel={channelMeta?.label ?? notification.channelLogin}
                onNavigate={onNavigate}
              />
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function PingNotificationsPane({
  pingNotifications,
  missedPingNotifications,
  channelMetaByLogin,
  expanded,
  drawerRatio,
  onExpandedChange,
  onDrawerRatioChange,
  onDismissAll,
  onNavigate,
  onMarkRead,
  onMarkUnread,
  onRemove,
}: {
  pingNotifications: PingNotification[]
  missedPingNotifications: MissedPingNotification[]
  channelMetaByLogin: Map<string, { label: string; profileImageUrl?: string }>
  expanded: boolean
  drawerRatio: number
  onExpandedChange: (expanded: boolean) => void
  onDrawerRatioChange: (ratio: number) => void
  onDismissAll: () => void
  onNavigate: (login: string) => void
  onMarkRead: (id: string) => void
  onMarkUnread: (id: string) => void
  onRemove: (id: string) => void
}) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const drawerRatioRef = React.useRef(drawerRatio)
  const onDrawerRatioChangeRef = React.useRef(onDrawerRatioChange)
  const frameRef = React.useRef<number | null>(null)
  const hasMissed = missedPingNotifications.length > 0
  const showResize = hasMissed && expanded

  React.useEffect(() => {
    drawerRatioRef.current = drawerRatio
  }, [drawerRatio])

  React.useEffect(() => {
    onDrawerRatioChangeRef.current = onDrawerRatioChange
  }, [onDrawerRatioChange])

  React.useEffect(() => {
    const container = containerRef.current
    if (!container || !showResize) {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height ?? 0
      const next = clampMissedDrawerRatio(drawerRatioRef.current, height)
      if (next !== drawerRatioRef.current) {
        onDrawerRatioChangeRef.current(next)
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [showResize])

  const handleResizePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const container = containerRef.current
      if (!container) {
        return
      }

      const previousCursor = document.body.style.cursor
      const previousUserSelect = document.body.style.userSelect
      document.body.style.cursor = "row-resize"
      document.body.style.userSelect = "none"

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const rect = container.getBoundingClientRect()
        if (rect.height <= 0) {
          return
        }

        const nextRatio = clampMissedDrawerRatio(
          (rect.bottom - moveEvent.clientY) / rect.height,
          rect.height
        )

        if (frameRef.current !== null) {
          cancelAnimationFrame(frameRef.current)
        }

        frameRef.current = requestAnimationFrame(() => {
          onDrawerRatioChangeRef.current(nextRatio)
          frameRef.current = null
        })
      }

      const handlePointerUp = () => {
        document.body.style.cursor = previousCursor
        document.body.style.userSelect = previousUserSelect
        window.removeEventListener("pointermove", handlePointerMove)
        window.removeEventListener("pointerup", handlePointerUp)
        if (frameRef.current !== null) {
          cancelAnimationFrame(frameRef.current)
          frameRef.current = null
        }
      }

      window.addEventListener("pointermove", handlePointerMove)
      window.addEventListener("pointerup", handlePointerUp)
    },
    []
  )

  const handleResizeReset = React.useCallback(() => {
    const height = containerRef.current?.getBoundingClientRect().height ?? 0
    onDrawerRatioChange(
      clampMissedDrawerRatio(MISSED_DRAWER_DEFAULT_RATIO, height)
    )
  }, [onDrawerRatioChange])

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <NotificationList
        emptyMessage="No ping notifications yet."
        isEmpty={pingNotifications.length === 0}
      >
        {pingNotifications.map((notification) => {
          const channelMeta = channelMetaByLogin.get(notification.channelLogin)

          return (
            <PingNotificationRow
              key={notification.id}
              notification={notification}
              channelLabel={channelMeta?.label ?? notification.channelLogin}
              onMarkRead={onMarkRead}
              onMarkUnread={onMarkUnread}
              onRemove={onRemove}
              onNavigate={onNavigate}
            />
          )
        })}
      </NotificationList>
      {showResize ? (
        <MissedDrawerResizeHandle
          onPointerDown={handleResizePointerDown}
          onDoubleClick={handleResizeReset}
        />
      ) : null}
      <MissedPingsDrawer
        notifications={missedPingNotifications}
        channelMetaByLogin={channelMetaByLogin}
        expanded={expanded}
        heightRatio={drawerRatio}
        onExpandedChange={onExpandedChange}
        onDismissAll={onDismissAll}
        onNavigate={onNavigate}
      />
    </div>
  )
}

function NotificationList({
  children,
  emptyMessage,
  isEmpty,
}: {
  children: React.ReactNode
  emptyMessage: string
  isEmpty: boolean
}) {
  if (isEmpty) {
    return <NotificationEmptyState message={emptyMessage} />
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
      {children}
    </div>
  )
}

function useChannelMetaByLogin() {
  const { channels } = usePeepochatSettings()

  return React.useMemo(() => {
    const map = new Map<string, { label: string; profileImageUrl?: string }>()
    for (const channel of channels) {
      const login = normalizeChannelLogin(channel.login)
      map.set(login, {
        label: channel.displayName || channel.login,
        profileImageUrl: channel.profileImageUrl,
      })
    }
    return map
  }, [channels])
}

export function NotificationCenter({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { config, setActiveChannel, updateConfig } = usePeepochatSettings()
  const doNotDisturbEnabled = config.highlights.doNotDisturbEnabled
  const channelMetaByLogin = useChannelMetaByLogin()
  const {
    pingNotifications,
    liveNotifications,
    missedPingNotifications,
    pingCount,
    liveCount,
    totalCount,
    dismissPing,
    dismissLive,
    dismissAllPings,
    dismissAllLive,
    dismissAllMissed,
    markPingRead,
    markLiveRead,
    markPingUnread,
    markLiveUnread,
    markAllPingsRead,
    markAllLiveRead,
  } = useNotificationCenter()

  const liveNotificationsEnabled =
    config.highlights.livePushNotificationsEnabled
  const ignoreNextClickRef = React.useRef(false)

  const [activeTab, setActiveTab] = React.useState<"pings" | "live">("pings")
  const [missedDrawerExpanded, setMissedDrawerExpanded] = React.useState(true)
  const [missedDrawerRatio, setMissedDrawerRatio] = React.useState(
    MISSED_DRAWER_DEFAULT_RATIO
  )

  const resolvedTab =
    !liveNotificationsEnabled && activeTab === "live" ? "pings" : activeTab

  const handleNavigate = React.useCallback(
    (login: string) => {
      setActiveChannel(login)
      onOpenChange(false)
    },
    [onOpenChange, setActiveChannel]
  )

  const handleDismissMissed = React.useCallback(() => {
    dismissAllMissed()
    setMissedDrawerExpanded(true)
  }, [dismissAllMissed])

  const unreadCount = resolvedTab === "pings" ? pingCount : liveCount
  const historyCount =
    resolvedTab === "pings"
      ? pingNotifications.length
      : liveNotifications.length
  const handleMarkAllRead =
    resolvedTab === "pings" ? markAllPingsRead : markAllLiveRead
  const handleClearHistory =
    resolvedTab === "pings" ? dismissAllPings : dismissAllLive

  const handleToggleDoNotDisturb = React.useCallback(() => {
    const nextEnabled = !doNotDisturbEnabled
    updateConfig((current) => ({
      ...current,
      highlights: {
        ...current.highlights,
        doNotDisturbEnabled: nextEnabled,
      },
    }))
    toast(nextEnabled ? "Do not disturb is on" : "Do not disturb is off")
  }, [doNotDisturbEnabled, updateConfig])

  const pingList = (
    <PingNotificationsPane
      pingNotifications={pingNotifications}
      missedPingNotifications={missedPingNotifications}
      channelMetaByLogin={channelMetaByLogin}
      expanded={missedDrawerExpanded}
      drawerRatio={missedDrawerRatio}
      onExpandedChange={setMissedDrawerExpanded}
      onDrawerRatioChange={setMissedDrawerRatio}
      onDismissAll={handleDismissMissed}
      onNavigate={handleNavigate}
      onMarkRead={markPingRead}
      onMarkUnread={markPingUnread}
      onRemove={dismissPing}
    />
  )

  const liveList = (
    <NotificationList
      emptyMessage="No live notifications yet."
      isEmpty={liveNotifications.length === 0}
    >
      {liveNotifications.map((notification) => {
        const channelMeta = channelMetaByLogin.get(notification.channelLogin)

        return (
          <LiveNotificationRow
            key={notification.id}
            notification={notification}
            channelLabel={channelMeta?.label ?? notification.channelLogin}
            profileImageUrl={channelMeta?.profileImageUrl}
            onMarkRead={markLiveRead}
            onMarkUnread={markLiveUnread}
            onRemove={dismissLive}
            onNavigate={handleNavigate}
          />
        )
      })}
    </NotificationList>
  )

  const bulkActions = (
    <NotificationBulkActions
      unreadCount={unreadCount}
      totalCount={historyCount}
      onMarkAllRead={handleMarkAllRead}
      onClear={handleClearHistory}
    />
  )

  return (
    <>
      {open
        ? createPortal(
            <button
              type="button"
              aria-label="Close panel"
              className="fixed inset-0 z-50 hidden cursor-default border-0 bg-black/55 sm:block"
              onPointerDown={(event) => {
                if (shouldPreventNotificationsSheetDismiss(event.target)) {
                  return
                }

                onOpenChange(false)
              }}
            />,
            document.body
          )
        : null}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            className="relative"
            data-notifications-trigger=""
            aria-expanded={open}
            aria-label={
              doNotDisturbEnabled
                ? "Notifications — Do not disturb is on"
                : "Notification Center"
            }
            onClick={() => {
              if (ignoreNextClickRef.current) {
                ignoreNextClickRef.current = false
                return
              }
              onOpenChange(!open)
            }}
            onContextMenu={(event) => {
              event.preventDefault()
              ignoreNextClickRef.current = true
              handleToggleDoNotDisturb()
            }}
          >
            {doNotDisturbEnabled ? (
              <BellOffIcon className="size-4 text-destructive" />
            ) : (
              <BellIcon className="size-4" />
            )}
            {totalCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {totalCount > 99 ? "99+" : totalCount}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {doNotDisturbEnabled ? "Do not disturb is on" : "Notification Center"}
        </TooltipContent>
      </Tooltip>

      <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
        <SheetContent
          side="right"
          showCloseButton={false}
          showOverlay={false}
          data-hotkey-surface="notifications"
          className="h-svh gap-0 p-0 data-[side=right]:w-full max-sm:data-[side=right]:border-l-0 sm:max-w-md sm:data-[side=right]:border-l"
          onInteractOutside={(event) => {
            if (shouldPreventNotificationsSheetDismiss(event.target)) {
              event.preventDefault()
            }
          }}
          onPointerDownOutside={(event) => {
            if (shouldPreventNotificationsSheetDismiss(event.target)) {
              event.preventDefault()
            }
          }}
          onFocusOutside={(event) => {
            if (shouldPreventNotificationsSheetDismiss(event.target)) {
              event.preventDefault()
            }
          }}
        >
          <SheetHeader className="h-11 shrink-0 flex-row items-center justify-between border-b border-border bg-sidebar px-4 py-0">
            <SheetTitle>Notifications</SheetTitle>
            <SheetClose asChild>
              <Button variant="ghost" size="icon-sm">
                <XIcon />
                <span className="sr-only">Close</span>
              </Button>
            </SheetClose>
          </SheetHeader>

          {liveNotificationsEnabled ? (
            <Tabs
              value={resolvedTab}
              onValueChange={(value) => {
                setActiveTab(value as "pings" | "live")
              }}
              className="flex min-h-0 flex-1 flex-col gap-0"
            >
              <div className="shrink-0 border-b border-border px-4 py-2">
                <TabsList className="w-full">
                  <TabsTrigger value="pings" className="flex-1">
                    <BellRingIcon className="size-3.5" />
                    Pings
                    {pingCount > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({pingCount} unread)
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="live" className="flex-1">
                    <RadioIcon className="size-3.5" />
                    Live
                    {liveCount > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({liveCount} unread)
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>
              </div>

              {bulkActions}

              <TabsContent
                value="pings"
                className="mt-0 flex min-h-0 flex-1 flex-col"
              >
                {pingList}
              </TabsContent>
              <TabsContent
                value="live"
                className="mt-0 flex min-h-0 flex-1 flex-col"
              >
                {liveList}
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              {bulkActions}
              {pingList}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
