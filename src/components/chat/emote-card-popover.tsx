import * as React from "react"

import { ChatHoverTooltipTarget } from "@/components/chat/chat-hover-tooltip"
import { EmoteTooltipBody } from "@/components/chat/emote-tooltip-content"
import { useEmoteCardContext } from "@/hooks/chat-ui/use-emote-card-context"
import type { EmoteCardTarget } from "@/lib/chat/emote-card"
import { cn } from "@/lib/utils"

const EMPTY_OVERLAY_NAMES: string[] = []

type EmoteCardPopoverProps = {
  target: EmoteCardTarget
  children: React.ReactNode
  /** Zero-width emote names layered on top of this emote. */
  overlayNames?: string[]
  /** When true, left click opens the card. When false, only context menu opens it. */
  openOnClick?: boolean
  className?: string
}

export function EmoteCardPopover({
  target,
  children,
  overlayNames = EMPTY_OVERLAY_NAMES,
  openOnClick = true,
  className,
}: EmoteCardPopoverProps) {
  const context = useEmoteCardContext()
  const triggerRef = React.useRef<HTMLSpanElement>(null)

  const handleTriggerClick = React.useCallback(
    (event: React.MouseEvent) => {
      if (!openOnClick || !context) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      context.toggleEmoteCard(target, triggerRef.current)
    },
    [context, openOnClick, target]
  )

  const handleContextMenu = React.useCallback(
    (event: React.MouseEvent) => {
      if (!context) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      if (!context.isEmoteCardOpenFor(target)) {
        context.openEmoteCard(target, triggerRef.current)
      }
    },
    [context, target]
  )

  if (!context) {
    return <>{children}</>
  }

  const trigger = (
    <ChatHoverTooltipTarget
      ref={triggerRef}
      className={cn(openOnClick && "cursor-pointer", className)}
      tooltipClassName="max-w-[min(16rem,90vw)] px-2 py-1.5"
      content={
        <EmoteTooltipBody
          name={target.code}
          provider={target.provider}
          overlayNames={overlayNames}
        />
      }
      onClick={handleTriggerClick}
      onContextMenu={handleContextMenu}
    >
      {children}
    </ChatHoverTooltipTarget>
  )

  return trigger
}
