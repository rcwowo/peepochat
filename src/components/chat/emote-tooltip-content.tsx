import { PickerIcon } from "@/components/chat/picker-icon"
import { EMOTE_PLATFORM_META } from "@/lib/chat/emote-platform-meta"
import type { TwitchEmoteProvider } from "@/lib/twitch/twitch-chat"
import { cn } from "@/lib/utils"

const EMPTY_OVERLAY_NAMES: string[] = []

type EmoteTooltipBodyProps = {
  name: string
  provider: TwitchEmoteProvider
  overlayNames?: string[]
  className?: string
}

export function EmoteTooltipBody({
  name,
  provider,
  overlayNames = EMPTY_OVERLAY_NAMES,
  className,
}: EmoteTooltipBodyProps) {
  const platform = EMOTE_PLATFORM_META[provider]
  const hasOverlays = overlayNames.length > 0

  return (
    <span
      className={cn(
        hasOverlays
          ? "inline-flex flex-col items-center gap-1"
          : "inline-flex items-center justify-center gap-1.5",
        className
      )}
    >
      <span className="inline-flex items-center justify-center gap-1.5">
        <PickerIcon
          src={platform.iconSrc}
          className="size-3.5 shrink-0 bg-background"
        />
        <span className="line-clamp-2 min-w-0 text-center break-all">
          {name}
        </span>
        <span className="sr-only"> ({platform.label})</span>
      </span>
      {hasOverlays ? (
        <span className="text-center text-[11px] text-background/80">
          {overlayNames.join(", ")}
        </span>
      ) : null}
    </span>
  )
}
