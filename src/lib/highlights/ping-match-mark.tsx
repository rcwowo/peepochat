import * as React from "react"

import type { PingMatchRange } from "@/lib/highlights/highlight-rules"

export const pingMatchMarkClassName =
  "rounded-sm bg-primary/25 font-medium text-foreground not-italic"

export function PingMatchMark({ children }: { children: React.ReactNode }) {
  return <mark className={pingMatchMarkClassName}>{children}</mark>
}

export function HighlightedText({
  text,
  ranges,
}: {
  text: string
  ranges?: PingMatchRange[] | null
}) {
  if (!ranges || ranges.length === 0) {
    return text
  }

  const parts: React.ReactNode[] = []
  let cursor = 0

  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index]!
    const start = Math.max(0, Math.min(range.start, text.length))
    const end = Math.max(start, Math.min(range.end, text.length))
    if (start > cursor) {
      parts.push(
        <React.Fragment key={`pre-${index}`}>
          {text.slice(cursor, start)}
        </React.Fragment>
      )
    }
    if (end > start) {
      parts.push(
        <PingMatchMark key={`match-${index}`}>
          {text.slice(start, end)}
        </PingMatchMark>
      )
    }
    cursor = Math.max(cursor, end)
  }

  if (cursor < text.length) {
    parts.push(<React.Fragment key="post">{text.slice(cursor)}</React.Fragment>)
  }

  return parts
}
