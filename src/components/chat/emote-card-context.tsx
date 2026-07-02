import * as React from "react"

import {
  EmoteCardContext,
  type EmoteCardContextValue,
} from "@/components/chat/emote-card-context.shared"
import { EmoteCardPanel } from "@/components/chat/emote-card-panel"
import { useEmoteCard } from "@/hooks/chat/use-emote-card"
import type { ComposerEmoteCatalog } from "@/lib/chat/chat-emote-catalog"
import { emoteCardTargetKey, type EmoteCardTarget } from "@/lib/chat/emote-card"
import {
  EMOTE_CARD_ANCHOR_BUCKET,
  emoteCardWidthPx,
  type EmoteRatioBucket,
} from "@/lib/chat/emote-picker-layout"

const EMOTE_CARD_ESTIMATED_HEIGHT_PX = 300
const EMOTE_CARD_VIEWPORT_MARGIN_PX = 8

function computeAnchorPosition(
  rect: DOMRect | null,
  anchorWidth: number
): { left: number; top: number } | null {
  if (!rect) {
    return null
  }

  const margin = EMOTE_CARD_VIEWPORT_MARGIN_PX
  const preferredLeft = rect.right + margin
  const left =
    preferredLeft + anchorWidth <= window.innerWidth - margin
      ? preferredLeft
      : rect.left - anchorWidth - margin

  return {
    left: Math.max(
      margin,
      Math.min(left, window.innerWidth - anchorWidth - margin)
    ),
    top: Math.max(
      margin,
      Math.min(
        rect.top,
        window.innerHeight - EMOTE_CARD_ESTIMATED_HEIGHT_PX - margin
      )
    ),
  }
}

export function EmoteCardProvider({
  catalog,
  children,
}: {
  catalog: ComposerEmoteCatalog
  children: React.ReactNode
}) {
  const [activeTarget, setActiveTarget] =
    React.useState<EmoteCardTarget | null>(null)
  const [open, setOpen] = React.useState(false)
  const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 })
  const [anchorPosition, setAnchorPosition] = React.useState<{
    left: number
    top: number
  } | null>(null)
  const [ratioBucket, setRatioBucket] = React.useState<EmoteRatioBucket>(1)
  const activeTriggerRef = React.useRef<HTMLElement | null>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)
  const anchorWidth = emoteCardWidthPx(EMOTE_CARD_ANCHOR_BUCKET)

  const card = useEmoteCard({
    open,
    target: activeTarget,
    catalog,
  })

  const resetEmoteCardState = React.useCallback(() => {
    setDragOffset({ x: 0, y: 0 })
    setAnchorPosition(null)
    setActiveTarget(null)
    activeTriggerRef.current = null
    setRatioBucket(1)
  }, [])

  const closeEmoteCard = React.useCallback(() => {
    setOpen(false)
    resetEmoteCardState()
  }, [resetEmoteCardState])

  const openEmoteCard = React.useCallback(
    (target: EmoteCardTarget, triggerEl: HTMLElement | null) => {
      const rect = triggerEl?.getBoundingClientRect() ?? null
      setRatioBucket(1)
      setActiveTarget(target)
      activeTriggerRef.current = triggerEl
      setAnchorPosition(computeAnchorPosition(rect, anchorWidth))
      setOpen(true)
    },
    [anchorWidth]
  )

  const isEmoteCardOpenFor = React.useCallback(
    (target: EmoteCardTarget) => {
      return (
        open &&
        activeTarget !== null &&
        emoteCardTargetKey(activeTarget) === emoteCardTargetKey(target)
      )
    },
    [activeTarget, open]
  )

  const toggleEmoteCard = React.useCallback(
    (target: EmoteCardTarget, triggerEl: HTMLElement | null) => {
      if (isEmoteCardOpenFor(target)) {
        closeEmoteCard()
        return
      }
      openEmoteCard(target, triggerEl)
    },
    [closeEmoteCard, isEmoteCardOpenFor, openEmoteCard]
  )

  const handleDragStart = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      const startX = event.clientX
      const startY = event.clientY
      const startOffset = dragOffset

      const handlePointerMove = (moveEvent: PointerEvent) => {
        setDragOffset({
          x: startOffset.x + moveEvent.clientX - startX,
          y: startOffset.y + moveEvent.clientY - startY,
        })
      }

      const handlePointerUp = () => {
        window.removeEventListener("pointermove", handlePointerMove)
        window.removeEventListener("pointerup", handlePointerUp)
      }

      window.addEventListener("pointermove", handlePointerMove)
      window.addEventListener("pointerup", handlePointerUp, { once: true })
    },
    [dragOffset]
  )

  const onCloseEmoteCard = React.useEffectEvent(closeEmoteCard)

  React.useEffect(() => {
    if (!open) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const targetNode = event.target as Node
      if (
        panelRef.current?.contains(targetNode) ||
        activeTriggerRef.current?.contains(targetNode)
      ) {
        return
      }
      onCloseEmoteCard()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseEmoteCard()
      }
    }

    window.addEventListener("pointerdown", handlePointerDown, true)
    window.addEventListener("keydown", handleKeyDown, true)
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true)
      window.removeEventListener("keydown", handleKeyDown, true)
    }
  }, [open])

  const contextValue = React.useMemo<EmoteCardContextValue>(
    () => ({
      openEmoteCard,
      closeEmoteCard,
      toggleEmoteCard,
      isEmoteCardOpenFor,
    }),
    [closeEmoteCard, isEmoteCardOpenFor, openEmoteCard, toggleEmoteCard]
  )

  return (
    <EmoteCardContext.Provider value={contextValue}>
      {children}
      {open && activeTarget && anchorPosition ? (
        <EmoteCardPanel
          target={activeTarget}
          card={card}
          ratioBucket={ratioBucket}
          onRatioBucket={setRatioBucket}
          anchorPosition={anchorPosition}
          dragOffset={dragOffset}
          panelRef={panelRef}
          onClose={closeEmoteCard}
          onDragStart={handleDragStart}
          onRetry={() => {
            void card.reload()
          }}
        />
      ) : null}
    </EmoteCardContext.Provider>
  )
}
