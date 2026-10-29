import * as React from "react"

import {
  ChatSplitLayout,
  DragOverlayPreview,
} from "@/components/chat/pane/split-layout"
import { PlayerDetails } from "@/components/player/player-details"
import { PlayerResizeLayout } from "@/components/player/resize-layout"
import { TwitchPlayerFrame } from "@/components/player/twitch-player-frame"
import { VideoPaneHeader } from "@/components/player/video-pane-header"
import { useWatchedChannel } from "@/hooks/player/use-watched-channel"
import { useResizeActivity } from "@/hooks/player/use-resize-session"
import { useLazyRef } from "@/hooks/use-lazy-ref"
import type { SplitLayoutEdge } from "@/lib/chat/layout/split-layout"
import {
  usePeepochatPlayer,
  usePeepochatSettings,
} from "@/lib/peepochat/peepochat-context"
import type { WatchInstance } from "@/lib/player/watch-state"
import { ChatPage } from "@/pages/chat-page"
import { cn } from "@/lib/utils"

const WATCH_SPLIT_ID = "watch"

function WatchPaneDetails({ login }: { login: string }) {
  const channel = useWatchedChannel(login)

  return (
    <div className="pointer-events-auto shrink-0 bg-background">
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
    </div>
  )
}

function WatchDragPreview({ login }: { login: string }) {
  const { displayName, profileImageUrl } = useWatchedChannel(login)

  return (
    <DragOverlayPreview
      login={login}
      label={displayName}
      profileImageUrl={profileImageUrl}
    />
  )
}

function renderWatchDragPreview(login: string) {
  return <WatchDragPreview login={login} />
}

function WatchFrame({
  instance,
  mounted,
  frozen,
  registerFrame,
  onMutedChange,
}: {
  instance: WatchInstance
  mounted: boolean
  frozen: boolean
  registerFrame: (login: string, node: HTMLElement) => () => void
  onMutedChange: (login: string, muted: boolean) => void
}) {
  const { displayName } = useWatchedChannel(instance.login)
  const login = instance.login
  const setRef = React.useCallback(
    (node: HTMLDivElement) => registerFrame(login, node),
    [login, registerFrame]
  )
  const handleMutedChange = React.useCallback(
    (muted: boolean) => onMutedChange(login, muted),
    [login, onMutedChange]
  )

  return (
    <div
      ref={setRef}
      className="invisible absolute top-0 left-0 overflow-hidden bg-black"
    >
      {mounted ? (
        <TwitchPlayerFrame
          login={login}
          title={`${displayName} Twitch stream`}
          initialMuted={instance.muted}
          onMutedChange={handleMutedChange}
          frozen={frozen}
        />
      ) : null}
    </div>
  )
}

