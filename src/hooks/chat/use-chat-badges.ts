import * as React from "react"

import {
  createEmptyBadgeCatalog,
  loadChannelBadgeCatalog,
  loadGlobalBadgeCatalog,
  mergeBadgeCatalogs,
  type ChatBadgeCatalog,
} from "@/lib/chat/chat-badges"
import type { TwitchAccount } from "@/lib/peepochat/peepochat-config"

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

  type MergedEntry = {
    global: ChatBadgeCatalog
    channel: ChatBadgeCatalog
    merged: ChatBadgeCatalog
  }
  const mergedCatalogsRef = React.useRef(new Map<string, MergedEntry>())

  const getBadgeCatalog = React.useCallback(
    (roomId: string | null): ChatBadgeCatalog => {
      if (!account) {
        return createEmptyBadgeCatalog()
      }

      if (!roomId) {
        return globalCatalog
      }

      const channelCatalog = channelCatalogs[roomId]
      if (!channelCatalog) {
        return globalCatalog
      }

      const cache = mergedCatalogsRef.current
      const cached = cache.get(roomId)
      if (
        cached &&
        cached.global === globalCatalog &&
        cached.channel === channelCatalog
      ) {
        return cached.merged
      }

      const merged = mergeBadgeCatalogs(globalCatalog, channelCatalog)
      cache.set(roomId, { global: globalCatalog, channel: channelCatalog, merged })
      return merged
    },
    [account, channelCatalogs, globalCatalog]
  )

  return {
    getBadgeCatalog,
    loadBadgesForRoom,
    hasBadgeSupport: Boolean(account),
  }
}
