import * as React from "react"

import type { ChatBadgeCatalog } from "@/lib/chat/chat-badges"
import { usePeepochatChat } from "@/lib/peepochat/peepochat-context"

export function useBadgeCatalog(roomId: string | null): ChatBadgeCatalog {
  const { subscribeToBadgeCatalogs, getBadgeCatalogByRoomId } =
    usePeepochatChat()

  const getSnapshot = React.useCallback(
    () => getBadgeCatalogByRoomId(roomId),
    [getBadgeCatalogByRoomId, roomId]
  )

  return React.useSyncExternalStore(
    subscribeToBadgeCatalogs,
    getSnapshot,
    getSnapshot
  )
}
