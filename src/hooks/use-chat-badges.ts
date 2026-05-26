import * as React from "react"

import {
  createEmptyBadgeCatalog,
  loadChannelBadgeCatalog,
  loadGlobalBadgeCatalog,
  mergeBadgeCatalogs,
  type ChatBadgeCatalog,
} from "@/lib/chat-badges"
import type { TwitchAccount } from "@/lib/peepochat-config"

export function useChatBadges(account: TwitchAccount | null) {
  const [globalCatalog, setGlobalCatalog] = React.useState<ChatBadgeCatalog>(
    () => createEmptyBadgeCatalog()
  )
  const [channelCatalogs, setChannelCatalogs] = React.useState<
    Record<string, ChatBadgeCatalog>
  >({})
  const globalLoadingRef = React.useRef(false)
  const channelLoadingRef = React.useRef(new Set<string>())
  const loadedRoomIdsRef = React.useRef(new Set<string>())

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
      if (!roomId || !account) {
        return
      }

      if (
        loadedRoomIdsRef.current.has(roomId) ||
        channelLoadingRef.current.has(roomId)
      ) {
        return
      }

      channelLoadingRef.current.add(roomId)

      void loadChannelBadgeCatalog(roomId, account.accessToken, account.clientId)
        .then((nextCatalog) => {
          loadedRoomIdsRef.current.add(roomId)
          setChannelCatalogs((current) => ({
            ...current,
            [roomId]: nextCatalog,
          }))
        })
        .catch(() => {
          loadedRoomIdsRef.current.add(roomId)
          setChannelCatalogs((current) => ({
            ...current,
            [roomId]: createEmptyBadgeCatalog(),
          }))
        })
        .finally(() => {
          channelLoadingRef.current.delete(roomId)
        })
    },
    [account]
  )

  const getBadgeCatalog = React.useCallback(
    (roomId: string | null): ChatBadgeCatalog => {
      const channelCatalog = roomId ? channelCatalogs[roomId] : null
      return mergeBadgeCatalogs(
        globalCatalog,
        channelCatalog ?? createEmptyBadgeCatalog()
      )
    },
    [channelCatalogs, globalCatalog]
  )

  React.useEffect(() => {
    if (!account) {
      setGlobalCatalog(createEmptyBadgeCatalog())
      setChannelCatalogs({})
      channelLoadingRef.current.clear()
      loadedRoomIdsRef.current.clear()
    }
  }, [account])

  return {
    getBadgeCatalog,
    loadBadgesForRoom,
    hasBadgeSupport: Boolean(account),
  }
}
