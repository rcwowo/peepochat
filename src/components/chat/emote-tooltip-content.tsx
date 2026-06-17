import * as React from "react"

import { PickerIcon } from "@/components/chat/picker-icon"
import { TooltipContent } from "@/components/ui/tooltip"
import { EMOTE_PLATFORM_META } from "@/lib/chat/emote-platform-meta"
import type { TwitchEmoteProvider } from "@/lib/twitch/twitch-chat"
import { cn } from "@/lib/utils"

type EmoteTooltipContentProps = React.ComponentProps<typeof TooltipContent> & {
  name: string
  provider: TwitchEmoteProvider
}

export function EmoteTooltipContent({
  name,
  provider,
  className,
  side = "top",
  sideOffset = 4,
  ...props
}: EmoteTooltipContentProps) {
  const platform = EMOTE_PLATFORM_META[provider]

  return (
    <TooltipContent
      side={side}
      sideOffset={sideOffset}
      className={cn(
        "pointer-events-none inline-flex max-w-[min(16rem,90vw)] items-center justify-center gap-1.5 px-2 py-1.5 text-xs",
        className
      )}
      {...props}
    >
      <PickerIcon
        src={platform.iconSrc}
        className="size-3.5 shrink-0 bg-background"
      />
      <span className="line-clamp-2 min-w-0 break-all text-center">{name}</span>
      <span className="sr-only"> ({platform.label})</span>
    </TooltipContent>
  )
}
