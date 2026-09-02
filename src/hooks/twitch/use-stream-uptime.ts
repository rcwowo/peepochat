import * as React from "react"

import { formatStreamUptime } from "@/lib/twitch/stream-display"

export function useStreamUptime(startedAt: string | undefined) {
  const [now, setNow] = React.useState(() => Date.now())

  React.useEffect(() => {
    if (!startedAt) return

    const interval = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(interval)
    }
  }, [startedAt])

  if (!startedAt) return null

  const startedMs = new Date(startedAt).getTime()
  if (Number.isNaN(startedMs)) return null

  return formatStreamUptime(now - startedMs)
}
