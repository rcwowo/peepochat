import * as React from "react"

import { ChatPane } from "@/components/chat/chat-pane"
import { usePeeepochat } from "@/lib/peepochat-context"

export function ChatPage() {
  const {
    config,
    channels,
    activeChannelLogin,
    isSplitView,
    splitChannels,
    visibleChannelLogins,
    getTimeline,
    getRoom,
    getBadgeCatalog,
    hasBadgeSupport,
    removeSplitChannel,
  } = usePeeepochat()

  const timestampFormat = config.chat.messageTimestampFormat

  const channelMeta = React.useMemo(() => {
    return new Map(channels.map((channel) => [channel.login, channel]))
  }, [channels])

  if (visibleChannelLogins.length === 0) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        Add a channel from the sidebar to start chatting.
      </div>
    )
  }

  if (isSplitView) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-1 divide-x divide-border">
        {splitChannels.map((login) => {
          const meta = channelMeta.get(login)
          const room = getRoom(login)

          return (
            <ChatPane
              key={login}
              channelLogin={login}
              displayName={meta?.displayName}
              profileImageUrl={meta?.profileImageUrl}
              timeline={getTimeline(login)}
              timestampFormat={timestampFormat}
              badgeCatalog={getBadgeCatalog(login)}
              showBadgeFallback={!hasBadgeSupport}
              joined={room?.joined ?? false}
              showRemoveSplit
              onRemoveSplit={removeSplitChannel}
            />
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <ChatPane
        key={activeChannelLogin}
        channelLogin={activeChannelLogin}
        displayName={channelMeta.get(activeChannelLogin)?.displayName}
        profileImageUrl={channelMeta.get(activeChannelLogin)?.profileImageUrl}
        timeline={getTimeline(activeChannelLogin)}
        timestampFormat={timestampFormat}
        badgeCatalog={getBadgeCatalog(activeChannelLogin)}
        showBadgeFallback={!hasBadgeSupport}
        joined={getRoom(activeChannelLogin)?.joined ?? false}
      />
    </div>
  )
}
