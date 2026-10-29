import * as React from "react"
import {
  CheckCheckIcon,
  CirclePlusIcon,
  ClockIcon,
  PlusIcon,
  Columns2Icon,
  EyeIcon,
  PlayIcon,
  Trash2Icon,
  UngroupIcon,
  XIcon,
} from "lucide-react"

import { useStreamUptime } from "@/hooks/twitch/player/use-stream-uptime"
import { SortableSidebarList } from "@/components/sidebar/channel-sidebar-list"
import {
  SidebarChannelAvatar,
  SidebarChannelRow,
  SidebarIconTile,
  SidebarPingBadge,
  SidebarPlayingBadge,
  SidebarSplitAvatarCluster,
} from "@/components/sidebar/sidebar-channel-icon"
import {
  usePeepochatLayout,
  usePeepochatPlayer,
  usePeepochatSettings,
  usePeepochatSidebarHighlights,
} from "@/lib/peepochat/peepochat-context"
import {
  isUnreadIndicatorEnabledForChannel,
  isUnreadIndicatorEnabledForSplit,
  isLiveNotificationsEnabledForChannel,
  isLiveNotificationsEnabledForSplit,
} from "@/lib/peepochat/peepochat-config"
import { getSidebarEntries } from "@/lib/sidebar/sidebar-entries"
import { useWatchedChannel } from "@/hooks/player/use-watched-channel"
import { formatViewerCount } from "@/lib/twitch/channel/stream-display"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  MenuPanelActions,
  MenuPanelCheckboxGroup,
  MenuPanelCheckboxItem,
  MenuPanelItem,
  MenuPanelProvider,
  MenuPanelSeparator,
  menuPanelContentClassName,
} from "@/components/ui/menu-panel"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
} from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

function channelLabel(login: string, displayName?: string) {
  return displayName ?? login
}

function splitGroupLabel(
  channels: Array<{ login: string; displayName?: string }>
) {
  return channels.map((c) => channelLabel(c.login, c.displayName)).join(", ")
}

function SplitTooltipLiveBadge() {
  return (
    <span className="shrink-0 rounded-sm bg-red-600 px-1 py-px text-[8px] leading-none font-bold tracking-wide text-white">
      LIVE
    </span>
  )
}

function SplitTooltipChannelRow({
  login,
  displayName,
  profileImageUrl,
  showPing,
  showLive,
}: {
  login: string
  displayName?: string
  profileImageUrl?: string
  showPing: boolean
  showLive: boolean
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="relative size-5 shrink-0 overflow-visible rounded-full">
        <span className="block size-full overflow-hidden rounded-full bg-secondary">
          <SidebarChannelAvatar
            login={login}
            profileImageUrl={profileImageUrl}
          />
        </span>
        {showPing ? <SidebarPingBadge ringClassName="ring-foreground" /> : null}
      </span>
      <span className="min-w-0 truncate">
        {channelLabel(login, displayName)}
      </span>
      {showLive ? <SplitTooltipLiveBadge /> : null}
    </div>
  )
}

function WatchedChannelAvatar({
  login,
  className,
}: {
  login: string
  className?: string
}) {
  const { profileImageUrl } = useWatchedChannel(login)
  return (
    <SidebarChannelAvatar
      className={className}
      login={login}
      profileImageUrl={profileImageUrl}
    />
  )
}

function PlayerTooltipRow({ login }: { login: string }) {
  const { displayName, profileImageUrl, stream } = useWatchedChannel(login)
  const uptime = useStreamUptime(stream?.startedAt)

  return (
    <div className="flex min-w-0 flex-col gap-1.5 py-0.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="size-5 shrink-0 overflow-hidden rounded-full bg-secondary">
          <SidebarChannelAvatar
            login={login}
            profileImageUrl={profileImageUrl}
          />
        </span>
        <span className="min-w-0 truncate">{displayName}</span>
      </div>
      {stream ? (
        <div className="flex items-center gap-2.5 tabular-nums">
          <span className="flex items-center gap-1 text-red-500">
            <EyeIcon className="size-3" aria-hidden />
            {formatViewerCount(stream.viewerCount)}
          </span>
          {uptime ? (
            <span className="flex items-center gap-1">
              <ClockIcon className="size-3" aria-hidden />
              {uptime}
            </span>
          ) : null}
        </div>
      ) : (
        <span>Offline</span>
      )}
    </div>
  )
}

