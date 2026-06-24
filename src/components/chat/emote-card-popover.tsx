import * as React from "react"

import { EmoteTooltipContent } from "@/components/chat/emote-tooltip-content"
import { useEmoteCardContext } from "@/hooks/chat/use-emote-card-context"
import {
  Tooltip,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { EmoteCardTarget } from "@/lib/chat/emote-card"
import { cn } from "@/lib/utils"

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
  overlayNames = [],
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
    <span
      ref={triggerRef}
      className={cn(openOnClick && "cursor-pointer", className)}
      onClick={handleTriggerClick}
      onContextMenu={handleContextMenu}
    >
      {children}
    </span>
  )

  return (
    <Tooltip disableHoverableContent>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <EmoteTooltipContent
        name={target.code}
        provider={target.provider}
        overlayNames={overlayNames}
      />
    </Tooltip>
  )
}
