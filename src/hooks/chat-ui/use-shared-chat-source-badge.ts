import * as React from "react"

import type { ChatSourceChannelBadge } from "@/components/chat/chat-badge"
import {
  resolveMessageBadges,
  type ChatBadgeCatalog,
} from "@/lib/chat/chat-badges"
import { usePeepochatChat } from "@/lib/peepochat/peepochat-context"
import type { TwitchBadge } from "@/lib/twitch/twitch-chat"

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
    getBadgeCatalogByRoomId,
    loadBadgesForRoom,
    getSharedChatSourceProfile,
    ensureSharedChatSourceProfiles,
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

  const sourceProfile = getSharedChatSourceProfile(sourceRoomId)
  const resolvedCatalog = sourceRoomId
    ? getBadgeCatalogByRoomId(sourceRoomId)
    : badgeCatalog

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
