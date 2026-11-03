import * as React from "react"
import { EyeIcon, XIcon } from "lucide-react"

import { WatchChannelAvatar } from "@/components/player/watch-channel-avatar"
import { useWatchedChannel } from "@/hooks/player/use-watched-channel"
import { formatViewerCount } from "@/lib/twitch/channel/stream-display"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function VideoPaneHeader({
  login,
  dragHandleProps,
  onClose,
}: {
  login: string
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>
  onClose: () => void
}) {
  const { displayName, profileImageUrl, stream, loading } =
    useWatchedChannel(login)

  return (
    <div
      {...dragHandleProps}
      className={cn(
        "pointer-events-auto flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border bg-sidebar px-2",
        dragHandleProps?.className
      )}
    >
      <div className="flex min-w-0 items-center gap-2 px-1">
        <WatchChannelAvatar login={login} profileImageUrl={profileImageUrl} />
        <span className="min-w-0 truncate text-sm font-medium">
          {displayName}
        </span>
      </div>
      <div
        className="flex shrink-0 items-center gap-2"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {stream ? (
          <span className="flex items-center gap-1 text-xs text-red-500 tabular-nums">
            <EyeIcon className="size-3.5" aria-hidden />
            {formatViewerCount(stream.viewerCount)}
          </span>
        ) : loading ? null : (
          <span className="text-xs text-muted-foreground">Offline</span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-foreground"
          aria-label={`Close ${displayName} stream`}
          onClick={onClose}
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