function CloseStreamMenuItem({
  login,
  onClose,
}: {
  login: string
  onClose: (login: string) => void
}) {
  const { displayName } = useWatchedChannel(login)
  return (
    <MenuPanelItem
      icon={XIcon}
      label={`Close ${displayName}`}
      onSelect={() => onClose(login)}
    />
  )
}

function PlayerSidebarButton({
  logins,
  isActive,
  playing,
  perChannel,
  onSelect,
  onCloseStream,
  onCloseAll,
}: {
  logins: string[]
  isActive: boolean
  playing: boolean
  perChannel: boolean
  onSelect: () => void
  onCloseStream: (login: string) => void
  onCloseAll: () => void
}) {
  const [tooltipOpen, setTooltipOpen] = React.useState(false)
  const suppressTooltipUntilLeaveRef = React.useRef(false)
  const isGroup = logins.length > 1
  const { displayName } = useWatchedChannel(logins[0])
  const label = perChannel
    ? `Open ${displayName} stream`
    : "Open Peepochat Player"

  const handleTooltipOpenChange = React.useCallback((open: boolean) => {
    if (open && suppressTooltipUntilLeaveRef.current) {
      return
    }
    setTooltipOpen(open)
  }, [])

  const suppressTooltip = React.useCallback(() => {
    suppressTooltipUntilLeaveRef.current = true
    setTooltipOpen(false)
  }, [])

  const handlePointerLeave = React.useCallback(() => {
    suppressTooltipUntilLeaveRef.current = false
    setTooltipOpen(false)
  }, [])

  const renderClusterAvatar = React.useCallback(
    (login: string) => <WatchedChannelAvatar login={login} />,
    []
  )

  return (
    <SidebarChannelRow isActive={isActive} showUnread={false}>
      <ContextMenu onOpenChange={suppressTooltip}>
        <Tooltip open={tooltipOpen} onOpenChange={handleTooltipOpenChange}>
          <ContextMenuTrigger asChild>
            <TooltipTrigger asChild>
              <span className="relative block size-11 shrink-0">
                <Button
                  type="button"
                  size="icon"
                  aria-current={isActive ? "true" : undefined}
                  aria-label={label}
                  data-player-button=""
                  className={cn(
                    "size-11 shrink-0 overflow-hidden rounded-full bg-secondary ring-2 hover:brightness-110",
                    playing ? "ring-primary" : "ring-primary/35"
                  )}
                  onClick={onSelect}
                  onContextMenu={suppressTooltip}
                  onPointerLeave={handlePointerLeave}
                >
                  {isGroup ? (
                    <SidebarSplitAvatarCluster
                      channels={logins.map((login) => ({ login }))}
                      renderAvatar={renderClusterAvatar}
                    />
                  ) : (
                    <WatchedChannelAvatar
                      className="overflow-hidden"
                      login={logins[0]}
                    />
                  )}
                </Button>
                {playing ? <SidebarPlayingBadge /> : null}
              </span>
            </TooltipTrigger>
          </ContextMenuTrigger>
          <TooltipContent
            side="right"
            className="flex flex-col items-stretch gap-1.5 px-2.5 py-2"
          >
            {logins.map((login) => (
              <PlayerTooltipRow key={login} login={login} />
            ))}
          </TooltipContent>
        </Tooltip>
        <ContextMenuContent className={menuPanelContentClassName()}>
          <MenuPanelProvider kind="context">
            {isGroup ? (
              <>
                {logins.map((login) => (
                  <CloseStreamMenuItem
                    key={login}
                    login={login}
                    onClose={onCloseStream}
                  />
                ))}
                <MenuPanelSeparator />
                <MenuPanelItem
                  icon={XIcon}
                  label="Close all streams"
                  variant="destructive"
                  onSelect={onCloseAll}
                />
              </>
            ) : (
              <MenuPanelItem
                icon={XIcon}
                label="Close player"
                onSelect={() => onCloseStream(logins[0])}
              />
            )}
          </MenuPanelProvider>
        </ContextMenuContent>
      </ContextMenu>
    </SidebarChannelRow>
  )
}

