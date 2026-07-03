import { isTimelineAppend } from "@/lib/chat/timeline-prefix"

type TimelineEntryWithId = { message: { id: string } }

export function pruneRowStripes<T extends TimelineEntryWithId>(
  rowStripes: Map<string, boolean>,
  timeline: T[]
) {
  const visibleIdSet = new Set(timeline.map((entry) => entry.message.id))

  for (const id of rowStripes.keys()) {
    if (!visibleIdSet.has(id)) {
      rowStripes.delete(id)
    }
  }
}

function appendRowStripes<T extends TimelineEntryWithId>(
  rowStripes: Map<string, boolean>,
  timeline: T[],
  startIndex: number
) {
  for (let index = startIndex; index < timeline.length; index += 1) {
    const id = timeline[index].message.id
    if (rowStripes.has(id)) {
      continue
    }

    const previousStripe =
      index > 0
        ? (rowStripes.get(timeline[index - 1].message.id) ?? false)
        : false
    rowStripes.set(id, !previousStripe)
  }
}

export function reconcileStableRowStripes<T extends TimelineEntryWithId>(
  rowStripes: Map<string, boolean>,
  timeline: T[]
) {
  const visibleIds = timeline.map((entry) => entry.message.id)
  const visibleIdSet = new Set(visibleIds)

  for (const id of rowStripes.keys()) {
    if (!visibleIdSet.has(id)) {
      rowStripes.delete(id)
    }
  }

  const firstKnownIndex = visibleIds.findIndex((id) => rowStripes.has(id))

  if (firstKnownIndex === -1) {
    visibleIds.forEach((id, index) => {
      rowStripes.set(id, index % 2 === 1)
    })
    return rowStripes
  }

  for (let index = firstKnownIndex - 1; index >= 0; index -= 1) {
    const nextStripe = rowStripes.get(visibleIds[index + 1]) ?? false
    rowStripes.set(visibleIds[index], !nextStripe)
  }

  for (let index = firstKnownIndex + 1; index < visibleIds.length; index += 1) {
    const id = visibleIds[index]
    if (!rowStripes.has(id)) {
      const previousStripe = rowStripes.get(visibleIds[index - 1]) ?? false
      rowStripes.set(id, !previousStripe)
    }
  }

  return rowStripes
}

export type RowStripeCache<T extends TimelineEntryWithId> = {
  timeline: T[] | null
}

export function updateStableRowStripes<T extends TimelineEntryWithId>(
  cache: RowStripeCache<T>,
  rowStripes: Map<string, boolean>,
  timeline: T[]
) {
  const previousTimeline = cache.timeline

  if (previousTimeline && isTimelineAppend(previousTimeline, timeline)) {
    pruneRowStripes(rowStripes, timeline)
    appendRowStripes(rowStripes, timeline, previousTimeline.length)
    cache.timeline = timeline
    return rowStripes
  }

  cache.timeline = timeline
  return reconcileStableRowStripes(rowStripes, timeline)
}
