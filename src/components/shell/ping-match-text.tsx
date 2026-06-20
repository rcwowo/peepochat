import * as React from "react"

import {
  findPingMatchRange,
} from "@/lib/highlights/highlight-rules"

export function PingMatchText({
  text,
  ruleId,
  matchPattern,
}: {
  text: string
  ruleId: string
  matchPattern: string
}) {
  const range = React.useMemo(
    () => findPingMatchRange(text, ruleId, matchPattern),
    [matchPattern, ruleId, text]
  )

  if (!range) {
    return <span className="break-words">{text}</span>
  }

  const before = text.slice(0, range.start)
  const match = text.slice(range.start, range.end)
  const after = text.slice(range.end)

  return (
    <span className="break-words">
      {before}
      <mark className="rounded-sm bg-primary/25 px-0.5 font-medium text-foreground not-italic">
        {match}
      </mark>
      {after}
    </span>
  )
}