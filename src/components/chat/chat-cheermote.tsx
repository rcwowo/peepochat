import { CHAT_BASE_EMOTE_SIZE_PX } from "@/lib/chat/chat-presentation-style"

function cheermoteStaticFallbackUrl(url: string) {
  if (!url.includes("/animated/")) {
    return null
  }
  return url.replace("/animated/", "/static/").replace(/\.gif$/i, ".png")
}

export function ChatCheermote({
  imageUrl,
  amount,
  color,
  label,
}: {
  imageUrl: string
  amount: number
  color: string
  label: string
}) {
  return (
    <span className="chat-cheermote">
      <span className="chat-emote">
        <img
          src={imageUrl}
          alt={label}
          width={CHAT_BASE_EMOTE_SIZE_PX}
          height={CHAT_BASE_EMOTE_SIZE_PX}
          loading="eager"
          decoding="async"
          onError={(event) => {
            const img = event.currentTarget
            const next = cheermoteStaticFallbackUrl(img.currentSrc || img.src)
            if (!next || img.src === next) return
            img.src = next
          }}
        />
      </span>
      <span className="chat-cheermote-amount" style={{ color }}>
        {amount}
      </span>
    </span>
  )
}
