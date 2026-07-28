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
      className="pointer-events-none absolute -bottom-1 left-1/2 z-20 -translate-x-1/2 rounded-sm bg-red-600 px-1 py-px text-[8px] leading-none font-bold tracking-wide text-white ring-2 ring-sidebar"
      aria-hidden
    >
      LIVE
    </span>
  )
}

const indicatorShadow = "shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"

const indicatorTransition =
  "transition-[height,width,border-radius,transform,opacity,margin] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]"

const tileRadiusTransition =
  "transition-[border-radius,background-color] duration-200 ease-[cubic-bezier(0.3,0.7,0.4,1)]"

export function SidebarIconTile({
  children,
  isActive,
  showPing,
  showLive,
  variant = "channel",
}: {
  children: React.ReactNode
  isActive: boolean
  showPing: boolean
  showLive: boolean
  variant?: "channel" | "split"
}) {
  const radiusClass = cn(
    "rounded-[1.375rem]",
    isActive ? "rounded-[0.95rem]" : "group-hover/icon:rounded-[1.15rem]"
  )

  return (
    <span
      className={cn(
        "relative size-11 shrink-0 overflow-visible bg-secondary",
        tileRadiusTransition,
        radiusClass,
        variant === "split" && isActive && "bg-sidebar-foreground/15"
      )}
    >
      <span
        className={cn(
          "absolute inset-0 overflow-hidden",
          tileRadiusTransition,
          radiusClass
        )}
      >
        {children}
      </span>
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
    <div className="group/row relative flex h-11 w-full min-w-0 items-center justify-center overflow-visible">
      <span
        className="pointer-events-none absolute top-1/2 left-0 z-10 flex -translate-y-1/2 items-center"
        aria-hidden
      >
        <span
          className={cn(
            "bg-sidebar-foreground",
            indicatorShadow,
            indicatorTransition,
            isActive && "h-8 w-[3px] rounded-r-full",
            showUnreadIndicator &&
              "size-2 -translate-x-1/2 rounded-full group-hover/row:h-5 group-hover/row:w-[3px] group-hover/row:translate-x-0 group-hover/row:rounded-r-full",
            !isActive &&
              !showUnreadIndicator &&
              "h-0 w-[3px] rounded-r-full opacity-0 group-hover/row:h-5 group-hover/row:opacity-100"
          )}
        />
      </span>
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
          "pointer-events-none size-full rounded-[inherit] object-cover",
          className
        )}
      />
    )
  }

  return (
    <span
      className={cn(
        "pointer-events-none flex size-full items-center justify-center bg-primary/15 text-xs font-semibold text-primary uppercase",
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
      index === 0 && "top-1/2 left-0.5 z-[2] -translate-y-1/2",
      index === 1 && "top-1/2 left-[1.15rem] z-[1] -translate-y-1/2"
    )
  }

  if (count === 3) {
    return cn(
      index === 0 && "top-0.5 left-1/2 z-[4] -translate-x-1/2",
      index === 1 && "bottom-0.5 left-0.5 z-[3]",
      index === 2 && "right-0.5 bottom-0.5 z-[2]"
    )
  }

  return cn(
    index === 0 && "top-0.5 left-0.5 z-[4]",
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
            "absolute overflow-hidden rounded-full bg-secondary ring-2 ring-sidebar",
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
