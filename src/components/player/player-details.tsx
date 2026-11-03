import { ClockIcon, EyeIcon } from "lucide-react"

import { useStreamUptime } from "@/hooks/twitch/player/use-stream-uptime"
import { formatViewerCount } from "@/lib/twitch/channel/stream-display"

export function PlayerDetails({
  channelLogin,
  displayName,
  profileImageUrl,
  description,
  title,
  gameName,
  viewerCount,
  startedAt,
  loading,
  error,
}: {
  channelLogin: string
  displayName: string
  profileImageUrl?: string
  description: string
  title: string
  gameName: string
  viewerCount: number | null
  startedAt?: string
  loading: boolean
  error: boolean
}) {
  const uptime = useStreamUptime(startedAt)

  return (
    <div className="hidden px-5 pt-5 md:block">
      <div className="flex min-w-0 items-start justify-between gap-5">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">
            {title || (loading ? "Loading stream…" : `${displayName}'s stream`)}
          </h1>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {gameName || (viewerCount === null ? "Offline" : "Uncategorized")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs tabular-nums">
          {viewerCount !== null ? (
            <span className="flex items-center gap-1 text-red-500">
              <EyeIcon className="size-3.5" aria-hidden />
              {formatViewerCount(viewerCount)}
            </span>
          ) : null}
          {uptime ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              <ClockIcon className="size-3.5" aria-hidden />
              {uptime}
            </span>
          ) : null}
        </div>
      </div>

      <section className="mt-4 mb-5 flex min-w-0 items-start gap-3 rounded-xl bg-sidebar p-4">
        {profileImageUrl ? (
          <img
            src={profileImageUrl}
            alt=""
            className="size-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary uppercase">
            {channelLogin.slice(0, 2)}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">About {displayName}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {description ||
              (error
                ? "Channel details could not be loaded."
                : "This channel has not added a description.")}
          </p>
        </div>
      </section>
    </div>
  )
}
