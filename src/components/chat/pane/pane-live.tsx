import * as React from "react"
import { ChevronDownIcon, ClockIcon, EyeIcon } from "lucide-react"

import type { TwitchLiveStream } from "@/lib/twitch/auth/api"
import type { ChatStreamInfoConfig } from "@/lib/peepochat/peepochat-config"
import { useChannelInformation } from "@/hooks/twitch/player/use-channel-information"
import { useStreamUptime } from "@/hooks/twitch/player/use-stream-uptime"
import { usePeepochatSettings } from "@/lib/peepochat/peepochat-context"
import {
  formatStreamHeadline,
  formatViewerCount,
} from "@/lib/twitch/channel/stream-display"
import { cn } from "@/lib/utils"

export function ChatPaneLiveBadge({
  expanded,
  className,
}: {
  expanded: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-sm bg-red-600 px-1 py-px text-[8px] leading-none font-bold tracking-wide text-white",
        className
      )}
    >
      LIVE
      <ChevronDownIcon
        className={cn("size-3 transition-transform", expanded && "rotate-180")}
        strokeWidth={2.75}
        aria-hidden
      />
    </span>
  )
}

export function ChatPaneStreamInfoToggle({
  expanded,
  onToggle,
  label,
  className,
  children,
}: {
  expanded: boolean
  onToggle: () => void
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex min-w-0 cursor-pointer items-center gap-2 rounded-md py-0.5 pr-1 text-left outline-none",
        "-ml-1 pl-1 hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/50",
        className
      )}
      aria-expanded={expanded}
      aria-label={
        expanded
          ? `Hide stream info for ${label}`
          : `Show stream info for ${label}`
      }
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {children}
    </button>
  )
}

export function ChatPaneLiveInfoBar({
  stream,
  channelLogin,
  channelRoomId,
  streamInfo,
  className,
}: {
  stream: TwitchLiveStream | null
  channelLogin: string
  channelRoomId: string | null
  streamInfo: ChatStreamInfoConfig
  className?: string
}) {
  const { account } = usePeepochatSettings()
  const live = stream !== null
  const needsChannelInfo =
    !live && (streamInfo.titleEnabled || streamInfo.categoryEnabled)
  const channel = useChannelInformation({
    login: channelLogin,
    broadcasterId: channelRoomId,
    enabled: needsChannelInfo,
    accessToken: account?.accessToken,
    clientId: account?.clientId,
  })
  const uptime = useStreamUptime(stream?.startedAt)
  const headline = formatStreamHeadline({
    title: stream?.title || channel?.title || "",
    gameName: stream?.gameName || channel?.gameName || "",
    showTitle: streamInfo.titleEnabled,
    showCategory: streamInfo.categoryEnabled,
    live,
  })
  const showViewers = live && streamInfo.viewerCountEnabled
  const showUptime = live && streamInfo.uptimeEnabled
  const showHeadline = headline.length > 0

  if (!showViewers && !showUptime && !showHeadline) {
    return null
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 border-b border-border bg-background px-3 py-1.5 text-xs text-muted-foreground",
        className
      )}
    >
      {stream && showViewers ? (
        <span className="flex shrink-0 items-center gap-1 text-red-600 tabular-nums">
          <EyeIcon className="size-3 shrink-0" aria-hidden />
          {formatViewerCount(stream.viewerCount)}
        </span>
      ) : null}
      {showHeadline ? (
        <span
          className="min-w-0 flex-1 truncate text-center text-foreground/80"
          title={headline}
        >
          {headline}
        </span>
      ) : null}
      {showUptime ? (
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 truncate tabular-nums",
            !showHeadline && "ml-auto"
          )}
        >
          <ClockIcon className="size-3 shrink-0" aria-hidden />
          {uptime ?? "—"}
        </span>
      ) : null}
    </div>
  )
}
