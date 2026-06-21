import * as React from "react"
import {
  BellIcon,
  BellRingIcon,
  CheckIcon,
  RadioIcon,
  Trash2Icon,
} from "lucide-react"

import { PingMatchText } from "@/components/shell/ping-match-text"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
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
  type PingNotification,
} from "@/lib/highlights/notification-center"
import {
  formatMessageTimestamp,
  usePeepochatSettings,
} from "@/lib/peepochat/peepochat-context"
import { fetchTwitchUsersByLogin } from "@/lib/twitch/twitch-api"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"

const profileImageCache = new Map<string, string>()

const notificationRowClassName =
  "relative border-b border-border last:border-b-0 transition-colors hover:bg-muted/40"

const notificationRowButtonClassName =
  "w-full cursor-pointer px-4 py-3 text-left"

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

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

function NotificationEmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
        <BellIcon className="size-4 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

function NotificationDismissButton({ onDismiss }: { onDismiss: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-2 right-2 text-muted-foreground"
          onClick={(event) => {
            event.stopPropagation()
            onDismiss()
          }}
        >
          <CheckIcon className="size-3.5" />
          <span className="sr-only">Dismiss</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">Dismiss</TooltipContent>
    </Tooltip>
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
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold uppercase text-primary">
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
  const profileImageUrl = profileImageCache.get(cacheKey) ?? fetchedProfileImageUrl

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
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold uppercase text-primary">
      {displayName.slice(0, 2)}
    </span>
  )
}

function PingNotificationRow({
  notification,
  channelLabel,
  onDismiss,
  onNavigate,
}: {
  notification: PingNotification
  channelLabel: string
  onDismiss: (id: string) => void
  onNavigate: (login: string) => void
}) {
  return (
    <div className={notificationRowClassName}>
      <button
        type="button"
        className={notificationRowButtonClassName}
        onClick={() => onNavigate(notification.channelLogin)}
      >
        <div className="flex gap-3 pr-6">
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
      <NotificationDismissButton onDismiss={() => onDismiss(notification.id)} />
    </div>
  )
}

function LiveNotificationRow({
  notification,
  channelLabel,
  profileImageUrl,
  onDismiss,
  onNavigate,
}: {
  notification: LiveNotification
  channelLabel: string
  profileImageUrl?: string
  onDismiss: (id: string) => void
  onNavigate: (login: string) => void
}) {
  return (
    <div className={notificationRowClassName}>
      <button
        type="button"
        className={notificationRowButtonClassName}
        onClick={() => onNavigate(notification.channelLogin)}
      >
        <div className="flex gap-3 pr-6">
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
      <NotificationDismissButton onDismiss={() => onDismiss(notification.id)} />
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
    <ScrollArea className="max-h-[min(24rem,60vh)]">
      {children}
    </ScrollArea>
  )
}

function useChannelMetaByLogin() {
  const { channels } = usePeepochatSettings()

  return React.useMemo(() => {
    const map = new Map<
      string,
      { label: string; profileImageUrl?: string }
    >()
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

export function NotificationCenter() {
  const [open, setOpen] = React.useState(false)
  const { config, setActiveChannel } = usePeepochatSettings()
  const channelMetaByLogin = useChannelMetaByLogin()
  const {
    pingNotifications,
    liveNotifications,
    pingCount,
    liveCount,
    totalCount,
    dismissPing,
    dismissLive,
    dismissAllPings,
    dismissAllLive,
  } = useNotificationCenter()

  const liveNotificationsEnabled =
    config.highlights.livePushNotificationsEnabled

  const [activeTab, setActiveTab] = React.useState<"pings" | "live">("pings")

  const resolvedTab =
    !liveNotificationsEnabled && activeTab === "live" ? "pings" : activeTab

  const handleNavigate = React.useCallback(
    (login: string) => {
      setActiveChannel(login)
      setOpen(false)
    },
    [setActiveChannel]
  )

  const activeCount = resolvedTab === "pings" ? pingCount : liveCount
  const handleDismissAll =
    resolvedTab === "pings" ? dismissAllPings : dismissAllLive

  const pingList = (
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
            channelLabel={
              channelMeta?.label ?? notification.channelLogin
            }
            onDismiss={dismissPing}
            onNavigate={handleNavigate}
          />
        )
      })}
    </NotificationList>
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
            channelLabel={
              channelMeta?.label ?? notification.channelLogin
            }
            profileImageUrl={channelMeta?.profileImageUrl}
            onDismiss={dismissLive}
            onNavigate={handleNavigate}
          />
        )
      })}
    </NotificationList>
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <PopoverTrigger asChild>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="relative"
              aria-label="Notifications"
            >
              <BellIcon className="size-4" />
              {totalCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {totalCount > 99 ? "99+" : totalCount}
                </span>
              )}
            </Button>
          </TooltipTrigger>
        </PopoverTrigger>
        <TooltipContent>Notifications</TooltipContent>
      </Tooltip>

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        className="flex w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden p-0"
        onWheel={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <h2 className="font-heading text-sm font-medium text-foreground">
            Notifications
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`h-7 shrink-0 gap-1.5 text-xs text-muted-foreground ${
              activeCount === 0 ? "invisible pointer-events-none" : ""
            }`}
            disabled={activeCount === 0}
            onClick={handleDismissAll}
          >
            <Trash2Icon className="size-3.5" />
            Clear all
          </Button>
        </div>

        {liveNotificationsEnabled ? (
          <Tabs
            value={resolvedTab}
            onValueChange={(value) => {
              setActiveTab(value as "pings" | "live")
            }}
            className="flex min-h-0 flex-col gap-0"
          >
            <div className="shrink-0 border-b border-border px-4 py-2">
              <TabsList className="w-full">
                <TabsTrigger value="pings" className="flex-1">
                  <BellRingIcon className="size-3.5" />
                  Pings
                  {pingCount > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({pingCount})
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="live" className="flex-1">
                  <RadioIcon className="size-3.5" />
                  Live
                  {liveCount > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({liveCount})
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="pings" className="mt-0">
              {pingList}
            </TabsContent>
            <TabsContent value="live" className="mt-0">
              {liveList}
            </TabsContent>
          </Tabs>
        ) : (
          pingList
        )}
      </PopoverContent>
    </Popover>
  )
}
