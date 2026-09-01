import * as React from "react"
import { ClockIcon, EyeIcon } from "lucide-react"

import { useStreamUptime } from "@/hooks/twitch/use-stream-uptime"
import { PlayerResizeLayout } from "@/components/player/player-resize-layout"
import { usePlayerChannelData } from "@/hooks/twitch/use-player-channel-data"
import {
  usePeepochatPlayer,
  usePeepochatSettings,
} from "@/lib/peepochat/peepochat-context"
import { formatViewerCount } from "@/lib/twitch/stream-display"
import { buildTwitchPlayerUrl } from "@/lib/twitch/twitch-player"
import { ChatPage } from "@/pages/chat-page"

function PlayerDetails({
  channelLogin,
  displayName,
  profileImageUrl,
  description,
  title,
  gameName,
  viewerCount,
  startedAt,
  loading,
  error,
}: {
  channelLogin: string
  displayName: string
  profileImageUrl?: string
  description: string
  title: string
  gameName: string
  viewerCount: number | null
  startedAt?: string
  loading: boolean
  error: boolean
}) {
  const uptime = useStreamUptime(startedAt)

  return (
    <div className="hidden min-h-0 flex-col gap-4 p-5 md:flex">
      <div className="flex min-w-0 items-start justify-between gap-5">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">
            {title || (loading ? "Loading stream…" : `${displayName}'s stream`)}
          </h1>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {gameName || (viewerCount === null ? "Offline" : "Uncategorized")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs tabular-nums">
          {viewerCount !== null ? (
            <span className="flex items-center gap-1 text-red-500">
              <EyeIcon className="size-3.5" aria-hidden />
              {formatViewerCount(viewerCount)}
            </span>
          ) : null}
          {uptime ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              <ClockIcon className="size-3.5" aria-hidden />
              {uptime}
            </span>
          ) : null}
        </div>
      </div>

      <section className="flex min-w-0 items-start gap-3 rounded-xl bg-sidebar p-4">
        {profileImageUrl ? (
          <img
            src={profileImageUrl}
            alt=""
            className="size-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary uppercase">
            {channelLogin.slice(0, 2)}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">About {displayName}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {description ||
              (error
                ? "Channel details could not be loaded."
                : "This channel has not added a description.")}
          </p>
        </div>
      </section>
    </div>
  )
}

export function PlayerPage() {
  const { config, updateConfig, account, channels } = usePeepochatSettings()
  const { playerChannelLogin, playerViewActive, closePlayer } =
    usePeepochatPlayer()

  if (!playerChannelLogin) {
    return null
  }

  return (
    <PlayerPageContent
      key={playerChannelLogin}
      channelLogin={playerChannelLogin}
      active={playerViewActive}
      closePlayer={closePlayer}
      config={config}
      updateConfig={updateConfig}
      account={account}
      savedChannel={channels.find(
        (channel) => channel.login === playerChannelLogin
      )}
    />
  )
}

function PlayerPageContent({
  channelLogin,
  active,
  closePlayer,
  config,
  updateConfig,
  account,
  savedChannel,
}: {
  channelLogin: string
  active: boolean
  closePlayer: () => void
  config: ReturnType<typeof usePeepochatSettings>["config"]
  updateConfig: ReturnType<typeof usePeepochatSettings>["updateConfig"]
  account: ReturnType<typeof usePeepochatSettings>["account"]
  savedChannel:
    ReturnType<typeof usePeepochatSettings>["channels"][number] | undefined
}) {
  const { user, channel, stream, loading, error } = usePlayerChannelData(
    channelLogin,
    account
  )
  const iframeMounted = active || config.player.backgroundPlaybackEnabled
  const playerUrl = React.useMemo(
    () => buildTwitchPlayerUrl(channelLogin),
    [channelLogin]
  )
  const displayName =
    user?.displayName || savedChannel?.displayName || channelLogin
  const profileImageUrl = user?.profileImageUrl || savedChannel?.profileImageUrl
  const title = stream?.title || channel?.title || ""
  const gameName = stream?.gameName || channel?.gameName || ""

  const player = (
    <div className="flex min-h-0 w-full min-w-0 flex-col overflow-y-auto bg-background md:h-full">
      <div className="aspect-video w-full shrink-0 overflow-hidden bg-black">
        {iframeMounted && playerUrl ? (
          <iframe
            src={playerUrl}
            title={`${displayName} Twitch stream`}
            allow="autoplay; fullscreen"
            allowFullScreen
            className="size-full border-0"
          />
        ) : null}
      </div>
      <PlayerDetails
        channelLogin={channelLogin}
        displayName={displayName}
        profileImageUrl={profileImageUrl}
        description={user?.description ?? ""}
        title={title}
        gameName={gameName}
        viewerCount={stream?.viewerCount ?? null}
        startedAt={stream?.startedAt}
        loading={loading}
        error={error}
      />
    </div>
  )

  const chat = (
    <ChatPage
      active={active}
      channelOverride={channelLogin}
      onClosePlayer={closePlayer}
      streamInfoMode="mobile"
      liveStreamOverride={stream}
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
}
