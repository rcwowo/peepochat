import * as React from "react"

import { PickerIcon } from "@/components/chat/picker-icon"
import { TooltipContent } from "@/components/ui/tooltip"
import { EMOTE_PLATFORM_META } from "@/lib/chat/emote-platform-meta"
import type { TwitchEmoteProvider } from "@/lib/twitch/twitch-chat"
import { cn } from "@/lib/utils"

type EmoteTooltipContentProps = React.ComponentProps<typeof TooltipContent> & {
  name: string
  provider: TwitchEmoteProvider
  overlayNames?: string[]
}

export function EmoteTooltipContent({
  name,
  provider,
  overlayNames = [],
  className,
  side = "top",
  sideOffset = 4,
  ...props
}: EmoteTooltipContentProps) {
  const platform = EMOTE_PLATFORM_META[provider]
  const hasOverlays = overlayNames.length > 0

  return (
    <TooltipContent
      side={side}
      sideOffset={sideOffset}
      className={cn(
        "pointer-events-none max-w-[min(16rem,90vw)] px-2 py-1.5 text-xs",
        hasOverlays
          ? "inline-flex flex-col items-center gap-1"
          : "inline-flex items-center justify-center gap-1.5",
        className
      )}
      {...props}
    >
      <span className="inline-flex items-center justify-center gap-1.5">
        <PickerIcon
          src={platform.iconSrc}
          className="size-3.5 shrink-0 bg-background"
        />
        <span className="line-clamp-2 min-w-0 break-all text-center">{name}</span>
        <span className="sr-only"> ({platform.label})</span>
      </span>
      {hasOverlays ? (
        <span className="text-center text-[11px] text-background/80">
          {overlayNames.join(", ")}
        </span>
      ) : null}
    </TooltipContent>
  )
}
