import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { TwitchEmote } from "@/lib/twitch-chat"

function getEmoteSrcSet(emote: TwitchEmote) {
  if (emote.provider !== "twitch") {
    return undefined
  }

  const base = emote.imageUrl.replace(/\/1\.0$/, "")
  return `${base}/1.0 1x, ${base}/2.0 2x, ${base}/3.0 3x`
}

export function ChatEmote({
  emote,
  label,
}: {
  emote: TwitchEmote
  label: string
}) {
  const srcSet = getEmoteSrcSet(emote)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="chat-emote inline-grid align-middle">
          <img
            className="col-start-1 row-start-1 object-contain"
            src={emote.imageUrl}
            srcSet={srcSet}
            alt={label}
            loading="lazy"
            decoding="async"
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4} className="px-2 py-1 text-xs">
        {label}
        <span className="text-muted-foreground"> · {emote.provider}</span>
      </TooltipContent>
    </Tooltip>
  )
}
