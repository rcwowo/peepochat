import { ListXIcon, PauseIcon, PlayIcon, SkipForwardIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useTtsPlayback } from "@/lib/tts/tts-context"
import { cn } from "@/lib/utils"

function ControlTooltip({
  label,
  side,
  children,
}: {
  label: string
  side: "top" | "bottom"
  children: React.ReactElement
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}

export function TtsPlaybackControls({
  size = "default",
  className,
}: {
  size?: "default" | "compact"
  className?: string
}) {
  const { queue, playing, togglePlaying, skipCurrent, clearQueue } =
    useTtsPlayback()
  const compact = size === "compact"
  const playLabel = playing ? "Pause speech" : "Resume speech"
  const tooltipSide = compact ? "bottom" : "top"

  return (
    <div
      role="toolbar"
      aria-label="Chatvoice playback"
      className={cn(
        "flex items-center justify-center",
        compact ? "gap-1" : "gap-4",
        className
      )}
    >
      <ControlTooltip label="Clear queue" side={tooltipSide}>
        <Button
          type="button"
          variant={compact ? "ghost" : "outline"}
          size={compact ? "icon-sm" : "icon"}
          className={cn(!compact && "rounded-full")}
          onClick={clearQueue}
          disabled={queue.length === 0}
          aria-label="Clear queue"
        >
          <ListXIcon />
        </Button>
      </ControlTooltip>
      <ControlTooltip label={playLabel} side={tooltipSide}>
        <Button
          type="button"
          size={compact ? "icon-sm" : "icon-lg"}
          className={cn(
            "shrink-0 rounded-full shine border-2 bg-transparent hover:bg-transparent hover:brightness-110",
            !compact && "size-11"
          )}
          onClick={togglePlaying}
          aria-label={playLabel}
        >
          {playing ? (
            <PauseIcon className={compact ? undefined : "size-5"} />
          ) : (
            <PlayIcon className={compact ? undefined : "size-5"} />
          )}
        </Button>
      </ControlTooltip>
      <ControlTooltip label="Skip message" side={tooltipSide}>
        <Button
          type="button"
          variant={compact ? "ghost" : "outline"}
          size={compact ? "icon-sm" : "icon"}
          className={cn(!compact && "rounded-full")}
          onClick={skipCurrent}
          disabled={queue.length === 0}
          aria-label="Skip message"
        >
          <SkipForwardIcon />
        </Button>
      </ControlTooltip>
    </div>
  )
}