function SplitTooltipContent({
  channels,
  hasPingForChannel,
  isChannelLive,
}: {
  channels: Array<{
    login: string
    displayName?: string
    profileImageUrl?: string
  }>
  hasPingForChannel: (login: string) => boolean
  isChannelLive: (login: string) => boolean
}) {
  return (
    <div className="flex flex-col gap-1.5 py-0.5">
      {channels.map((channel) => (
        <SplitTooltipChannelRow
          key={channel.login}
          login={channel.login}
          displayName={channel.displayName}
          profileImageUrl={channel.profileImageUrl}
          showPing={hasPingForChannel(channel.login)}
          showLive={isChannelLive(channel.login)}
        />
      ))}
    </div>
  )
}

function sidebarIconButtonClass() {
  return cn(
    "group/icon flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[1.375rem] border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
  )
}

function SidebarIconContextMenu({
  label,
  tooltipContent,
  isActive,
  showUnread,
  onSelect,
  menu,
  children,
}: {
  label: string
  tooltipContent?: React.ReactNode
  isActive: boolean
  showUnread: boolean
  onSelect: () => void
  menu: React.ReactNode
  children: React.ReactNode
}) {
  const [tooltipOpen, setTooltipOpen] = React.useState(false)
  const suppressTooltipUntilLeaveRef = React.useRef(false)

  const handleTooltipOpenChange = React.useCallback((open: boolean) => {
    if (open && suppressTooltipUntilLeaveRef.current) {
      return
    }
    setTooltipOpen(open)
  }, [])

  const suppressTooltip = React.useCallback(() => {
    suppressTooltipUntilLeaveRef.current = true
    setTooltipOpen(false)
  }, [])

  const handlePointerLeave = React.useCallback(() => {
    suppressTooltipUntilLeaveRef.current = false
    setTooltipOpen(false)
  }, [])

  return (
    <SidebarChannelRow isActive={isActive} showUnread={showUnread}>
      <ContextMenu onOpenChange={suppressTooltip}>
        <Tooltip open={tooltipOpen} onOpenChange={handleTooltipOpenChange}>
          <ContextMenuTrigger asChild>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={label}
                aria-current={isActive ? "true" : undefined}
                onClick={onSelect}
                onContextMenu={suppressTooltip}
                onPointerLeave={handlePointerLeave}
                className={sidebarIconButtonClass()}
              >
                {children}
              </button>
            </TooltipTrigger>
          </ContextMenuTrigger>
          <TooltipContent
            side="right"
            className={
              tooltipContent
                ? "flex flex-col items-stretch px-2.5 py-2"
                : undefined
            }
          >
            {tooltipContent ?? label}
          </TooltipContent>
        </Tooltip>
        {menu}
      </ContextMenu>
    </SidebarChannelRow>
  )
}

