import * as React from "react"

import { EmoteCardPopover } from "@/components/chat/emote-card-popover"
import { getTwitchEmoteBaseUrl, toEmoteCardTarget } from "@/lib/chat/emote-card"
import type { TwitchEmote } from "@/lib/twitch/twitch-chat"

function getEmoteSrcSet(emote: TwitchEmote) {
  if (emote.provider !== "twitch") {
    return undefined
  }

  const base = getTwitchEmoteBaseUrl(emote.imageUrl)
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
  const target = React.useMemo(
    () => toEmoteCardTarget({ ...emote, code: emote.code || label }),
    [emote, label]
  )

  return (
    <EmoteCardPopover target={target}>
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
    </EmoteCardPopover>
  )
}
