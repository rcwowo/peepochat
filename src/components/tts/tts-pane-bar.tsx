import type * as React from "react"

import {
  AudioLinesIcon,
  HourglassIcon,
  PanelRightOpenIcon,
  PauseIcon,
} from "lucide-react"

import { TtsPlaybackControls } from "@/components/tts/tts-playback-controls"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  useTtsPlayback,
  useTtsSession,
  type TtsQueueItem,
} from "@/lib/tts/tts-context"
import { cn } from "@/lib/utils"

type TtsPaneState = "speaking" | "waiting" | "paused"

const STATE_ICONS = {
  speaking: { icon: AudioLinesIcon, label: "Speaking" },
  waiting: { icon: HourglassIcon, label: "Waiting for messages" },
  paused: { icon: PauseIcon, label: "Paused" },
} satisfies Record<
  TtsPaneState,
  { icon: React.ComponentType<{ className?: string }>; label: string }
>

function TtsPaneStateIcon({ state }: { state: TtsPaneState }) {
  const { icon: Icon, label } = STATE_ICONS[state]

  return (
    <span role="img" aria-label={label} title={label} className="shrink-0">
      <Icon
        aria-hidden
        className={cn(
          "size-4",
          state === "speaking"
            ? "text-primary motion-safe:animate-pulse"
            : "text-muted-foreground"
        )}
      />
    </span>
  )
}

function TtsPaneStatus({ active }: { active: TtsQueueItem | null }) {
  const { queue, queueEnabled } = useTtsPlayback()
  const waiting = active ? queue.length - 1 : queue.length
  const queuedLabel = waiting > 0 ? `${waiting} queued` : null

  if (active) {
    return (
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex min-w-0 items-baseline gap-1.5 text-xs">
          <span className="min-w-0 truncate font-semibold">
            {active.displayName}
          </span>
          {queuedLabel ? (
            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular-nums">
              {queuedLabel}
            </span>
          ) : null}
        </div>
        <div
          className="truncate text-[11px] text-muted-foreground"
          title={active.text}
        >
          {active.text}
        </div>
      </div>
    )
  }

  return (
    <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground tabular-nums">
      {!queueEnabled ? "Queueing off" : (queuedLabel ?? "Queue is empty")}
    </div>
  )
}

function TtsPaneBarContent() {
  const { setCollapsed } = useTtsSession()
  const { queue, activeItemId, playing } = useTtsPlayback()
  const active = queue.find((item) => item.id === activeItemId) ?? null
  const state: TtsPaneState = !playing
    ? "paused"
    : active
      ? "speaking"
      : "waiting"

  return (
    <div
      role="region"
      aria-label="Chatvoice controls"
      className="absolute inset-x-2 top-2 z-20 flex items-center gap-2 overflow-hidden rounded-md border border-border bg-background py-1.5 pr-1.5 pl-3 shadow-md"
    >
      <TtsPaneStateIcon state={state} />
      <TtsPaneStatus active={active} />
      <TtsPlaybackControls size="compact" className="shrink-0" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Show queue"
            onClick={() => setCollapsed(false)}
          >
            <PanelRightOpenIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Show queue</TooltipContent>
      </Tooltip>
    </div>
  )
}

export function TtsPaneBar({ channelLogin }: { channelLogin: string }) {
  const { channelLogin: ttsChannelLogin, ui } = useTtsSession()

  if (ttsChannelLogin !== channelLogin || !ui.collapsed) {
    return null
  }

  return <TtsPaneBarContent />
}
