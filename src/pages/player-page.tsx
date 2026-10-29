import * as React from "react"

import { MultiWatchView } from "@/components/player/multi-watch-view"
import { PlayerDetails } from "@/components/player/player-details"
import { PlayerResizeLayout } from "@/components/player/resize-layout"
import { TwitchPlayerFrame } from "@/components/player/twitch-player-frame"
import { useWatchedChannel } from "@/hooks/player/use-watched-channel"
import {
  usePeepochatPlayer,
  usePeepochatSettings,
} from "@/lib/peepochat/peepochat-context"
import type { WatchInstance } from "@/lib/player/watch-state"
import { ChatPage } from "@/pages/chat-page"
import { cn } from "@/lib/utils"

export function PlayerPage() {
  const { playerMode, watchedInstances, playerViewActive } =
    usePeepochatPlayer()

  if (watchedInstances.length === 0) {
    return null
  }

  if (playerMode === "sidebar") {
    return <SidebarWatchView active={playerViewActive} />
  }

  return <MultiWatchView active={playerViewActive} />
}

function SidebarWatchView({ active }: { active: boolean }) {
  const { watchedInstances, focusedPlayerLogin } = usePeepochatPlayer()

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      {watchedInstances.map((instance) => {
        const focused = instance.login === focusedPlayerLogin
        return (
          <div
            key={instance.login}
            className={cn(
              "absolute inset-0 flex min-h-0 min-w-0",
              focused ? "z-10" : "pointer-events-none z-0 opacity-0"
            )}
            aria-hidden={!focused}
            inert={!focused}
          >
            <SidebarWatchInstance
              instance={instance}
              focused={focused}
              active={active && focused}
            />
          </div>
        )
      })}
    </div>
  )
}

const SidebarWatchInstance = React.memo(function SidebarWatchInstance({
  instance,
  focused,
  active,
}: {
  instance: WatchInstance
  focused: boolean
  active: boolean
}) {
  const { config, updateConfig } = usePeepochatSettings()
  const { closePlayer, reportPlayerMuted } = usePeepochatPlayer()
  const login = instance.login
  const channel = useWatchedChannel(login)
  const iframeMounted = active || config.player.backgroundPlaybackEnabled
  const hideStreamInfo = config.player.hideStreamInfoEnabled
  const handleClose = React.useCallback(
    () => closePlayer(login),
    [closePlayer, login]
  )
  const handleMutedChange = React.useCallback(
    (muted: boolean) => reportPlayerMuted(login, muted),
    [login, reportPlayerMuted]
  )

  const player = (
    <div className="h-full min-h-0 w-full overflow-y-auto overscroll-contain bg-background">
      <div
        className={cn(
          "w-full shrink-0 overflow-hidden bg-black",
          hideStreamInfo
            ? "aspect-video md:aspect-auto md:h-full"
            : "aspect-video"
        )}
      >
        {iframeMounted ? (
          <TwitchPlayerFrame
            login={login}
            title={`${channel.displayName} Twitch stream`}
            initialMuted={!focused}
            muted={!focused}
            onMutedChange={handleMutedChange}
          />
        ) : null}
      </div>
      {hideStreamInfo ? null : (
        <PlayerDetails
          channelLogin={login}
          displayName={channel.displayName}
          profileImageUrl={channel.profileImageUrl}
          description={channel.user?.description ?? ""}
          title={channel.title}
          gameName={channel.gameName}
          viewerCount={channel.stream?.viewerCount ?? null}
          startedAt={channel.stream?.startedAt}
          loading={channel.loading}
          error={channel.error}
        />
      )}
    </div>
  )

  const chat = (
    <ChatPage
      active={active}
      channelOverride={login}
      onClosePlayer={handleClose}
      streamInfoMode="mobile"
      liveStreamOverride={channel.stream}
      displayNameOverride={channel.displayName}
      profileImageUrlOverride={channel.profileImageUrl}
    />
  )

  return (
    <PlayerResizeLayout
      player={player}
      chat={chat}
      desktopSizePercent={config.player.desktopSizePercent}
      onDesktopSizeChange={(desktopSizePercent) =>
        updateConfig((current) => ({
          ...current,
          player: { ...current.player, desktopSizePercent },
        }))
      }
    />
  )
})
