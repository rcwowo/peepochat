import * as React from "react"
import {
  BanIcon,
  CalendarDaysIcon,
  ClockIcon,
  CopyIcon,
  EllipsisIcon,
  GemIcon,
  ShieldIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
  SparklesIcon,
  UserXIcon,
  UsersIcon,
  VideoIcon,
  XIcon,
  ScrollTextIcon,
  UserSquare2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { ChatMessageBody } from "@/components/chat/chat-message-body"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { type UserCardAction } from "@/hooks/twitch/use-user-card"
import type { useUserCard } from "@/hooks/twitch/use-user-card"
import type { UserCardTarget } from "@/lib/chat/user-card"
import type { TwitchSelfChatState } from "@/lib/twitch/twitch-chat-types"
import {
  actorIsBroadcaster,
  canManageModerators,
  canManageVips,
  canModerateTarget,
} from "@/lib/chat/moderation-permissions"
import {
  chatlogsUserUrl,
  MODERATION_TIMEOUT_PRESETS,
  openExternalTool,
  twitchViewerCardUrl,
} from "@/lib/chat/moderation-tools"
import { twitchChannelUrl } from "@/lib/chat/user-card"
import type {
  MessageTimestampFormat,
  TwitchAccount,
} from "@/lib/peepochat/peepochat-config"
import { formatMessageTimestamp } from "@/lib/peepochat/peepochat-context"
import { hasBlockedUsersManageScope } from "@/hooks/twitch/use-blocked-users"
import type { TwitchChatMessage } from "@/lib/twitch/twitch-chat"
import { cn } from "@/lib/utils"

type UserCardState = ReturnType<typeof useUserCard>

const userCardDateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
})

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return userCardDateFormatter.format(date)
}

function formatUserType(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")
}

async function copyText(label: string, value: string | undefined) {
  const text = value?.trim()
  if (!text) {
    toast.error(`${label} is not available.`)
    return
  }

  try {
    await navigator.clipboard.writeText(text)
    toast.success(`Copied ${label.toLowerCase()}.`)
  } catch {
    toast.error(`Could not copy ${label.toLowerCase()}.`)
  }
}

function UserAvatar({
  profileImageUrl,
  displayName,
}: {
  profileImageUrl?: string
  displayName: string
}) {
  if (profileImageUrl) {
    return (
      <img
        src={profileImageUrl}
        alt=""
        className="size-16 shrink-0 rounded-full border-2 border-popover/90 object-cover shadow-md"
        loading="lazy"
        decoding="async"
      />
    )
  }

  return (
    <span className="flex size-16 shrink-0 items-center justify-center rounded-full border-2 border-popover/90 bg-primary/20 text-lg font-semibold text-primary uppercase shadow-md">
      {displayName.slice(0, 2)}
    </span>
  )
}

function StatusPills({
  isBroadcaster,
  isModerator,
  isVip,
}: {
  isBroadcaster: boolean
  isModerator: boolean
  isVip: boolean
}) {
  const hasStatus = isBroadcaster || isModerator || isVip

  if (!hasStatus) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {isBroadcaster ? (
        <Badge
          variant="outline"
          className="gap-1 border-red-500/30 text-red-500"
        >
          <VideoIcon className="size-3" />
          Broadcaster
        </Badge>
      ) : null}
      {isModerator ? (
        <Badge
          variant="outline"
          className="gap-1 border-emerald-500/30 text-emerald-500"
        >
          <ShieldIcon className="size-3" />
          Moderator
        </Badge>
      ) : null}
      {isVip ? (
        <Badge
          variant="outline"
          className="gap-1 border-fuchsia-500/30 text-fuchsia-500"
        >
          <GemIcon className="size-3" />
          VIP
        </Badge>
      ) : null}
    </div>
  )
}

function InfoTile({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg bg-muted/60 p-2">
      <div className="mb-1 flex items-center gap-1 text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="font-medium">{value}</div>
    </div>
  )
}

function InfoTileSkeleton() {
  return <Skeleton className="h-14 rounded-lg" />
}

type ModerationToolbarItem = {
  key: string
  label: string
  icon?: React.ReactNode
  tone?: "neutral" | "danger"
  pending: boolean
  disabled: boolean
  onClick: () => void
}