function MultiWatchVideos({
  active,
  showDetails,
}: {
  active: boolean
  showDetails: boolean
}) {
  const { config } = usePeepochatSettings()
  const {
    watchedInstances,
    watchedChannelLogins,
    playerLayout,
    movePlayerPane,
    resizePlayerPanePath,
    closePlayer,
    reportPlayerMuted,
  } = usePeepochatPlayer()
  const outerResizeActive = useResizeActivity()
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const slotElementsRef = useLazyRef(() => new Map<string, HTMLElement>())
  const frameElementsRef = useLazyRef(() => new Map<string, HTMLElement>())
  const resizeObserverRef = React.useRef<ResizeObserver | null>(null)
  const [layoutInteractionActive, setLayoutInteractionActive] =
    React.useState(false)
  const [pointerHeld, setPointerHeld] = React.useState(false)
  const iframeMounted = active || config.player.backgroundPlaybackEnabled
  const pointerBlocked =
    layoutInteractionActive || pointerHeld || outerResizeActive

  const positionFrames = React.useCallback(() => {
    const root = rootRef.current
    if (!root) return

    const rootRect = root.getBoundingClientRect()
    for (const login of frameElementsRef.current.keys()) {
      const frame = frameElementsRef.current.get(login)
      if (!frame) continue
      const slot = slotElementsRef.current.get(login)
      if (!slot || !slot.isConnected) {
        frame.style.visibility = "hidden"
        continue
      }

      const rect = slot.getBoundingClientRect()
      frame.style.visibility = "visible"
      frame.style.transform = `translate(${rect.left - rootRect.left}px, ${rect.top - rootRect.top}px)`
      frame.style.width = `${rect.width}px`
      frame.style.height = `${rect.height}px`
    }
  }, [frameElementsRef, slotElementsRef])

  React.useLayoutEffect(() => {
    positionFrames()
  })

  React.useEffect(() => {
    const observer = new ResizeObserver(() => positionFrames())
    resizeObserverRef.current = observer
    if (rootRef.current) observer.observe(rootRef.current)
    for (const slot of slotElementsRef.current.values()) {
      observer.observe(slot)
    }
    return () => {
      observer.disconnect()
      if (resizeObserverRef.current === observer) {
        resizeObserverRef.current = null
      }
    }
  }, [positionFrames, slotElementsRef])

  React.useEffect(() => {
    if (!pointerHeld) return

    const release = () => setPointerHeld(false)
    window.addEventListener("pointerup", release)
    window.addEventListener("pointercancel", release)
    window.addEventListener("blur", release)
    return () => {
      window.removeEventListener("pointerup", release)
      window.removeEventListener("pointercancel", release)
      window.removeEventListener("blur", release)
    }
  }, [pointerHeld])

  const registerSlot = React.useCallback(
    (login: string, node: HTMLElement) => {
      slotElementsRef.current.set(login, node)
      resizeObserverRef.current?.observe(node)
      return () => {
        resizeObserverRef.current?.unobserve(node)
        if (slotElementsRef.current.get(login) === node) {
          slotElementsRef.current.delete(login)
        }
      }
    },
    [slotElementsRef]
  )

  const registerFrame = React.useCallback(
    (login: string, node: HTMLElement) => {
      frameElementsRef.current.set(login, node)
      return () => {
        if (frameElementsRef.current.get(login) === node) {
          frameElementsRef.current.delete(login)
        }
      }
    },
    [frameElementsRef]
  )

  const holdPointer = React.useCallback(() => setPointerHeld(true), [])
  const showHeaders = watchedChannelLogins.length > 1

  const renderPane = React.useCallback(
    (login: string, dragHandleProps: React.HTMLAttributes<HTMLDivElement>) => (
      <WatchPane
        key={login}
        login={login}
        showHeader={showHeaders}
        showDetails={showDetails}
        dragHandleProps={dragHandleProps}
        registerSlot={registerSlot}
        onHoldPointer={holdPointer}
        onClose={closePlayer}
      />
    ),
    [closePlayer, holdPointer, registerSlot, showDetails, showHeaders]
  )

  const handleMovePane = React.useCallback(
    (
      _splitId: string,
      sourceLogin: string,
      targetLogin: string,
      edge: SplitLayoutEdge
    ) => movePlayerPane(sourceLogin, targetLogin, edge),
    [movePlayerPane]
  )

  const handleResizePath = React.useCallback(
    (_splitId: string, path: number[], sizes: number[]) =>
      resizePlayerPanePath(path, sizes),
    [resizePlayerPanePath]
  )

  return (
    <div
      ref={rootRef}
      className="relative isolate flex aspect-video w-full min-w-0 overflow-hidden bg-black md:aspect-auto md:h-full md:min-h-0"
    >
      <div className="pointer-events-none relative z-10 flex min-h-0 min-w-0 flex-1">
        <ChatSplitLayout
          splitId={WATCH_SPLIT_ID}
          channels={watchedChannelLogins}
          layout={playerLayout}
          renderDragPreview={renderWatchDragPreview}
          renderPane={renderPane}
          onMovePane={handleMovePane}
          onResizePath={handleResizePath}
          resizeLabel="Resize streams"
          onInteractionActiveChange={setLayoutInteractionActive}
        />
      </div>
      <div
        className={cn(
          "absolute inset-0 z-0 overflow-hidden",
          pointerBlocked && "pointer-events-none"
        )}
      >
        {watchedInstances.map((instance) => (
          <WatchFrame
            key={instance.login}
            instance={instance}
            mounted={iframeMounted}
            frozen={layoutInteractionActive}
            registerFrame={registerFrame}
            onMutedChange={reportPlayerMuted}
          />
        ))}
      </div>
    </div>
  )
}

function WatchPane({
  login,
  showHeader,
  showDetails,
  dragHandleProps,
  registerSlot,
  onHoldPointer,
  onClose,
}: {
  login: string
  showHeader: boolean
  showDetails: boolean
  dragHandleProps: React.HTMLAttributes<HTMLDivElement>
  registerSlot: (login: string, node: HTMLElement) => () => void
  onHoldPointer: () => void
  onClose: (login: string) => void
}) {
  const setSlotRef = React.useCallback(
    (node: HTMLDivElement) => registerSlot(login, node),
    [login, registerSlot]
  )
  const headerProps = React.useMemo(
    () => ({ ...dragHandleProps, onPointerDownCapture: onHoldPointer }),
    [dragHandleProps, onHoldPointer]
  )

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      {showHeader ? (
        <VideoPaneHeader
          login={login}
          dragHandleProps={headerProps}
          onClose={() => onClose(login)}
        />
      ) : null}
      <div ref={setSlotRef} className="min-h-0 flex-1" />
      {showDetails ? <WatchPaneDetails login={login} /> : null}
    </div>
  )
}

export function MultiWatchView({ active }: { active: boolean }) {
  const { config, updateConfig } = usePeepochatSettings()
  const { watchedChannelLogins, playerChatLogin, setPlayerChat, closePlayer } =
    usePeepochatPlayer()
  const chatLogin = playerChatLogin ?? watchedChannelLogins[0] ?? ""
  const chatChannel = useWatchedChannel(chatLogin)
  const singleStream = watchedChannelLogins.length === 1
  const showDetails = singleStream && !config.player.hideStreamInfoEnabled
  const handleCloseSingle = React.useCallback(
    () => closePlayer(chatLogin),
    [chatLogin, closePlayer]
  )
  const chatSwitcher = React.useMemo(
    () => ({
      logins: watchedChannelLogins,
      selectedLogin: chatLogin || null,
      onSelect: setPlayerChat,
    }),
    [chatLogin, setPlayerChat, watchedChannelLogins]
  )

  if (!chatLogin) {
    return null
  }

  return (
    <PlayerResizeLayout
      player={<MultiWatchVideos active={active} showDetails={showDetails} />}
      chat={
        <ChatPage
          key={chatLogin}
          active={active}
          channelOverride={chatLogin}
          chatSwitcher={chatSwitcher}
          onClosePlayer={singleStream ? handleCloseSingle : undefined}
          streamInfoMode={showDetails ? "mobile" : "interactive"}
          liveStreamOverride={chatChannel.stream}
          displayNameOverride={chatChannel.displayName}
          profileImageUrlOverride={chatChannel.profileImageUrl}
        />
      }
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
