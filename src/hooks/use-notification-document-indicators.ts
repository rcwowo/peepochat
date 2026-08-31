import * as React from "react"

import { APP_BRANDING } from "@/lib/branding"
import { useNotificationUnreadCount } from "@/lib/highlights/notification-center"

function getFaviconLink() {
  return document.querySelector<HTMLLinkElement>('link[rel="icon"]')
}

export function useNotificationDocumentIndicators() {
  const totalCount = useNotificationUnreadCount()

  React.useEffect(() => {
    document.title =
      totalCount > 0
        ? `${APP_BRANDING.title} (${totalCount})`
        : APP_BRANDING.title

    const faviconLink = getFaviconLink()
    if (faviconLink) {
      faviconLink.href =
        totalCount > 0 ? APP_BRANDING.pingFavicon : APP_BRANDING.favicon
    }
  }, [totalCount])

  React.useEffect(() => {
    return () => {
      document.title = APP_BRANDING.title
      const link = getFaviconLink()
      if (link) {
        link.href = APP_BRANDING.favicon
      }
    }
  }, [])
}