function ModerationToolbar({
  items,
  columns,
  tabular = false,
}: {
  items: ModerationToolbarItem[]
  columns?: number
  tabular?: boolean
}) {
  if (items.length === 0) {
    return null
  }

  const columnCount = columns ?? items.length

  return (
    <div
      className="grid overflow-hidden rounded-md border border-border/60 bg-background/40"
      style={{
        gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
      }}
    >
      {items.map((item, index) => (
        <button
          key={item.key}
          type="button"
          disabled={item.disabled || item.pending}
          onClick={item.onClick}
          className={cn(
            "inline-flex h-6 min-w-0 cursor-pointer items-center justify-center gap-0.5 px-1 text-[10px] leading-none font-medium transition-colors",
            tabular && "tabular-nums",
            index % columnCount !== 0 && "border-l border-border/60",
            "hover:bg-muted/70 disabled:pointer-events-none disabled:opacity-50",
            item.tone === "danger" && "text-destructive",
            (!item.tone || item.tone === "neutral") &&
              "text-muted-foreground hover:text-foreground"
          )}
        >
          {item.pending ? (
            "…"
          ) : (
            <>
              {item.icon}
              {item.label}
            </>
          )}
        </button>
      ))}
    </div>
  )
}

type UserCardPanelProps = {
  target: UserCardTarget
  card: UserCardState
  account: TwitchAccount | null
  channelLogin: string
  channelRoomId: string | null
  selfChatState: TwitchSelfChatState | null
  recentMessages: TwitchChatMessage[]
  timestampFormat: MessageTimestampFormat
  loginWithTwitch: () => void
  isUserBlocked: (userId?: string | null, login?: string | null) => boolean
  blockUser: (userId: string, login: string) => Promise<void>
  unblockUser: (userId: string, login?: string) => Promise<void>
  anchorPosition: { left: number; top: number }
  dragOffset: { x: number; y: number }
  panelRef: React.RefObject<HTMLDivElement | null>
  actionsMenuOpenRef: React.MutableRefObject<boolean>
  onClose: () => void
  onDragStart: (event: React.PointerEvent<HTMLDivElement>) => void
}

