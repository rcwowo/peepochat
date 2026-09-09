type TimelineEntryWithId = { message: { id: string } }

/** True when `timeline` begins with the same message ids as `prefix`. */
export function isTimelinePrefix<T extends TimelineEntryWithId>(
  prefix: T[],
  timeline: T[]
): boolean {
  if (timeline.length < prefix.length) {
    return false
  }

  for (let index = 0; index < prefix.length; index += 1) {
    if (prefix[index].message.id !== timeline[index].message.id) {
      return false
    }
  }

  return true
}

/** True when `timeline` is `prefix` with one or more entries appended. */
export function isTimelineAppend<T extends TimelineEntryWithId>(
  prefix: T[],
  timeline: T[]
): boolean {
  return timeline.length > prefix.length && isTimelinePrefix(prefix, timeline)
}

export type TimelineWindowShift = {
  dropped: number
  addedFrom: number
}

/**
 * Describes a front-trim plus tail-append, the usual live-chat update once
 * the room is at its message cap. Null when the id sequences don't overlap.
 */
export function getTimelineWindowShift<T extends TimelineEntryWithId>(
  previous: T[],
  next: T[]
): TimelineWindowShift | null {
  if (previous.length === 0) {
    return { dropped: 0, addedFrom: 0 }
  }

  if (next.length >= previous.length && isTimelinePrefix(previous, next)) {
    return { dropped: 0, addedFrom: previous.length }
  }

  const nextHead = next[0]?.message.id
  if (!nextHead) {
    return null
  }

  let dropped = -1
  for (let index = 1; index < previous.length; index += 1) {
    if (previous[index].message.id === nextHead) {
      dropped = index
      break
    }
  }

  if (dropped < 0) {
    return null
  }

  const overlap = previous.length - dropped
  if (overlap > next.length) {
    return null
  }

  for (let index = 0; index < overlap; index += 1) {
    if (previous[dropped + index].message.id !== next[index].message.id) {
      return null
    }
  }

  return { dropped, addedFrom: overlap }
}
