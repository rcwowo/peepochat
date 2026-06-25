import * as React from "react"
import {
  BanIcon,
  CalendarDaysIcon,
  ClockIcon,
  CopyIcon,
  EllipsisIcon,
  GemIcon,
  ShieldIcon,
  ShieldOffIcon,
  SparklesIcon,
  UserMinusIcon,
  UserPlusIcon,
  UsersIcon,
  VideoIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { ChatMessageBody } from "@/components/chat/chat-message-body"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import {
  USER_CARD_MODERATION_SCOPES,
  hasUserCardScope,
  type UserCardAction,
  type UserCardTarget,
} from "@/hooks/twitch/use-user-card"
import type { useUserCard } from "@/hooks/twitch/use-user-card"
import type { TwitchSelfChatState } from "@/hooks/twitch/use-twitch-chat"
import { twitchChannelUrl } from "@/lib/chat/user-card"
import type { TwitchAccount } from "@/lib/peepochat/peepochat-config"
import type { TwitchChatMessage } from "@/lib/twitch/twitch-chat"
import { cn } from "@/lib/utils"

type UserCardState = ReturnType<typeof useUserCard>

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date)
}

function formatUserType(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")
}

function formatMessageTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ""
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function isActiveTimeout(expiresAt: string | null) {
  if (!expiresAt) {
    return false
  }
  const expires = Date.parse(expiresAt)
  return Number.isFinite(expires) && expires > Date.now()
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
  isBanned,
  isTimedOut,
}: {
  isBroadcaster: boolean
  isModerator: boolean
  isVip: boolean
  isBanned: boolean
  isTimedOut: boolean
}) {
  const hasStatus =
    isBroadcaster || isModerator || isVip || isTimedOut || isBanned

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
      {isTimedOut ? (
        <Badge variant="destructive" className="gap-1">
          <ClockIcon className="size-3" />
          Timed out
        </Badge>
      ) : null}
      {isBanned ? (
        <Badge variant="destructive" className="gap-1">
          <BanIcon className="size-3" />
          Banned
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

function UserCardLoading() {
  return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="flex gap-3">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="h-14 w-full" />
    </div>
  )
}

function QuickActionButton({
  action,
  label,
  icon,
  disabled,
  pending,
  variant = "outline",
  onAction,
}: {
  action: UserCardAction
  label: string
  icon: React.ReactNode
  disabled: boolean
  pending: boolean
  variant?: React.ComponentProps<typeof Button>["variant"]
  onAction: (action: UserCardAction, label: string) => void
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant={variant}
      className="justify-start"
      disabled={disabled || pending}
      onClick={() => onAction(action, label)}
    >
      {icon}
      {pending ? "Working..." : label}
    </Button>
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
  loginWithTwitch: () => void
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
  loginWithTwitch,
  anchorPosition,
  dragOffset,
  panelRef,
  actionsMenuOpenRef,
  onClose,
  onDragStart,
}: UserCardPanelProps) {
  const profile = card.status === "ready" ? card.profile : null
  const status = card.status === "ready" ? card.channelStatus : null
  const banStatus = status?.ban.state === "available" ? status.ban.value : null
  const moderatorStatus =
    status?.moderator.state === "available" ? status.moderator.value : null
  const subage =
    status?.subage.state === "available" ? status.subage.value : null
  const ivrProfile =
    status?.ivrProfile.state === "available" ? status.ivrProfile.value : null
  const channelRoles =
    status?.channelRoles.state === "available"
      ? status.channelRoles.value
      : null
  const subageUnavailable = status?.subage.state === "unavailable"
  const isTimedOut = Boolean(banStatus && isActiveTimeout(banStatus.expiresAt))
  const isBanned = Boolean(banStatus && !isTimedOut)
  const isBroadcaster = Boolean(
    target.flags.isBroadcaster ||
    (profile &&
      (profile.id === channelRoomId ||
        profile.login.toLowerCase() === channelLogin.toLowerCase()))
  )
  const isModerator = Boolean(
    moderatorStatus || channelRoles?.isModerator || target.flags.isModerator
  )
  const isVip = Boolean(channelRoles?.isVip || target.flags.isVip)
  const isSelf =
    Boolean(account && profile && account.id === profile.id) ||
    account?.login.toLowerCase() === target.userName.toLowerCase()
  const actorIsBroadcaster = Boolean(
    account && channelRoomId && account.id === channelRoomId
  )
  const canUseBanApi = hasUserCardScope(
    account,
    USER_CARD_MODERATION_SCOPES.ban
  )
  const canBanOrTimeout =
    canUseBanApi &&
    Boolean(account && channelRoomId && !isSelf && !isBroadcaster) &&
    (actorIsBroadcaster ||
      (Boolean(selfChatState?.isModerator) && !isModerator))
  const canUseModeratorApi =
    actorIsBroadcaster &&
    !isSelf &&
    !isBroadcaster &&
    hasUserCardScope(account, USER_CARD_MODERATION_SCOPES.manageModerators)
  const createdAt = profile ? formatDate(profile.createdAt) : null
  const bannerImageUrl =
    ivrProfile?.bannerImageUrl ?? profile?.bannerImageUrl ?? ""
  const profileImageUrl = profile?.profileImageUrl ?? ""
  const userType = profile
    ? formatUserType(profile.type || profile.broadcasterType)
    : ""
  const followedAt = subage?.followedAt ? formatDate(subage.followedAt) : null
  const subscriptionLabel = subageUnavailable
    ? "Unavailable"
    : subage?.statusHidden
      ? "Hidden"
      : subage?.cumulative
        ? `${subage.cumulative.months} month${subage.cumulative.months === 1 ? "" : "s"}`
        : "Not subscribed"
  const isActionPending = card.pendingAction !== null

  const handleAction = React.useCallback(
    (action: UserCardAction, label: string) => {
      void card
        .runAction(action)
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

  const openChannel = React.useCallback(() => {
    if (!profile?.login) {
      return
    }
    window.open(
      twitchChannelUrl(profile.login),
      "_blank",
      "noopener,noreferrer"
    )
  }, [profile])

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`${target.displayName} user card`}
      className="fixed z-50 w-88 overflow-hidden rounded-lg border bg-popover p-0 text-popover-foreground shadow-md outline-hidden"
      style={{
        left: anchorPosition.left,
        top: anchorPosition.top,
        transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
      }}
    >
      <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
        {card.status === "ready" && profile ? (
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
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onSelect={() => void copyText("Username", profile.login)}
              >
                Copy username
                <CopyIcon className="ml-auto size-3.5 text-muted-foreground" />
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => void copyText("User ID", profile.id)}
              >
                Copy user&apos;s ID
                <CopyIcon className="ml-auto size-3.5 text-muted-foreground" />
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  void copyText("Profile picture URL", profileImageUrl)
                }
              >
                Copy profile picture URL
                <CopyIcon className="ml-auto size-3.5 text-muted-foreground" />
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => void copyText("Banner URL", bannerImageUrl)}
              >
                Copy banner URL
                <CopyIcon className="ml-auto size-3.5 text-muted-foreground" />
              </DropdownMenuItem>
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

      {card.status === "loading" ? <UserCardLoading /> : null}

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

      {card.status === "ready" && profile ? (
        <div className="max-h-[min(34rem,calc(100vh-2rem))] overflow-y-auto">
          <div
            className="relative h-32 cursor-grab touch-none overflow-hidden bg-muted active:cursor-grabbing"
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
                profileImageUrl={profile.profileImageUrl}
                displayName={profile.displayName}
              />
              <div className="min-w-0 flex-1 pb-1">
                <button
                  type="button"
                  className="block max-w-full cursor-pointer truncate text-left text-lg leading-tight font-semibold hover:underline"
                  onClick={openChannel}
                >
                  {profile.displayName}
                </button>
                <div className="truncate font-mono text-[11px] text-muted-foreground">
                  ID {profile.id}
                </div>
              </div>
            </div>
          </div>

          <div className={cn("space-y-4 p-4", !profile.description && "pt-3")}>
            <StatusPills
              isBroadcaster={isBroadcaster}
              isModerator={isModerator}
              isVip={isVip}
              isBanned={isBanned}
              isTimedOut={isTimedOut}
            />

            {profile.description ? (
              <p className="text-sm leading-snug text-popover-foreground">
                {profile.description}
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-2 text-xs">
              {createdAt ? (
                <InfoTile
                  icon={<CalendarDaysIcon className="size-3" />}
                  label="Created"
                  value={createdAt}
                />
              ) : null}
              <InfoTile
                icon={<SparklesIcon className="size-3" />}
                label="Subscription"
                value={subscriptionLabel}
              />
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
              {userType ? (
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
                  {recentMessages.map((message) => (
                    <div
                      key={message.id}
                      className="rounded-lg bg-muted/50 px-2.5 py-2 text-xs leading-snug"
                    >
                      <time className="mr-1.5 text-[11px] text-muted-foreground">
                        {formatMessageTime(message.receivedAt)}
                      </time>
                      <ChatMessageBody
                        text={message.text}
                        emotes={message.emotes}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No recent messages from this user are available in the loaded
                  chat history.
                </p>
              )}
            </div>

            {canBanOrTimeout || canUseModeratorApi ? (
              <div className="-mx-4 -mb-4 border-t bg-muted/35 p-4">
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Quick actions
                </h3>
                <div className="grid grid-cols-2 gap-1.5">
                  {canBanOrTimeout && isTimedOut ? (
                    <QuickActionButton
                      action="untimeout"
                      label="Untimeout"
                      icon={<ClockIcon className="size-3" />}
                      disabled={isActionPending}
                      pending={card.pendingAction === "untimeout"}
                      onAction={handleAction}
                    />
                  ) : null}
                  {canBanOrTimeout && !isBanned ? (
                    <QuickActionButton
                      action="timeout"
                      label="Timeout 10m"
                      icon={<ClockIcon className="size-3" />}
                      disabled={isActionPending}
                      pending={card.pendingAction === "timeout"}
                      onAction={handleAction}
                    />
                  ) : null}
                  {canBanOrTimeout && isBanned ? (
                    <QuickActionButton
                      action="unban"
                      label="Unban"
                      icon={<ShieldOffIcon className="size-3" />}
                      disabled={isActionPending}
                      pending={card.pendingAction === "unban"}
                      onAction={handleAction}
                    />
                  ) : null}
                  {canBanOrTimeout && !isBanned ? (
                    <QuickActionButton
                      action="ban"
                      label="Ban"
                      icon={<BanIcon className="size-3" />}
                      variant="destructive"
                      disabled={isActionPending}
                      pending={card.pendingAction === "ban"}
                      onAction={handleAction}
                    />
                  ) : null}
                  {canUseModeratorApi && isModerator ? (
                    <QuickActionButton
                      action="unmod"
                      label="Unmod"
                      icon={<UserMinusIcon className="size-3" />}
                      disabled={isActionPending}
                      pending={card.pendingAction === "unmod"}
                      onAction={handleAction}
                    />
                  ) : null}
                  {canUseModeratorApi && !isModerator ? (
                    <QuickActionButton
                      action="mod"
                      label="Mod"
                      icon={<UserPlusIcon className="size-3" />}
                      disabled={isActionPending}
                      pending={card.pendingAction === "mod"}
                      onAction={handleAction}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