function ChannelContextMenu({
  login,
  displayName,
  profileImageUrl,
  isActive,
  activeChannelLogin,
  unreadEnabled,
  liveNotificationsEnabled,
  showUnread,
  showPing,
  showLive,
  isWatching,
  canAddToActiveSplit,
  isPlayerActive,
  onSelect,
  onRemove,
  onSplit,
  onWatch,
  onMarkRead,
  onUnreadEnabledChange,
  onLiveNotificationsChange,
}: {
  login: string
  displayName?: string
  profileImageUrl?: string
  isActive: boolean
  activeChannelLogin: string
  unreadEnabled: boolean
  liveNotificationsEnabled: boolean
  showUnread: boolean
  showPing: boolean
  showLive: boolean
  isWatching: boolean
  canAddToActiveSplit: boolean
  isPlayerActive: boolean
  onSelect: () => void
  onRemove: () => void
  onSplit: () => void
  onWatch: () => void
  onMarkRead: () => void
  onUnreadEnabledChange: (enabled: boolean) => void
  onLiveNotificationsChange: (enabled: boolean) => void
}) {
  const label = channelLabel(login, displayName)
  const hasNewMessages = showUnread || showPing
  const canSplit =
    canAddToActiveSplit ||
    (Boolean(activeChannelLogin) && activeChannelLogin !== login)
  const SplitIcon = canAddToActiveSplit ? CirclePlusIcon : Columns2Icon
  const splitActionLabel = canAddToActiveSplit ? "Add to Split" : "Split"
  const splitDisabled = isPlayerActive

  return (
    <SidebarIconContextMenu
      label={label}
      isActive={isActive}
      showUnread={showUnread}
      onSelect={onSelect}
      menu={
        <ContextMenuContent className={menuPanelContentClassName()}>
          <MenuPanelProvider kind="context">
            <MenuPanelItem
              icon={CheckCheckIcon}
              label="Mark as read"
              disabled={!hasNewMessages}
              onSelect={onMarkRead}
            />
            <MenuPanelSeparator />
            <MenuPanelActions
              actions={[
                ...(canSplit || splitDisabled
                  ? [
                      {
                        icon: SplitIcon,
                        label: splitActionLabel,
                        disabled: splitDisabled,
                        onSelect: onSplit,
                      },
                    ]
                  : []),
                {
                  icon: PlayIcon,
                  label: isWatching ? "Go to stream" : "Watch",
                  onSelect: onWatch,
                },
              ]}
            />
            <MenuPanelSeparator />
            <MenuPanelCheckboxGroup>
              <MenuPanelCheckboxItem
                checked={unreadEnabled}
                onCheckedChange={onUnreadEnabledChange}
              >
                Unread indicator
              </MenuPanelCheckboxItem>
              <MenuPanelCheckboxItem
                checked={liveNotificationsEnabled}
                onCheckedChange={onLiveNotificationsChange}
              >
                Live notifications
              </MenuPanelCheckboxItem>
            </MenuPanelCheckboxGroup>
            <MenuPanelSeparator />
            <MenuPanelItem
              icon={Trash2Icon}
              label={`Remove ${label}`}
              variant="destructive"
              onSelect={onRemove}
            />
          </MenuPanelProvider>
        </ContextMenuContent>
      }
    >
      <SidebarIconTile
        isActive={isActive}
        showPing={showPing}
        showLive={showLive}
      >
        <SidebarChannelAvatar login={login} profileImageUrl={profileImageUrl} />
      </SidebarIconTile>
    </SidebarIconContextMenu>
  )
}

