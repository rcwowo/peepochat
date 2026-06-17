import {
  Tooltip,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { EmoteTooltipContent } from "@/components/chat/emote-tooltip-content"
import type { TwitchEmote } from "@/lib/twitch/twitch-chat"

function getEmoteSrcSet(emote: TwitchEmote) {
  if (emote.provider !== "twitch") {
    return undefined
  }

  const base = emote.imageUrl.replace(/\/1\.0$/, "")
  return `${base}/1.0 1x, ${base}/2.0 2x, ${base}/3.0 3x`
}

function twitchStaticFallbackUrl(url: string) {
  if (!url.includes("/animated/")) {
    return null
  }
  return url.replace("/animated/", "/static/")
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
    <Tooltip disableHoverableContent>
      <TooltipTrigger asChild>
        <span className="chat-emote inline-grid align-middle">
          <img
            className="col-start-1 row-start-1 object-contain"
            src={emote.imageUrl}
            srcSet={srcSet}
            alt={label}
            loading="lazy"
            decoding="async"
            onError={(event) => {
              if (emote.provider !== "twitch") return
              const img = event.currentTarget
              const next = twitchStaticFallbackUrl(img.currentSrc || img.src)
              if (!next || img.src === next) return
              img.src = next
              img.srcset = ""
            }}
          />
        </span>
      </TooltipTrigger>
      <EmoteTooltipContent name={label} provider={emote.provider} />
    </Tooltip>
  )
}
