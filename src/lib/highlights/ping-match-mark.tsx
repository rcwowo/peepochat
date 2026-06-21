import * as React from "react"

export const pingMatchMarkClassName =
  "rounded-sm bg-primary/25 px-0.5 font-medium text-foreground not-italic"

export function PingMatchMark({ children }: { children: React.ReactNode }) {
  return <mark className={pingMatchMarkClassName}>{children}</mark>
}