function SplitContextMenu({
  channels,
  isActive,
  unreadEnabled,
  liveNotificationsEnabled,
  showUnread,
  showPing,
  showLive,
  hasPingForChannel,
  isChannelLive,
  onSelect,
  onUngroup,
  onDelete,
  onMarkRead,
  onUnreadEnabledChange,
  onLiveNotificationsChange,
}: {
  channels: Array<{
    login: string
    displayName?: string
    profileImageUrl?: string
  }>
  isActive: boolean
  unreadEnabled: boolean
  liveNotificationsEnabled: boolean
  showUnread: boolean
  showPing: boolean
  showLive: boolean
  hasPingForChannel: (login: string) => boolean
  isChannelLive: (login: string) => boolean
  onSelect: () => void
  onUngroup: () => void
  onDelete: () => void
  onMarkRead: () => void
  onUnreadEnabledChange: (enabled: boolean) => void
  onLiveNotificationsChange: (enabled: boolean) => void
}) {
  const label = splitGroupLabel(channels)
  const hasNewMessages = showUnread || showPing

  return (
    <SidebarIconContextMenu
      label={label}
      tooltipContent={
        <SplitTooltipContent
          channels={channels}
          hasPingForChannel={hasPingForChannel}
          isChannelLive={isChannelLive}
        />
      }
      isActive={isActive}
      showUnread={showUnread}
      onSelect={onSelect}
      menu={
        <ContextMenuContent className={menuPanelContentClassName()}>
          <MenuPanelProvider kind="context">
            <MenuPanelItem
              icon={CheckCheckIcon}
              label="Mark as read"
              disabled={!hasNewMessages}
              onSelect={onMarkRead}
            />
            <MenuPanelSeparator />
            <MenuPanelCheckboxGroup>
              <MenuPanelCheckboxItem
                checked={unreadEnabled}
                onCheckedChange={onUnreadEnabledChange}
              >
                Unread indicator
              </MenuPanelCheckboxItem>
              <MenuPanelCheckboxItem
                checked={liveNotificationsEnabled}
                onCheckedChange={onLiveNotificationsChange}
              >
                Live notifications
              </MenuPanelCheckboxItem>
            </MenuPanelCheckboxGroup>
            <MenuPanelSeparator />
            <MenuPanelItem
              icon={UngroupIcon}
              label="Ungroup split"
              onSelect={onUngroup}
            />
            <MenuPanelItem
              icon={Trash2Icon}
              label="Delete split"
              variant="destructive"
              onSelect={onDelete}
            />
          </MenuPanelProvider>
        </ContextMenuContent>
      }
    >
      <SidebarIconTile
        isActive={isActive}
        showPing={showPing}
        showLive={showLive}
        variant="split"
      >
        <SidebarSplitAvatarCluster channels={channels} />
      </SidebarIconTile>
    </SidebarIconContextMenu>
  )
}

