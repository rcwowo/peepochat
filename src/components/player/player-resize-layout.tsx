import * as React from "react"

import { useIsMobile } from "@/hooks/use-mobile"
import {
  PLAYER_CHAT_MIN_WIDTH_PX,
  PLAYER_DESKTOP_SIZE_DEFAULT,
} from "@/lib/peepochat/peepochat-config"
import { cn } from "@/lib/utils"

const DIVIDER_HIT_AREA_PX = 11

type PlayerResizeLayoutProps = {
  player: React.ReactNode
  chat: React.ReactNode
  desktopSizePercent: number
  onDesktopSizeChange: (size: number) => void
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function clampPlayerPercent(percent: number, containerWidth: number) {
  if (containerWidth <= 0) {
    return percent
  }

  const maxPercent =
    ((containerWidth - PLAYER_CHAT_MIN_WIDTH_PX) / containerWidth) * 100
  if (maxPercent <= 0) {
    return 0
  }

  return clamp(percent, 0, maxPercent)
}

export function PlayerResizeLayout({
  player,
  chat,
  desktopSizePercent,
  onDesktopSizeChange,
}: PlayerResizeLayoutProps) {
  const isMobile = useIsMobile()
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const frameRef = React.useRef<number | null>(null)
  const [containerWidth, setContainerWidth] = React.useState(0)
  const [transientSize, setTransientSize] = React.useState<number | null>(null)
  const size = clampPlayerPercent(
    transientSize ?? desktopSizePercent,
    containerWidth
  )

  React.useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      setContainerWidth(width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const commitSize = React.useCallback(
    (next: number) => {
      const normalized = Math.round(
        clampPlayerPercent(next, containerRef.current?.clientWidth ?? 0)
      )
      setTransientSize(null)
      onDesktopSizeChange(normalized)
    },
    [onDesktopSizeChange]
  )

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const container = containerRef.current
      if (!container) return

      event.currentTarget.focus()
      event.preventDefault()
      const rect = container.getBoundingClientRect()
      const startPosition = event.clientX
      const startSize = size
      let latestSize = startSize

      const handlePointerMove = (moveEvent: PointerEvent) => {
        latestSize = clampPlayerPercent(
          startSize + ((moveEvent.clientX - startPosition) / rect.width) * 100,
          rect.width
        )

        if (frameRef.current !== null) {
          window.cancelAnimationFrame(frameRef.current)
        }
        frameRef.current = window.requestAnimationFrame(() => {
          frameRef.current = null
          setTransientSize(latestSize)
        })
      }

      const finish = () => {
        window.removeEventListener("pointermove", handlePointerMove)
        window.removeEventListener("pointerup", finish)
        window.removeEventListener("pointercancel", finish)
        if (frameRef.current !== null) {
          window.cancelAnimationFrame(frameRef.current)
          frameRef.current = null
        }
        commitSize(latestSize)
      }

      window.addEventListener("pointermove", handlePointerMove)
      window.addEventListener("pointerup", finish, { once: true })
      window.addEventListener("pointercancel", finish, { once: true })
    },
    [commitSize, size]
  )

  React.useEffect(
    () => () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }
    },
    []
  )

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const decrease = event.key === "ArrowLeft" || event.key === "ArrowUp"
    const increase = event.key === "ArrowRight" || event.key === "ArrowDown"
    if (!decrease && !increase) return

    event.preventDefault()
    commitSize(size + (increase ? 2 : -2))
  }

  const maxPercent =
    containerWidth > PLAYER_CHAT_MIN_WIDTH_PX
      ? ((containerWidth - PLAYER_CHAT_MIN_WIDTH_PX) / containerWidth) * 100
      : 100

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative isolate flex h-full min-h-0 min-w-0 flex-1 overflow-hidden",
        isMobile && "flex-col"
      )}
    >
      <div
        className={cn(
          "relative z-0 flex min-h-0 min-w-0 overflow-hidden",
          isMobile && "w-full shrink-0"
        )}
        style={isMobile ? undefined : { flexBasis: `${size}%`, flexGrow: size }}
      >
        {player}
      </div>
      {isMobile ? null : (
        <div
          role="separator"
          tabIndex={0}
          aria-label="Resize player and chat"
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={Math.round(maxPercent)}
          aria-valuenow={Math.round(size)}
          className="group relative z-20 h-full w-px shrink-0 cursor-col-resize touch-none bg-border transition-colors outline-none hover:bg-primary/60 focus-visible:bg-primary/60"
          onPointerDown={handlePointerDown}
          onKeyDown={handleKeyDown}
          onDoubleClick={() => commitSize(PLAYER_DESKTOP_SIZE_DEFAULT)}
        >
          <div
            className="absolute inset-y-0 left-1/2 -translate-x-1/2 bg-transparent"
            style={{ width: DIVIDER_HIT_AREA_PX }}
          />
        </div>
      )}
      <div
        className={cn(
          "relative z-0 flex min-h-0 min-w-0 overflow-hidden",
          isMobile && "flex-1"
        )}
        style={
          isMobile
            ? undefined
            : {
                flexBasis: `${100 - size}%`,
                flexGrow: 100 - size,
                minWidth: PLAYER_CHAT_MIN_WIDTH_PX,
              }
        }
      >
        {chat}
      </div>
    </div>
  )
}
