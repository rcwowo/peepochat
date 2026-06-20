import * as React from "react"

import { useNotificationCenter } from "@/lib/highlights/notification-center"

const APP_TITLE = "Peepochat"
const DEFAULT_FAVICON = "/icon.svg"
const PING_FAVICON = "/icon-ping.svg"

function getFaviconLink() {
  return document.querySelector<HTMLLinkElement>('link[rel="icon"]')
}

export function useNotificationDocumentIndicators() {
  const { totalCount } = useNotificationCenter()

  React.useEffect(() => {
    document.title =
      totalCount > 0 ? `${APP_TITLE} (${totalCount})` : APP_TITLE

    const faviconLink = getFaviconLink()
    if (faviconLink) {
      faviconLink.href = totalCount > 0 ? PING_FAVICON : DEFAULT_FAVICON
    }
  }, [totalCount])

  React.useEffect(() => {
    return () => {
      document.title = APP_TITLE
      const link = getFaviconLink()
      if (link) {
        link.href = DEFAULT_FAVICON
      }
    }
  }, [])
}
