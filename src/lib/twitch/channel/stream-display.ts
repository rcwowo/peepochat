const viewerCountFormatter = new Intl.NumberFormat()
const compactViewerCountFormatter = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
})

export function formatViewerCount(count: number): string {
  return viewerCountFormatter.format(count)
}

export function formatCompactViewerCount(count: number): string {
  return compactViewerCountFormatter.format(count)
}

export function formatStreamHeadline({
  title,
  gameName,
  showTitle,
  showCategory,
  live,
}: {
  title: string
  gameName: string
  showTitle: boolean
  showCategory: boolean
  live: boolean
}): string {
  const parts: string[] = []
  const trimmedTitle = title.trim()
  const trimmedGame = gameName.trim()

  if (showCategory && trimmedGame) {
    parts.push(trimmedGame)
  }
  if (showTitle && trimmedTitle) {
    parts.push(trimmedTitle)
  }
  if (parts.length > 0) {
    return parts.join(" — ")
  }
  if (!live) {
    return "Offline"
  }
  if (showTitle) {
    return "Untitled stream"
  }
  return ""
}

export function formatStreamUptime(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) {
    return `${days}d ${hours}h`
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  if (minutes > 0) {
    return `${minutes}m`
  }
  return `${seconds}s`
}
