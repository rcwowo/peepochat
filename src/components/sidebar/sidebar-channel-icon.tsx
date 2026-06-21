import * as React from "react"

import { cn } from "@/lib/utils"

/** Discord-style red mention / ping badge (top-right). */
export function SidebarPingBadge({
  ringClassName = "ring-sidebar",
}: {
  ringClassName?: string
}) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute top-0 right-0 z-20 size-2.5 translate-x-1/4 -translate-y-1/4 rounded-full bg-[#f23f43] ring-2",
        ringClassName
      )}
      aria-hidden
    />
  )
}

/** Stream live label overlaid on the bottom of the icon. */
function SidebarLiveBadge() {
  return (
    <span
      className="pointer-events-none absolute -bottom-1 left-1/2 z-20 -translate-x-1/2 rounded-sm bg-red-600 px-1 py-px text-[8px] font-bold leading-none tracking-wide text-white ring-2 ring-sidebar"
      aria-hidden
    >
      LIVE
    </span>
  )
}

const indicatorShadow = "shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"

/** Active channel: vertical pill on the screen edge. */
function SidebarActiveIndicator() {
  return (
    <span
      className={cn(
        "h-6 w-[3px] rounded-r-full bg-sidebar-foreground",
        indicatorShadow
      )}
      aria-hidden
    />
  )
}

/**
 * Unread: circle centered on the left edge so only the right half shows (semicircle).
 */
function SidebarUnreadIndicator() {
  return (
    <span
      className={cn(
        "size-2 -translate-x-1/2 rounded-full bg-sidebar-foreground",
        indicatorShadow
      )}
      aria-hidden
    />
  )
}

export function SidebarIconTile({
  children,
  isActive,
  showPing,
  showLive,
}: {
  children: React.ReactNode
  isActive: boolean
  showPing: boolean
  showLive: boolean
}) {
  return (
    <span
      className={cn(
        "relative size-10 shrink-0 overflow-visible rounded-full bg-secondary ring-[2.5px] ring-transparent transition-shadow",
        isActive && "bg-sidebar-accent ring-sidebar-foreground",
        !isActive && "group-hover/icon:ring-sidebar-foreground/55"
      )}
    >
      <span className="absolute inset-0 overflow-hidden rounded-full">{children}</span>
      {showPing ? <SidebarPingBadge /> : null}
      {showLive ? <SidebarLiveBadge /> : null}
    </span>
  )
}

/** Full-width row with icons centered; indicators pinned to the left screen edge. */
export function SidebarChannelRow({
  isActive,
  showUnread,
  children,
}: {
  isActive: boolean
  showUnread: boolean
  children: React.ReactNode
}) {
  const showUnreadIndicator = showUnread && !isActive

  return (
    <div className="relative flex h-11 w-full min-w-0 items-center justify-center overflow-visible">
      {isActive || showUnreadIndicator ? (
        <span
          className="pointer-events-none absolute top-1/2 left-0 z-10 flex -translate-y-1/2 items-center"
          aria-hidden
        >
          {isActive ? <SidebarActiveIndicator /> : <SidebarUnreadIndicator />}
        </span>
      ) : null}
      {children}
    </div>
  )
}

export function SidebarChannelAvatar({
  login,
  profileImageUrl,
  className,
}: {
  login: string
  profileImageUrl?: string
  className?: string
}) {
  if (profileImageUrl) {
    return (
      <img
        src={profileImageUrl}
        alt=""
        draggable={false}
        className={cn(
          "pointer-events-none size-full rounded-full object-cover",
          className
        )}
      />
    )
  }

  return (
    <span
      className={cn(
        "pointer-events-none flex size-full items-center justify-center bg-primary/15 text-xs font-semibold uppercase text-primary",
        className
      )}
    >
      {login.slice(0, 2)}
    </span>
  )
}

function splitClusterAvatarSize(count: number) {
  if (count <= 2) return "size-[1.35rem]"
  if (count === 3) return "size-[1.2rem]"
  return "size-[1.1rem]"
}

function splitClusterAvatarPosition(index: number, count: number) {
  if (count === 2) {
    return cn(
      index === 0 && "left-0.5 top-1/2 z-[2] -translate-y-1/2",
      index === 1 && "left-[1.15rem] top-1/2 z-[1] -translate-y-1/2"
    )
  }

  if (count === 3) {
    return cn(
      index === 0 && "left-1/2 top-0.5 -translate-x-1/2 z-[4]",
      index === 1 && "bottom-0.5 left-0.5 z-[3]",
      index === 2 && "right-0.5 bottom-0.5 z-[2]"
    )
  }

  return cn(
    index === 0 && "left-0.5 top-0.5 z-[4]",
    index === 1 && "top-0.5 right-0.5 z-[3]",
    index === 2 && "bottom-0.5 left-0.5 z-[2]",
    index === 3 && "right-0.5 bottom-0.5 z-[1]"
  )
}

export function SidebarSplitAvatarCluster({
  channels,
}: {
  channels: Array<{
    login: string
    profileImageUrl?: string
  }>
}) {
  const visible = channels.slice(0, 4)
  const count = visible.length
  const avatarSize = splitClusterAvatarSize(count)

  return (
    <span className="relative block size-full">
      {visible.map((channel, index) => (
        <span
          key={channel.login}
          className={cn(
            "absolute overflow-hidden rounded-full ring-2 ring-sidebar bg-secondary",
            avatarSize,
            splitClusterAvatarPosition(index, count)
          )}
        >
          <SidebarChannelAvatar
            login={channel.login}
            profileImageUrl={channel.profileImageUrl}
          />
        </span>
      ))}
    </span>
  )
}
