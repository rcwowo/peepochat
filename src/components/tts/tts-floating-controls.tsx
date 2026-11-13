import * as React from "react"
import {
  AudioLinesIcon,
  GripVerticalIcon,
  PanelRightOpenIcon,
} from "lucide-react"

import { TtsPlaybackControls } from "@/components/tts/tts-playback-controls"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useTtsPlayback, useTtsSession } from "@/lib/tts/tts-context"
import { cn } from "@/lib/utils"

const VIEWPORT_MARGIN_PX = 12

type Position = { x: number; y: number }
type Size = { width: number; height: number }

function clampPosition(position: Position, size: Size): Position {
  const maxX = Math.max(
    VIEWPORT_MARGIN_PX,
    window.innerWidth - size.width - VIEWPORT_MARGIN_PX
  )
  const maxY = Math.max(
    VIEWPORT_MARGIN_PX,
    window.innerHeight - size.height - VIEWPORT_MARGIN_PX
  )
  return {
    x: Math.round(Math.min(maxX, Math.max(VIEWPORT_MARGIN_PX, position.x))),
    y: Math.round(Math.min(maxY, Math.max(VIEWPORT_MARGIN_PX, position.y))),
  }
}

function defaultPosition(size: Size): Position {
  return {
    x: window.innerWidth - size.width - VIEWPORT_MARGIN_PX * 2,
    y: window.innerHeight - size.height - VIEWPORT_MARGIN_PX * 2,
  }
}

function useViewportSize() {
  const [size, setSize] = React.useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }))

  React.useEffect(() => {
    const update = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  return size
}

function FloatingStatus() {
  const { queue, activeItemId, playing, queueEnabled } = useTtsPlayback()
  const active = queue.find((item) => item.id === activeItemId) ?? null
  const waiting = active ? queue.length - 1 : queue.length

  let title: string
  if (active) {
    title = active.displayName
  } else if (!playing) {
    title = "Paused"
  } else if (!queueEnabled) {
    title = "Queueing off"
  } else {
    title = "Listening"
  }

  const detail = active
    ? playing
      ? waiting > 0
        ? `Speaking · ${waiting} queued`
        : "Speaking"
      : waiting > 0
        ? `Paused · ${waiting} queued`
        : "Paused"
    : queue.length > 0
      ? `${queue.length} queued`
      : "Queue is empty"

  return (
    <div className="min-w-0 flex-1 leading-tight" aria-live="polite">
      <div className="truncate text-xs font-semibold">{title}</div>
      <div className="truncate text-[11px] text-muted-foreground">{detail}</div>
    </div>
  )
}

export function TtsFloatingControls() {
  const { channelLogin, ui, setCollapsed, setFloatingPosition } =
    useTtsSession()
  const { activeItemId, playing } = useTtsPlayback()
  const viewport = useViewportSize()
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [size, setSize] = React.useState<Size>({ width: 280, height: 56 })
  const [dragPosition, setDragPosition] = React.useState<Position | null>(null)
  const dragRef = React.useRef<{
    pointerId: number
    offsetX: number
    offsetY: number
  } | null>(null)

  const visible = Boolean(channelLogin) && ui.collapsed

  React.useLayoutEffect(() => {
    const element = containerRef.current
    if (!visible || !element || typeof ResizeObserver === "undefined") {
      return
    }
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect()
      setSize((current) =>
        current.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height }
      )
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [visible])

  if (!visible) {
    return null
  }

  const position = clampPosition(
    dragPosition ?? ui.floating ?? defaultPosition(size),
    { width: Math.min(size.width, viewport.width), height: size.height }
  )

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
    if (dragPosition) {
      setFloatingPosition(clampPosition(dragPosition, size))
    }
    setDragPosition(null)
  }

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Text-to-speech controls"
      style={{ left: position.x, top: position.y }}
      onPointerDown={(event) => {
        if (
          event.button !== 0 ||
          (event.target instanceof Element &&
            event.target.closest("button, [role='toolbar']"))
        ) {
          return
        }
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = {
          pointerId: event.pointerId,
          offsetX: event.clientX - position.x,
          offsetY: event.clientY - position.y,
        }
        setDragPosition(position)
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId) {
          return
        }
        setDragPosition(
          clampPosition(
            {
              x: event.clientX - drag.offsetX,
              y: event.clientY - drag.offsetY,
            },
            size
          )
        )
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={cn(
        "fixed z-40 flex w-72 max-w-[calc(100vw-1.5rem)] cursor-grab touch-none items-center gap-2 rounded-xl border border-border bg-popover/95 py-2 pr-2 pl-1 text-popover-foreground shadow-xl backdrop-blur-sm supports-backdrop-filter:bg-popover/85",
        dragPosition && "cursor-grabbing select-none"
      )}
    >
      <div
        aria-hidden
        className="flex shrink-0 items-center gap-1.5 self-stretch pl-1 text-muted-foreground"
      >
        <GripVerticalIcon className="size-3.5" />
        <AudioLinesIcon
          className={cn(
            "size-4 text-primary",
            activeItemId && playing && "motion-safe:animate-pulse"
          )}
        />
      </div>
      <FloatingStatus />
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
        <TooltipContent side="top">Show queue</TooltipContent>
      </Tooltip>
    </div>
  )
}
