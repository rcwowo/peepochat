import { ChevronDownIcon, ClockIcon, EyeIcon } from "lucide-react"

import type { TwitchLiveStream } from "@/lib/twitch/twitch-api"
import { formatViewerCount } from "@/lib/twitch/stream-display"
import { useStreamUptime } from "@/hooks/twitch/use-stream-uptime"
import { cn } from "@/lib/utils"

export function ChatPaneLiveBadge({
  expanded,
  onToggle,
  className,
}: {
  expanded: boolean
  onToggle: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded-sm bg-red-600 px-1 py-px text-[8px] leading-none font-bold tracking-wide text-white transition-shadow",
        expanded && "ring-1 ring-red-400/80",
        className
      )}
      aria-expanded={expanded}
      aria-label={expanded ? "Hide stream info" : "Show stream info"}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      LIVE
      <ChevronDownIcon
        className={cn("size-3 transition-transform", expanded && "rotate-180")}
        strokeWidth={2.75}
        aria-hidden
      />
    </button>
  )
}

export function ChatPaneLiveInfoBar({
  stream,
  className,
}: {
  stream: TwitchLiveStream
  className?: string
}) {
  const uptime = useStreamUptime(stream.startedAt)

  return (
    <div
      className={cn(
        "grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-2 border-b border-border bg-background px-3 py-1.5 text-xs text-muted-foreground",
        className
      )}
    >
      <span className="flex min-w-0 items-center gap-1 truncate text-red-600 tabular-nums">
        <EyeIcon className="size-3 shrink-0" aria-hidden />
        {formatViewerCount(stream.viewerCount)}
      </span>
      <span className="min-w-0 truncate text-center text-foreground/80">
        {stream.title || "Untitled stream"}
      </span>
      <span className="flex min-w-0 items-center justify-end gap-1 truncate tabular-nums">
        <ClockIcon className="size-3 shrink-0" aria-hidden />
        {uptime ?? "—"}
      </span>
    </div>
  )
}
