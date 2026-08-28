import * as React from "react"

import { useLazyRef } from "@/hooks/use-lazy-ref"
import {
  createEmptyBadgeCatalog,
  loadChannelBadgeCatalog,
  loadGlobalBadgeCatalog,
  mergeBadgeCatalogs,
  type ChatBadgeCatalog,
} from "@/lib/chat/chat-badges"
import type { TwitchAccount } from "@/lib/peepochat/peepochat-config"

const EMPTY_BADGE_CATALOG = createEmptyBadgeCatalog()

export function useChatBadges(account: TwitchAccount | null) {
  const globalCatalogRef = React.useRef<ChatBadgeCatalog>(EMPTY_BADGE_CATALOG)
  const channelCatalogsRef = useLazyRef(
    () => ({}) as Record<string, ChatBadgeCatalog>
  )
  const listenersRef = useLazyRef(() => new Set<() => void>())
  const globalLoadingRef = React.useRef(false)
  const channelLoadingRef = useLazyRef(() => new Set<string>())
  const loadedRoomIdsRef = useLazyRef(() => new Set<string>())
  const accountRef = React.useRef(account)

  React.useLayoutEffect(() => {
    accountRef.current = account
  }, [account])

  const notifyBadgeCatalogs = React.useCallback(() => {
    for (const listener of listenersRef.current) {
      listener()
    }
  }, [listenersRef])

  React.useEffect(() => {
    if (!account || globalLoadingRef.current) {
      return
    }

    globalLoadingRef.current = true

    void loadGlobalBadgeCatalog(account.accessToken, account.clientId)
      .then((nextCatalog) => {
        globalCatalogRef.current = nextCatalog
        notifyBadgeCatalogs()
      })
      .catch(() => {
        globalCatalogRef.current = EMPTY_BADGE_CATALOG
        notifyBadgeCatalogs()
      })
      .finally(() => {
        globalLoadingRef.current = false
      })
  }, [account, notifyBadgeCatalogs])

  const loadBadgesForRoom = React.useCallback(
    (roomId: string | null) => {
      const currentAccount = accountRef.current
      if (!roomId || !currentAccount) {
        return
      }

      if (
        loadedRoomIdsRef.current.has(roomId) ||
        channelLoadingRef.current.has(roomId)
      ) {
        return
      }

      channelLoadingRef.current.add(roomId)

      void loadChannelBadgeCatalog(
        roomId,
        currentAccount.accessToken,
        currentAccount.clientId
      )
        .then((nextCatalog) => {
          loadedRoomIdsRef.current.add(roomId)
          channelCatalogsRef.current[roomId] = nextCatalog
          notifyBadgeCatalogs()
        })
        .catch(() => {
          loadedRoomIdsRef.current.add(roomId)
          channelCatalogsRef.current[roomId] = EMPTY_BADGE_CATALOG
          notifyBadgeCatalogs()
        })
        .finally(() => {
          channelLoadingRef.current.delete(roomId)
        })
    },
    [
      channelCatalogsRef,
      channelLoadingRef,
      loadedRoomIdsRef,
      notifyBadgeCatalogs,
    ]
  )

  type MergedEntry = {
    global: ChatBadgeCatalog
    channel: ChatBadgeCatalog
    merged: ChatBadgeCatalog
  }
  const mergedCatalogsRef = useLazyRef(() => new Map<string, MergedEntry>())

  const getBadgeCatalog = React.useCallback(
    (roomId: string | null): ChatBadgeCatalog => {
      if (!accountRef.current) {
        return EMPTY_BADGE_CATALOG
      }

      const globalCatalog = globalCatalogRef.current
      if (!roomId) {
        return globalCatalog
      }

      const channelCatalog = channelCatalogsRef.current[roomId]
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
      cache.set(roomId, {
        global: globalCatalog,
        channel: channelCatalog,
        merged,
      })
      return merged
    },
    [channelCatalogsRef, mergedCatalogsRef]
  )

  const subscribeToBadgeCatalogs = React.useCallback(
    (onStoreChange: () => void) => {
      listenersRef.current.add(onStoreChange)
      return () => {
        listenersRef.current.delete(onStoreChange)
      }
    },
    [listenersRef]
  )

  return {
    getBadgeCatalog,
    loadBadgesForRoom,
    subscribeToBadgeCatalogs,
    hasBadgeSupport: Boolean(account),
  }
}
