import * as React from "react"

import type { ChatSourceChannelBadge } from "@/components/chat/chat-badge"
import {
  resolveMessageBadges,
  type ChatBadgeCatalog,
} from "@/lib/chat/chat-badges"
import {
  getSharedChatSourceProfile,
  subscribeToSharedChatSourceProfiles,
} from "@/lib/chat/shared-chat-profiles"
import { usePeepochatChat } from "@/lib/peepochat/peepochat-context"
import type { TwitchBadge } from "@/lib/twitch/twitch-chat"

const NOOP_SUBSCRIBE = () => () => {}

export function useSharedChatMessageChrome({
  sourceRoomId,
  badges,
  badgeCatalog,
  showTwitchBadges,
}: {
  sourceRoomId: string | null
  badges: TwitchBadge[]
  badgeCatalog: ChatBadgeCatalog
  showTwitchBadges: boolean
}) {
  const {
    loadBadgesForRoom,
    ensureSharedChatSourceProfiles,
    subscribeToBadgeCatalogs,
    getBadgeCatalogByRoomId,
  } = usePeepochatChat()

  React.useEffect(() => {
    if (!sourceRoomId || !showTwitchBadges) {
      return
    }
    loadBadgesForRoom(sourceRoomId)
    ensureSharedChatSourceProfiles([sourceRoomId])
  }, [
    ensureSharedChatSourceProfiles,
    loadBadgesForRoom,
    showTwitchBadges,
    sourceRoomId,
  ])

  const subscribeToSourceProfiles = sourceRoomId
    ? subscribeToSharedChatSourceProfiles
    : NOOP_SUBSCRIBE
  const getSourceProfileSnapshot = React.useCallback(
    () => getSharedChatSourceProfile(sourceRoomId),
    [sourceRoomId]
  )
  const sourceProfile = React.useSyncExternalStore(
    subscribeToSourceProfiles,
    getSourceProfileSnapshot,
    getSourceProfileSnapshot
  )

  const subscribeToSourceBadges = sourceRoomId
    ? subscribeToBadgeCatalogs
    : NOOP_SUBSCRIBE
  const getSourceCatalogSnapshot = React.useCallback(
    () => (sourceRoomId ? getBadgeCatalogByRoomId(sourceRoomId) : badgeCatalog),
    [badgeCatalog, getBadgeCatalogByRoomId, sourceRoomId]
  )
  const sourceCatalog = React.useSyncExternalStore(
    subscribeToSourceBadges,
    getSourceCatalogSnapshot,
    getSourceCatalogSnapshot
  )
  const resolvedCatalog = sourceRoomId ? sourceCatalog : badgeCatalog

  return {
    resolvedBadges: showTwitchBadges
      ? resolveMessageBadges(badges, resolvedCatalog)
      : [],
    sourceChannel:
      showTwitchBadges && sourceRoomId
        ? ({
            displayName:
              sourceProfile?.displayName ||
              sourceProfile?.login ||
              "Shared chat",
            login: sourceProfile?.login || "",
            profileImageUrl: sourceProfile?.profileImageUrl || "",
          } satisfies ChatSourceChannelBadge)
        : null,
  }
}
