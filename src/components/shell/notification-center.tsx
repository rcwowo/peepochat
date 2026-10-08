import * as React from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import {
  BellIcon,
  BellOffIcon,
  BellRingIcon,
  CheckCheckIcon,
  CheckIcon,
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
import { formatMessageTimestamp } from "@/lib/chat/presentation/timestamp"
import { usePeepochatSettings } from "@/lib/peepochat/peepochat-context"
import { normalizeChannelLogin } from "@/lib/twitch/channel/channel"
import {
  fetchUserAvatarUrl,
  getCachedUserAvatarUrl,
  subscribeToUserAvatars,
} from "@/lib/twitch/channel/user-avatars"

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

function NotificationTabCount({ count }: { count: number }) {
  if (count <= 0) {
    return null
  }

  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      ({count > 99 ? "99+" : count})
    </span>
  )
}

function NotificationTabTrigger({
  value,
  icon: Icon,
  label,
  count,
}: {
  value: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  count: number
}) {
  return (
    <TabsTrigger value={value} className="flex-1">
      <Icon className="size-3.5" />
      {label}
      <NotificationTabCount count={count} />
    </TabsTrigger>
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
  const getSnapshot = React.useCallback(
    () => getCachedUserAvatarUrl(cacheKey) ?? null,
    [cacheKey]
  )
  const profileImageUrl = React.useSyncExternalStore(
    subscribeToUserAvatars,
    getSnapshot,
    getSnapshot
  )

  React.useEffect(() => {
    if (!account) {
      return
    }

    void fetchUserAvatarUrl(userName, account.accessToken, account.clientId)
  }, [account, userName])

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
  onMarkRead,
  onMarkUnread,
  onRemove,
  onNavigate,
}: {
  notification: MissedPingNotification
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

function MissedPingSection({
  isExpanded,
  onExpandedChange,
  missedCount,
  onMarkAllRead,
  onClear,
  children,
}: {
  isExpanded: boolean
  onExpandedChange: (isExpanded: boolean) => void
  missedCount: number
  onMarkAllRead: () => void
  onClear: () => void
  children: React.ReactNode
}) {
  const toggle = React.useCallback(() => {
    onExpandedChange(!isExpanded)
  }, [isExpanded, onExpandedChange])

  return (
    <div className="shrink-0">
      {isExpanded ? (
        <div
          id="notifications-missed-section"
          className="max-h-80 shrink-0 overflow-y-auto overscroll-y-contain border-y border-border"
        >
          {children}
        </div>
      ) : null}
      <div
        className={
          isExpanded
            ? "flex shrink-0 items-center transition-colors hover:bg-muted/40"
            : "flex shrink-0 items-center border-t border-border transition-colors hover:bg-muted/40"
        }
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-4 py-2.5 text-left"
          aria-expanded={isExpanded}
          aria-controls="notifications-missed-section"
          onClick={toggle}
        >
          <HistoryIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium text-foreground">
            Missed pings
          </span>
          <NotificationTabCount count={missedCount} />
        </button>
        {isExpanded ? (
          <div className="flex shrink-0 items-center">
            {missedCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground"
                onClick={onMarkAllRead}
              >
                <CheckCheckIcon className="size-3.5" />
                <span className="sr-only">Mark all missed pings as read</span>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              onClick={onClear}
            >
              <Trash2Icon className="size-3.5" />
              <span className="sr-only">Clear missed pings</span>
            </Button>
          </div>
        ) : null}
        <button
          type="button"
          className="flex shrink-0 cursor-pointer items-center self-stretch px-3.5"
          aria-expanded={isExpanded}
          aria-controls="notifications-missed-section"
          aria-label={
            isExpanded ? "Collapse missed pings" : "Expand missed pings"
          }
          onClick={toggle}
        >
          <ChevronUpIcon
            className={`size-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>
    </div>
  )
}

function DoNotDisturbToggle({
  enabled,
  onEnabledChange,
}: {
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Do not disturb"
          data-state={enabled ? "checked" : "unchecked"}
          onClick={() => onEnabledChange(!enabled)}
          className="group/dnd relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-all outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=checked]:bg-destructive data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80"
        >
          <span className="pointer-events-none relative block size-5 rounded-full bg-background ring-0 transition-transform group-data-[state=checked]/dnd:translate-x-[calc(100%-2px)] dark:group-data-[state=unchecked]/dnd:bg-foreground">
            {enabled ? (
              <BellOffIcon
                strokeWidth={2.5}
                className="absolute inset-0 m-auto size-4 text-destructive"
              />
            ) : (
              <BellIcon
                strokeWidth={2.5}
                className="absolute inset-0 m-auto size-4 text-foreground dark:text-background"
              />
            )}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {enabled ? "Do not disturb is on" : "Do not disturb is off"}
      </TooltipContent>
    </Tooltip>
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
    missedCount,
    totalCount,
    dismissPing,
    dismissLive,
    dismissAllPings,
    dismissAllLive,
    dismissAllMissed,
    dismissMissed,
    markPingRead,
    markLiveRead,
    markPingUnread,
    markLiveUnread,
    markMissedRead,
    markMissedUnread,
    markAllPingsRead,
    markAllLiveRead,
    markAllMissedRead,
  } = useNotificationCenter()

  const liveNotificationsEnabled =
    config.highlights.livePushNotificationsEnabled
  const ignoreNextClickRef = React.useRef(false)

  const [activeTab, setActiveTab] = React.useState<"pings" | "live">("pings")
  const [isMissedSectionExpanded, setIsMissedSectionExpanded] =
    React.useState(false)

  const resolvedTab =
    !liveNotificationsEnabled && activeTab === "live" ? "pings" : activeTab

  const handleNavigate = React.useCallback(
    (login: string) => {
      setActiveChannel(login)
      onOpenChange(false)
    },
    [onOpenChange, setActiveChannel]
  )

  const unreadCount = resolvedTab === "live" ? liveCount : pingCount
  const historyCount =
    resolvedTab === "live" ? liveNotifications.length : pingNotifications.length
  const handleMarkAllRead =
    resolvedTab === "live" ? markAllLiveRead : markAllPingsRead
  const handleClearHistory =
    resolvedTab === "live" ? dismissAllLive : dismissAllPings

  const handleSetDoNotDisturb = React.useCallback(
    (nextEnabled: boolean) => {
      updateConfig((current) => ({
        ...current,
        highlights: {
          ...current.highlights,
          doNotDisturbEnabled: nextEnabled,
        },
      }))
    },
    [updateConfig]
  )

  const handleToggleDoNotDisturb = React.useCallback(() => {
    const nextEnabled = !doNotDisturbEnabled
    handleSetDoNotDisturb(nextEnabled)
    toast(nextEnabled ? "Do not disturb is on" : "Do not disturb is off")
  }, [doNotDisturbEnabled, handleSetDoNotDisturb])

  const pingList = (
    <div className="flex min-h-0 flex-1 flex-col">
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
              onMarkRead={markPingRead}
              onMarkUnread={markPingUnread}
              onRemove={dismissPing}
              onNavigate={handleNavigate}
            />
          )
        })}
      </NotificationList>
      {missedPingNotifications.length > 0 ? (
        <MissedPingSection
          isExpanded={isMissedSectionExpanded}
          onExpandedChange={setIsMissedSectionExpanded}
          missedCount={missedCount}
          onMarkAllRead={markAllMissedRead}
          onClear={dismissAllMissed}
        >
          {missedPingNotifications.map((notification) => {
            const channelMeta = channelMetaByLogin.get(
              notification.channelLogin
            )

            return (
              <MissedPingNotificationRow
                key={notification.id}
                notification={notification}
                channelLabel={channelMeta?.label ?? notification.channelLogin}
                onMarkRead={markMissedRead}
                onMarkUnread={markMissedUnread}
                onRemove={dismissMissed}
                onNavigate={handleNavigate}
              />
            )
          })}
        </MissedPingSection>
      ) : null}
    </div>
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
            <div className="flex items-center gap-1">
              <DoNotDisturbToggle
                enabled={doNotDisturbEnabled}
                onEnabledChange={handleSetDoNotDisturb}
              />
              <SheetClose asChild>
                <Button variant="ghost" size="icon-sm">
                  <XIcon />
                  <span className="sr-only">Close</span>
                </Button>
              </SheetClose>
            </div>
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
                  <NotificationTabTrigger
                    value="pings"
                    icon={BellRingIcon}
                    label="Pings"
                    count={pingCount}
                  />
                  <NotificationTabTrigger
                    value="live"
                    icon={RadioIcon}
                    label="Live"
                    count={liveCount}
                  />
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
            <div className="flex min-h-0 flex-1 flex-col gap-0">
              {bulkActions}
              {pingList}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