export function UserCardPanel({
  target,
  card,
  account,
  channelLogin,
  channelRoomId,
  selfChatState,
  recentMessages,
  timestampFormat,
  loginWithTwitch,
  isUserBlocked,
  blockUser,
  unblockUser,
  anchorPosition,
  dragOffset,
  panelRef,
  actionsMenuOpenRef,
  onClose,
  onDragStart,
}: UserCardPanelProps) {
  const profile = card.profile
  const channelStatus = card.channelStatus
  const isProfileLoading = card.status === "loading" && !profile
  const isChannelStatusLoading =
    card.status !== "error" && card.status !== "idle" && !channelStatus
  const status = card.status === "ready" && channelStatus ? channelStatus : null
  const moderatorStatus =
    status?.moderator.state === "available" ? status.moderator.value : null
  const vipStatus = status?.vip.state === "available" ? status.vip.value : null
  const vipStatusAvailable = status?.vip.state === "available"
  const subage =
    status?.subage.state === "available" ? status.subage.value : null
  const ivrProfile =
    status?.ivrProfile.state === "available" ? status.ivrProfile.value : null
  const channelRoles =
    status?.channelRoles.state === "available"
      ? status.channelRoles.value
      : null
  const subageUnavailable = status?.subage.state === "unavailable"
  const displayName = profile?.displayName ?? target.displayName
  const login = profile?.login ?? target.userName
  const isBroadcaster = Boolean(
    target.flags.isBroadcaster ||
    (profile &&
      (profile.id === channelRoomId ||
        profile.login.toLowerCase() === channelLogin.toLowerCase()))
  )
  const isModerator = Boolean(
    moderatorStatus || channelRoles?.isModerator || target.flags.isModerator
  )
  const isVip = vipStatusAvailable
    ? Boolean(vipStatus)
    : Boolean(channelRoles?.isVip || target.flags.isVip)
  const isSelf =
    Boolean(account && profile && account.id === profile.id) ||
    account?.login.toLowerCase() === target.userName.toLowerCase()
  const canManageBlockedUsers = hasBlockedUsersManageScope(account)
  const targetUserId = profile?.id ?? target.userId
  const targetLogin = profile?.login ?? target.userName
  const targetIsBlocked = Boolean(
    targetUserId || targetLogin
      ? isUserBlocked(targetUserId, targetLogin)
      : false
  )
  const [blockActionPending, setBlockActionPending] = React.useState(false)
  const actorIsBroadcasterInChannel = actorIsBroadcaster(account, channelRoomId)
  const canBanOrTimeout = canModerateTarget({
    account,
    broadcasterId: channelRoomId,
    channelLogin,
    selfState: selfChatState,
    target: {
      userId: profile?.id ?? target.userId,
      userName: profile?.login ?? target.userName,
      isBroadcaster,
      isModerator,
    },
  })
  const canUseModeratorApi =
    actorIsBroadcasterInChannel &&
    !isSelf &&
    !isBroadcaster &&
    canManageModerators(account)
  const canUseVipApi =
    actorIsBroadcasterInChannel &&
    !isSelf &&
    !isBroadcaster &&
    canManageVips(account)
  const createdAt = profile ? formatDate(profile.createdAt) : null
  const bannerImageUrl =
    ivrProfile?.bannerImageUrl ?? profile?.bannerImageUrl ?? ""
  const profileImageUrl = profile?.profileImageUrl ?? ""
  const userType = profile
    ? formatUserType(profile.type || profile.broadcasterType)
    : ""
  const followedAt = subage?.followedAt ? formatDate(subage.followedAt) : null
  const subscriptionLabel = isChannelStatusLoading
    ? ""
    : subageUnavailable
      ? "Unavailable"
      : subage?.statusHidden
        ? "Hidden"
        : subage?.cumulative
          ? `${subage.cumulative.months} month${subage.cumulative.months === 1 ? "" : "s"}`
          : "Not subscribed"
  const showCardContent = card.status === "loading" || card.status === "ready"
  const isActionPending = card.pendingAction !== null
  const showTimeoutGrid = canBanOrTimeout
  const showModerationActions =
    canBanOrTimeout || canUseModeratorApi || canUseVipApi

  const handleAction = React.useCallback(
    (
      action: UserCardAction,
      label: string,
      options?: { durationSeconds?: number }
    ) => {
      void card
        .runAction(action, options)
        .then(() =>
          toast.success(`${label} succeeded for ${target.displayName}.`)
        )
        .catch((error) => {
          toast.error(
            error instanceof Error ? error.message : `${label} failed.`
          )
        })
    },
    [card, target.displayName]
  )

  const handleBlockToggle = React.useCallback(() => {
    if (
      !targetUserId ||
      !targetLogin ||
      !canManageBlockedUsers ||
      isSelf ||
      blockActionPending
    ) {
      return
    }

    setBlockActionPending(true)
    const action = targetIsBlocked ? unblockUser : blockUser
    const label = targetIsBlocked ? "Unblock" : "Block"

    void action(targetUserId, targetLogin)
      .then(() => {
        toast.success(`${label} succeeded for ${target.displayName}.`)
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : `${label} failed.`)
      })
      .finally(() => {
        setBlockActionPending(false)
      })
  }, [
    blockActionPending,
    blockUser,
    canManageBlockedUsers,
    isSelf,
    target.displayName,
    targetIsBlocked,
    targetLogin,
    targetUserId,
    unblockUser,
  ])

  const timeoutToolbarItems = React.useMemo<ModerationToolbarItem[]>(() => {
    if (!showTimeoutGrid) {
      return []
    }

    return MODERATION_TIMEOUT_PRESETS.map((preset) => ({
      key: preset.label,
      label: preset.label,
      pending: card.pendingAction === "timeout",
      disabled: isActionPending,
      onClick: () =>
        handleAction("timeout", `Timeout ${preset.label}`, {
          durationSeconds: preset.seconds,
        }),
    }))
  }, [card.pendingAction, handleAction, isActionPending, showTimeoutGrid])

  const roleToolbarItems = React.useMemo<ModerationToolbarItem[]>(() => {
    const items: ModerationToolbarItem[] = []

    if (canBanOrTimeout) {
      items.push({
        key: "ban",
        label: "Ban",
        icon: <BanIcon className="size-2.5 shrink-0" />,
        tone: "danger",
        pending: card.pendingAction === "ban",
        disabled: isActionPending,
        onClick: () => handleAction("ban", "Ban"),
      })
    }
    if (canUseModeratorApi && isModerator) {
      items.push({
        key: "unmod",
        label: "Unmod",
        icon: <ShieldOffIcon className="size-2.5 shrink-0" />,
        pending: card.pendingAction === "unmod",
        disabled: isActionPending,
        onClick: () => handleAction("unmod", "Unmod"),
      })
    }
    if (canUseModeratorApi && !isModerator) {
      items.push({
        key: "mod",
        label: "Mod",
        icon: <ShieldIcon className="size-2.5 shrink-0" />,
        pending: card.pendingAction === "mod",
        disabled: isActionPending,
        onClick: () => handleAction("mod", "Mod"),
      })
    }
    if (canUseVipApi && isVip) {
      items.push({
        key: "unvip",
        label: "Unvip",
        icon: <GemIcon className="size-2.5 shrink-0" />,
        pending: card.pendingAction === "unvip",
        disabled: isActionPending,
        onClick: () => handleAction("unvip", "Unvip"),
      })
    }
    if (canUseVipApi && !isVip) {
      items.push({
        key: "vip",
        label: "VIP",
        icon: <GemIcon className="size-2.5 shrink-0" />,
        pending: card.pendingAction === "vip",
        disabled: isActionPending,
        onClick: () => handleAction("vip", "VIP"),
      })
    }
    if (canBanOrTimeout) {
      items.push({
        key: "pardon",
        label: "Pardon",
        icon: <ShieldCheckIcon className="size-2.5 shrink-0" />,
        pending: card.pendingAction === "pardon",
        disabled: isActionPending,
        onClick: () => handleAction("pardon", "Pardon"),
      })
    }

    return items
  }, [
    canBanOrTimeout,
    canUseModeratorApi,
    canUseVipApi,
    card.pendingAction,
    handleAction,
    isActionPending,
    isModerator,
    isVip,
  ])

  const openChannel = React.useCallback(() => {
    if (!login) {
      return
    }
    window.open(twitchChannelUrl(login), "_blank", "noopener,noreferrer")
  }, [login])

  return (
    <div
      ref={panelRef}
      role="dialog"
      data-slot="user-card-panel"
      aria-label={`${target.displayName} user card`}
      className="pointer-events-auto fixed z-80 w-88 overflow-hidden rounded-lg border bg-popover p-0 text-popover-foreground shadow-md outline-hidden"
      style={{
        left: anchorPosition.left,
        top: anchorPosition.top,
        transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
      }}
    >
      <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
        {showCardContent ? (
          <DropdownMenu
            modal={false}
            onOpenChange={(open) => {
              actionsMenuOpenRef.current = open
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                className="bg-popover/85 shadow-sm backdrop-blur-sm"
                aria-label="User card actions"
              >
                <EllipsisIcon className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-80 w-56">
              <DropdownMenuLabel>Tools</DropdownMenuLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onSelect={() =>
                    openExternalTool(twitchViewerCardUrl(channelLogin, login))
                  }
                >
                  Open viewer card
                  <UserSquare2Icon className="ml-auto size-3.5 text-muted-foreground" />
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    openExternalTool(chatlogsUserUrl(channelLogin, login))
                  }
                >
                  View user&apos;s chatlogs
                  <ScrollTextIcon className="ml-auto size-3.5 text-muted-foreground" />
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Metadata</DropdownMenuLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onSelect={() => void copyText("Username", login)}
                >
                  Copy username
                  <CopyIcon className="ml-auto size-3.5 text-muted-foreground" />
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!targetUserId}
                  onSelect={() =>
                    void copyText("User ID", targetUserId ?? undefined)
                  }
                >
                  Copy user&apos;s ID
                  <CopyIcon className="ml-auto size-3.5 text-muted-foreground" />
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!profileImageUrl}
                  onSelect={() =>
                    void copyText("Profile picture URL", profileImageUrl)
                  }
                >
                  Copy profile picture URL
                  <CopyIcon className="ml-auto size-3.5 text-muted-foreground" />
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!bannerImageUrl}
                  onSelect={() => void copyText("Banner URL", bannerImageUrl)}
                >
                  Copy banner URL
                  <CopyIcon className="ml-auto size-3.5 text-muted-foreground" />
                </DropdownMenuItem>
              </DropdownMenuGroup>
              {canManageBlockedUsers && !isSelf && targetUserId ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      disabled={blockActionPending}
                      onSelect={handleBlockToggle}
                    >
                      {targetIsBlocked ? "Unblock user" : "Block user"}
                      <UserXIcon className="ml-auto size-3.5 text-muted-foreground" />
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          className="bg-popover/85 shadow-sm backdrop-blur-sm"
          aria-label="Close user card"
          onClick={onClose}
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>

      {card.status === "error" ? (
        <div className="space-y-3 p-4">
          <div className="text-sm font-medium">Could not load user card</div>
          <p className="text-xs text-muted-foreground">{card.error}</p>
          {!account ? (
            <Button size="sm" className="w-full" onClick={loginWithTwitch}>
              Sign in with Twitch
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={card.reload}
            >
              Try again
            </Button>
          )}
        </div>
      ) : null}

      {showCardContent ? (
        <div className="flex max-h-[min(34rem,calc(100vh-2rem))] flex-col">
          <div
            className="relative h-32 shrink-0 cursor-grab touch-none overflow-hidden bg-muted active:cursor-grabbing"
            onPointerDown={onDragStart}
          >
            {bannerImageUrl ? (
              <img
                src={bannerImageUrl}
                alt=""
                className="size-full object-cover brightness-[0.55] saturate-95"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="size-full bg-linear-to-br from-primary/40 via-primary/15 to-background" />
            )}
            <div className="absolute inset-0 bg-linear-to-b from-transparent via-black/20 to-popover" />
            <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 px-4 pb-3">
              <UserAvatar
                profileImageUrl={profileImageUrl || undefined}
                displayName={displayName}
              />
              <div className="min-w-0 flex-1 pb-1">
                <button
                  type="button"
                  className="block max-w-full cursor-pointer truncate text-left text-lg leading-tight font-semibold hover:underline"
                  onClick={openChannel}
                >
                  {displayName}
                </button>
                {targetUserId ? (
                  <div className="truncate font-mono text-[11px] text-muted-foreground">
                    ID {targetUserId}
                  </div>
                ) : isProfileLoading ? (
                  <Skeleton className="mt-1 h-3 w-24" />
                ) : null}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div
              className={cn("space-y-4 p-4", !profile?.description && "pt-3")}
            >
              <StatusPills
                isBroadcaster={isBroadcaster}
                isModerator={isModerator}
                isVip={isVip}
              />

              {profile?.description ? (
                <p className="text-sm leading-snug text-popover-foreground">
                  {profile.description}
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-2 text-xs">
                {isProfileLoading ? (
                  <InfoTileSkeleton />
                ) : createdAt ? (
                  <InfoTile
                    icon={<CalendarDaysIcon className="size-3" />}
                    label="Created"
                    value={createdAt}
                  />
                ) : null}
                {isChannelStatusLoading ? (
                  <InfoTileSkeleton />
                ) : (
                  <InfoTile
                    icon={<SparklesIcon className="size-3" />}
                    label="Subscription"
                    value={subscriptionLabel}
                  />
                )}
                {isChannelStatusLoading ? (
                  <InfoTileSkeleton />
                ) : (
                  <InfoTile
                    icon={<ClockIcon className="size-3" />}
                    label="Followage"
                    value={
                      subageUnavailable
                        ? "Unavailable"
                        : followedAt
                          ? `Since ${followedAt}`
                          : "Not following"
                    }
                  />
                )}
                {isProfileLoading ? (
                  <InfoTileSkeleton />
                ) : userType ? (
                  <InfoTile
                    icon={<UsersIcon className="size-3" />}
                    label="User Type"
                    value={userType}
                  />
                ) : null}
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Recent messages
                </h3>
                {recentMessages.length > 0 ? (
                  <div className="space-y-1.5">
                    {recentMessages.map((message) => {
                      const timestamp = formatMessageTimestamp(
                        message.receivedAt,
                        timestampFormat
                      )

                      return (
                        <div
                          key={message.id}
                          className="rounded-lg bg-muted/50 px-2.5 py-2 text-xs leading-snug"
                        >
                          {timestamp ? (
                            <time className="mr-1.5 text-[11px] text-muted-foreground">
                              {timestamp}
                            </time>
                          ) : null}
                          <ChatMessageBody
                            text={message.text}
                            emotes={message.emotes}
                          />
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No recent messages from this user are available in the
                    loaded chat history.
                  </p>
                )}
              </div>
            </div>
          </div>

          {showModerationActions ? (
            <div className="shrink-0 space-y-1 border-t bg-muted/35 px-3 py-2">
              <ModerationToolbar
                items={timeoutToolbarItems}
                columns={7}
                tabular
              />
              <ModerationToolbar items={roleToolbarItems} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