export function ChannelSidebar({ onAddChannel }: { onAddChannel: () => void }) {
  const {
    config,
    updateConfig,
    channels,
    activeChannelLogin,
    setActiveChannel,
    removeChannel,
  } = usePeepochatSettings()
  const {
    hasUnreadForChannel,
    hasUnreadForSplit,
    hasPingForChannel,
    hasPingForSplit,
    markChannelRead,
    markSplitRead,
    isChannelLive,
    isSplitLive,
  } = usePeepochatSidebarHighlights()
  const {
    isSplitView,
    activeSplitId,
    savedSplits,
    sidebarOrder,
    channelsInSplits,
    selectSplit,
    openSplitView,
    addSplitChannel,
    unsplit,
    reorderSidebar,
  } = usePeepochatLayout()
  const {
    playerMode,
    watchedChannelLogins,
    focusedPlayerLogin,
    playerViewActive,
    openPlayer,
    selectPlayer,
    closePlayer,
    closeAllPlayers,
  } = usePeepochatPlayer()

  const splitById = React.useMemo(
    () => new Map(savedSplits.map((split) => [split.id, split])),
    [savedSplits]
  )

  const activeSplit = activeSplitId ? splitById.get(activeSplitId) : undefined
  const activeSplitChannelSet = React.useMemo(
    () => new Set(activeSplit?.channels ?? []),
    [activeSplit]
  )
  const sidebarEntries = React.useMemo(
    () =>
      getSidebarEntries(sidebarOrder, savedSplits, channels, channelsInSplits),
    [channels, channelsInSplits, savedSplits, sidebarOrder]
  )

  const handleSplitWith = (login: string) => {
    if (playerViewActive) {
      return
    }

    if (isSplitView) {
      addSplitChannel(login)
      return
    }

    if (!activeChannelLogin || activeChannelLogin === login) {
      return
    }

    openSplitView([activeChannelLogin, login])
  }

  const setChannelUnreadEnabled = (login: string, enabled: boolean) => {
    updateConfig((current) => ({
      ...current,
      twitch: {
        ...current.twitch,
        channels: current.twitch.channels.map((channel) =>
          channel.login === login
            ? { ...channel, unreadIndicatorEnabled: enabled }
            : channel
        ),
      },
    }))
  }

  const setSplitUnreadEnabled = (splitId: string, enabled: boolean) => {
    updateConfig((current) => ({
      ...current,
      layout: {
        ...current.layout,
        splits: current.layout.splits.map((split) =>
          split.id === splitId
            ? { ...split, unreadIndicatorEnabled: enabled }
            : split
        ),
      },
    }))
  }

  const setChannelLiveNotificationsEnabled = (
    login: string,
    enabled: boolean
  ) => {
    updateConfig((current) => ({
      ...current,
      twitch: {
        ...current.twitch,
        channels: current.twitch.channels.map((channel) =>
          channel.login === login
            ? { ...channel, liveNotificationsEnabled: enabled }
            : channel
        ),
      },
    }))
  }

  const setSplitLiveNotificationsEnabled = (
    splitId: string,
    enabled: boolean
  ) => {
    updateConfig((current) => ({
      ...current,
      layout: {
        ...current.layout,
        splits: current.layout.splits.map((split) =>
          split.id === splitId
            ? { ...split, liveNotificationsEnabled: enabled }
            : split
        ),
      },
    }))
  }

  const handleDeleteSplit = (splitChannels: string[]) => {
    for (const login of splitChannels) {
      removeChannel(login)
    }
  }

  const addButton = (
    <Button
      variant="outline"
      size="icon"
      data-add-channel=""
      className="size-11 shrink-0 rounded-full"
      onClick={onAddChannel}
    >
      <PlusIcon className="size-5 shrink-0" strokeWidth={2.5} />
      <span className="sr-only">Add channel</span>
    </Button>
  )

  const playerButtons =
    watchedChannelLogins.length === 0 ? null : playerMode === "sidebar" ? (
      watchedChannelLogins.map((login) => (
        <PlayerSidebarButton
          key={login}
          logins={[login]}
          isActive={playerViewActive && focusedPlayerLogin === login}
          playing={focusedPlayerLogin === login}
          perChannel
          onSelect={() => selectPlayer(login)}
          onCloseStream={closePlayer}
          onCloseAll={closeAllPlayers}
        />
      ))
    ) : (
      <PlayerSidebarButton
        logins={watchedChannelLogins}
        isActive={playerViewActive}
        playing
        perChannel={false}
        onSelect={() => selectPlayer()}
        onCloseStream={closePlayer}
        onCloseAll={closeAllPlayers}
      />
    )

  return (
    <>
      <Sidebar
        collapsible="icon"
        className="overflow-visible border-r border-sidebar-border"
      >
        <SidebarContent className="min-h-0 flex-1 overflow-visible">
          {playerButtons ? (
            <div className="flex shrink-0 flex-col items-center gap-3 pt-3">
              {playerButtons}
              <div className="mb-3 h-px w-10 bg-sidebar-border" aria-hidden />
            </div>
          ) : null}
          <SidebarGroup
            className={cn(
              "min-h-0 flex-1 overflow-x-visible overflow-y-auto px-0 group-data-[collapsible=icon]:overflow-x-visible group-data-[collapsible=icon]:overflow-y-auto",
              playerButtons ? "pt-0 pb-3" : "py-3"
            )}
          >
            <SidebarGroupContent className="flex flex-col items-stretch">
              <SortableSidebarList
                itemIds={sidebarEntries.map((entry) => entry.key)}
                onReorder={reorderSidebar}
                className="w-full gap-3"
              >
                {(itemId) => {
                  const entry = sidebarEntries.find((e) => e.key === itemId)
                  if (!entry) {
                    return null
                  }

                  if (entry.kind === "split") {
                    const showUnread = hasUnreadForSplit(
                      entry.split.id,
                      entry.split.channels
                    )
                    const showPing = hasPingForSplit(
                      entry.split.id,
                      entry.split.channels
                    )

                    return (
                      <SplitContextMenu
                        channels={entry.channels}
                        isActive={
                          !playerViewActive &&
                          isSplitView &&
                          activeSplitId === entry.split.id
                        }
                        unreadEnabled={isUnreadIndicatorEnabledForSplit(
                          config,
                          entry.split.id
                        )}
                        liveNotificationsEnabled={isLiveNotificationsEnabledForSplit(
                          config,
                          entry.split.id
                        )}
                        showUnread={showUnread}
                        showPing={showPing}
                        showLive={isSplitLive(entry.split.channels)}
                        hasPingForChannel={hasPingForChannel}
                        isChannelLive={isChannelLive}
                        onSelect={() => selectSplit(entry.split.id)}
                        onUnreadEnabledChange={(enabled) =>
                          setSplitUnreadEnabled(entry.split.id, enabled)
                        }
                        onLiveNotificationsChange={(enabled) =>
                          setSplitLiveNotificationsEnabled(
                            entry.split.id,
                            enabled
                          )
                        }
                        onMarkRead={() => markSplitRead(entry.split.id)}
                        onUngroup={() => unsplit(entry.split.id)}
                        onDelete={() => handleDeleteSplit(entry.split.channels)}
                      />
                    )
                  }

                  const showUnread = hasUnreadForChannel(entry.channel.login)
                  const showPing = hasPingForChannel(entry.channel.login)

                  return (
                    <ChannelContextMenu
                      login={entry.channel.login}
                      displayName={entry.channel.displayName}
                      profileImageUrl={entry.channel.profileImageUrl}
                      isActive={
                        !playerViewActive &&
                        !isSplitView &&
                        entry.channel.login === activeChannelLogin
                      }
                      activeChannelLogin={activeChannelLogin}
                      unreadEnabled={isUnreadIndicatorEnabledForChannel(
                        config,
                        entry.channel.login
                      )}
                      liveNotificationsEnabled={isLiveNotificationsEnabledForChannel(
                        config,
                        entry.channel.login
                      )}
                      showUnread={showUnread}
                      showPing={showPing}
                      showLive={isChannelLive(entry.channel.login)}
                      isWatching={watchedChannelLogins.includes(
                        entry.channel.login
                      )}
                      canAddToActiveSplit={
                        isSplitView &&
                        Boolean(activeSplitId) &&
                        !activeSplitChannelSet.has(entry.channel.login)
                      }
                      isPlayerActive={playerViewActive}
                      onSelect={() => setActiveChannel(entry.channel.login)}
                      onUnreadEnabledChange={(enabled) =>
                        setChannelUnreadEnabled(entry.channel.login, enabled)
                      }
                      onLiveNotificationsChange={(enabled) =>
                        setChannelLiveNotificationsEnabled(
                          entry.channel.login,
                          enabled
                        )
                      }
                      onMarkRead={() => markChannelRead(entry.channel.login)}
                      onRemove={() => removeChannel(entry.channel.login)}
                      onSplit={() => handleSplitWith(entry.channel.login)}
                      onWatch={() => openPlayer(entry.channel.login)}
                    />
                  )
                }}
              </SortableSidebarList>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="flex items-center justify-center p-2">
          <Tooltip>
            <TooltipTrigger asChild>{addButton}</TooltipTrigger>
            <TooltipContent side="right">Add channel</TooltipContent>
          </Tooltip>
        </SidebarFooter>
      </Sidebar>
    </>
  )
}
