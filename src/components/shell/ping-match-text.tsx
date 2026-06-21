import * as React from "react"

import {
  findPingMatchRange,
} from "@/lib/highlights/highlight-rules"
import { PingMatchMark } from "@/lib/highlights/ping-match-mark"

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
      <PingMatchMark>{match}</PingMatchMark>
      {after}
    </span>
  )
}