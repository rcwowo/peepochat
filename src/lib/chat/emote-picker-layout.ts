/** Aspect-ratio buckets aligned with SevenTV Extension `determineRatio`. */
export type EmoteRatioBucket = 1 | 2 | 3 | 4

export function determineEmoteRatioBucket(
  width: number,
  height: number
): EmoteRatioBucket {
  if (!width || !height) return 1

  const ratio = width / height
  if (ratio <= 1) return 1
  if (ratio <= 1.5625) return 2
  if (ratio <= 2.125) return 3
  return 4
}

export function comparePickerEmotes<T extends { code: string }>(
  left: T,
  right: T,
  bucketFor: (emote: T) => EmoteRatioBucket
): number {
  const leftBucket = bucketFor(left)
  const rightBucket = bucketFor(right)
  if (leftBucket !== rightBucket) return leftBucket - rightBucket
  return left.code.localeCompare(right.code)
}

/** Square emotes first, then wider; ties broken by emote code. */
export function sortPickerEmotes<T extends { code: string }>(
  emotes: T[],
  bucketFor?: (emote: T) => EmoteRatioBucket
): T[] {
  const resolveBucket = bucketFor ?? (() => 1 as EmoteRatioBucket)
  return [...emotes].sort((left, right) =>
    comparePickerEmotes(left, right, resolveBucket)
  )
}

export function emotePickerEmoteKey(emote: {
  id: string
  provider: string
}): string {
  return `${emote.provider}-${emote.id}`
}

/** Fixed height with width scaled by ratio bucket (SevenTV emote-menu cell sizing). */
export function emotePickerCellWidthClass(bucket: EmoteRatioBucket): string {
  switch (bucket) {
    case 1:
      return "w-9"
    case 2:
      return "w-[calc(2.25rem*1.5+0.25rem)]"
    case 3:
      return "w-[calc(2.25rem*2+0.5rem)]"
    case 4:
      return "w-[calc(2.25rem*3+1rem)]"
  }
}

/** Max image height inside the card preview (container is h-20 with p-2). */
export const EMOTE_CARD_PREVIEW_IMAGE_CLASS = "max-h-16 max-w-full object-contain"

/** Card preview: fixed height, width scales by aspect ratio (same buckets as picker). */
export function emoteCardPreviewSizeClass(bucket: EmoteRatioBucket): string {
  switch (bucket) {
    case 1:
      return "h-20 w-20"
    case 2:
      return "h-20 w-[calc(5rem*1.5+0.25rem)]"
    case 3:
      return "h-20 w-[calc(5rem*2+0.5rem)]"
    case 4:
      return "h-20 w-[calc(5rem*3+1rem)]"
  }
}

/** Minimum card width: preview column + content column + padding. */
export function emoteCardMinWidthClass(bucket: EmoteRatioBucket): string {
  switch (bucket) {
    case 1:
      return "min-w-[13.5rem]"
    case 2:
      return "min-w-[15rem]"
    case 3:
      return "min-w-[17rem]"
    case 4:
      return "min-w-[20rem]"
  }
}

/** Widest card bucket — used when clamping anchor position to the viewport. */
export const EMOTE_CARD_ANCHOR_BUCKET: EmoteRatioBucket = 4

export function emoteCardWidthPx(bucket: EmoteRatioBucket): number {
  switch (bucket) {
    case 1:
      return 216
    case 2:
      return 240
    case 3:
      return 272
    case 4:
      return 320
  }
}
