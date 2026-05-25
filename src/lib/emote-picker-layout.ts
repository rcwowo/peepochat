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
