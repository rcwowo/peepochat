import * as React from "react"
import { ChevronDownIcon, ClockIcon, EyeIcon } from "lucide-react"

import type { TwitchLiveStream } from "@/lib/twitch/twitch-api"
import {
  formatStreamUptime,
  formatViewerCount,
} from "@/lib/twitch/stream-display"
import { cn } from "@/lib/utils"

function useStreamUptime(startedAt: string | undefined) {
  const [now, setNow] = React.useState(() => Date.now())

  React.useEffect(() => {
    if (!startedAt) return

    const interval = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(interval)
    }
  }, [startedAt])

  if (!startedAt) return null

  const startedMs = new Date(startedAt).getTime()
  if (Number.isNaN(startedMs)) return null

  return formatStreamUptime(now - startedMs)
}

export function ChatPaneLiveBadge({
  expanded,
  onToggle,
}: {
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded-sm bg-red-600 px-1 py-px text-[8px] leading-none font-bold tracking-wide text-white transition-shadow",
        expanded && "ring-1 ring-red-400/80"
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

export function ChatPaneLiveInfoBar({ stream }: { stream: TwitchLiveStream }) {
  const uptime = useStreamUptime(stream.startedAt)

  return (
    <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-2 border-b border-border bg-background px-3 py-1.5 text-xs text-muted-foreground">
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
