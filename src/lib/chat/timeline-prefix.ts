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
