import type { EmoteCatalogEntry } from "@/lib/chat/chat-emotes"

/** 7TV `EmoteFlags.ZERO_WIDTH` (`1 << 8`), used by the official extension. */
export const SEVENTV_EMOTE_FLAG_ZERO_WIDTH = 1 << 8

export function isSevenTvZeroWidthEmote(
  emote: Pick<EmoteCatalogEntry, "provider" | "seventvFlags">
): boolean {
  return (
    emote.provider === "7tv" &&
    ((emote.seventvFlags ?? 0) & SEVENTV_EMOTE_FLAG_ZERO_WIDTH) !== 0
  )
}
