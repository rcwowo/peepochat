import * as React from "react"

import { useIsMobile } from "@/hooks/use-mobile"
import {
  PLAYER_CHAT_MIN_WIDTH_PX,
  PLAYER_DESKTOP_SIZE_DEFAULT,
  PLAYER_DESKTOP_SIZE_MIN,
} from "@/lib/peepochat/peepochat-config"
import {
  ResizeActivityProvider,
  ResizeSeparator,
} from "@/components/resize-session"
import { usePointerResizeSession } from "@/hooks/use-resize-session"
import {
  clampPlayerPercent,
  getPersistedPlayerPercent,
  getPlayerMaxPercent,
} from "@/lib/player-resize"
import { cn } from "@/lib/utils"

type PlayerResizeLayoutProps = {
  player: React.ReactNode
  chat: React.ReactNode
  desktopSizePercent: number
  onDesktopSizeChange: (size: number) => void
}

export function PlayerResizeLayout({
  player,
  chat,
  desktopSizePercent,
  onDesktopSizeChange,
}: PlayerResizeLayoutProps) {
  const isMobile = useIsMobile()
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const playerRef = React.useRef<HTMLDivElement | null>(null)
  const playerContentRef = React.useRef<HTMLDivElement | null>(null)
  const chatRef = React.useRef<HTMLDivElement | null>(null)
  const releasePlayerFreezeRef = React.useRef<(() => void) | null>(null)
  const [containerWidth, setContainerWidth] = React.useState(0)
  const resizeSession = usePointerResizeSession<number>()
  const size = clampPlayerPercent(desktopSizePercent, containerWidth)
  const maxPercent = getPlayerMaxPercent(containerWidth)
  const persistedMax = Math.floor(maxPercent)
  const canResize = persistedMax >= PLAYER_DESKTOP_SIZE_MIN

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

  const applyPreview = React.useCallback((next: number) => {
    const nextSize = clampPlayerPercent(
      next,
      containerRef.current?.clientWidth ?? 0
    )
    if (playerRef.current) {
      playerRef.current.style.flexBasis = `${nextSize}%`
      playerRef.current.style.flexGrow = String(nextSize)
    }
    if (chatRef.current) {
      chatRef.current.style.flexBasis = `${100 - nextSize}%`
      chatRef.current.style.flexGrow = String(100 - nextSize)
    }
  }, [])

  const freezePlayerContent = React.useCallback(() => {
    releasePlayerFreezeRef.current?.()
    const content = playerContentRef.current
    if (!content) {
      return
    }

    const rect = content.getBoundingClientRect()
    const previousWidth = content.style.width
    const previousHeight = content.style.height
    const previousFlex = content.style.flex
    content.style.width = `${rect.width}px`
    content.style.height = `${rect.height}px`
    content.style.flex = "none"
    releasePlayerFreezeRef.current = () => {
      content.style.width = previousWidth
      content.style.height = previousHeight
      content.style.flex = previousFlex
      releasePlayerFreezeRef.current = null
    }
  }, [])

  const commitSize = React.useCallback(
    (next: number) => {
      releasePlayerFreezeRef.current?.()
      const width = containerRef.current?.clientWidth ?? 0
      const normalized = getPersistedPlayerPercent(next, width)
      if (normalized === null) {
        applyPreview(clampPlayerPercent(desktopSizePercent, width))
        return
      }

      applyPreview(normalized)
      onDesktopSizeChange(normalized)
    },
    [applyPreview, desktopSizePercent, onDesktopSizeChange]
  )

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const container = containerRef.current
      if (!container) return

      event.currentTarget.focus()
      const rect = container.getBoundingClientRect()
      const startPosition = event.clientX
      const startSize = size
      freezePlayerContent()
      resizeSession.start({
        event,
        initialValue: startSize,
        getValue: (moveEvent) =>
          clampPlayerPercent(
            startSize +
              ((moveEvent.clientX - startPosition) / rect.width) * 100,
            rect.width
          ),
        onPreview: applyPreview,
        onCommit: commitSize,
        onCancel: () => {
          applyPreview(startSize)
          releasePlayerFreezeRef.current?.()
        },
      })
    },
    [applyPreview, commitSize, freezePlayerContent, resizeSession, size]
  )

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const decrease = event.key === "ArrowLeft" || event.key === "ArrowUp"
    const increase = event.key === "ArrowRight" || event.key === "ArrowDown"
    if (!decrease && !increase) return

    event.preventDefault()
    commitSize(size + (increase ? 2 : -2))
  }

  return (
    <ResizeActivityProvider active={resizeSession.active}>
      <div
        ref={containerRef}
        className={cn(
          "relative isolate flex h-full min-h-0 min-w-0 flex-1 overflow-hidden",
          isMobile && "flex-col"
        )}
      >
        <div
          ref={playerRef}
          className={cn(
            "relative z-0 flex min-h-0 min-w-0 overflow-hidden",
            isMobile && "w-full shrink-0"
          )}
          style={
            isMobile ? undefined : { flexBasis: `${size}%`, flexGrow: size }
          }
        >
          <div
            ref={playerContentRef}
            className={cn(
              isMobile ? "contents" : "h-full min-h-0 w-full min-w-0"
            )}
          >
            {player}
          </div>
        </div>
        {!isMobile && canResize ? (
          <ResizeSeparator
            direction="row"
            label="Resize player and chat"
            valueMin={PLAYER_DESKTOP_SIZE_MIN}
            valueMax={persistedMax}
            valueNow={Math.round(size)}
            onPointerDown={handlePointerDown}
            onKeyDown={handleKeyDown}
            onDoubleClick={() => commitSize(PLAYER_DESKTOP_SIZE_DEFAULT)}
          />
        ) : null}
        <div
          ref={chatRef}
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
    </ResizeActivityProvider>
  )
}
