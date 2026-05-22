import * as React from "react"

import {
  createEmptyBadgeCatalog,
  loadChannelBadgeCatalog,
  loadGlobalBadgeCatalog,
  mergeBadgeCatalogs,
  type ChatBadgeCatalog,
} from "@/lib/chat-badges"
import type { TwitchAccount } from "@/lib/chatvoice-config"

export function useChatBadges(account: TwitchAccount | null) {
  const [globalCatalog, setGlobalCatalog] = React.useState<ChatBadgeCatalog>(
    () => createEmptyBadgeCatalog()
  )
  const [channelCatalog, setChannelCatalog] = React.useState<ChatBadgeCatalog>(
    () => createEmptyBadgeCatalog()
  )
  const [activeRoomId, setActiveRoomId] = React.useState<string | null>(null)
  const globalLoadingRef = React.useRef(false)
  const channelLoadingRef = React.useRef<string | null>(null)

  const catalog = React.useMemo(
    () => mergeBadgeCatalogs(globalCatalog, channelCatalog),
    [channelCatalog, globalCatalog]
  )

  React.useEffect(() => {
    if (!account || globalLoadingRef.current) {
      return
    }

    globalLoadingRef.current = true

    void loadGlobalBadgeCatalog(account.accessToken, account.clientId)
      .then((nextCatalog) => {
        setGlobalCatalog(nextCatalog)
      })
      .catch(() => {
        setGlobalCatalog(createEmptyBadgeCatalog())
      })
      .finally(() => {
        globalLoadingRef.current = false
      })
  }, [account])

  const loadBadgesForRoom = React.useCallback(
    (roomId: string | null) => {
      setActiveRoomId(roomId)

      if (!roomId || !account) {
        setChannelCatalog(createEmptyBadgeCatalog())
        return
      }

      if (channelLoadingRef.current === roomId) {
        return
      }

      channelLoadingRef.current = roomId

      void loadChannelBadgeCatalog(roomId, account.accessToken, account.clientId)
        .then((nextCatalog) => {
          if (channelLoadingRef.current !== roomId) {
            return
          }

          setChannelCatalog(nextCatalog)
        })
        .catch(() => {
          if (channelLoadingRef.current !== roomId) {
            return
          }

          setChannelCatalog(createEmptyBadgeCatalog())
        })
        .finally(() => {
          if (channelLoadingRef.current === roomId) {
            channelLoadingRef.current = null
          }
        })
    },
    [account]
  )

  React.useEffect(() => {
    if (!account) {
      setGlobalCatalog(createEmptyBadgeCatalog())
      setChannelCatalog(createEmptyBadgeCatalog())
      setActiveRoomId(null)
    }
  }, [account])

  return {
    catalog,
    activeRoomId,
    loadBadgesForRoom,
    hasBadgeSupport: Boolean(account),
  }
}
