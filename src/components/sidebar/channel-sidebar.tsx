import * as React from "react"
import {
  CheckCheckIcon,
  Columns2Icon,
  PlusIcon,
  Trash2Icon,
  UngroupIcon,
} from "lucide-react"
import { toast } from "sonner"

import { SortableSidebarList } from "@/components/sidebar/channel-sidebar-list"
import {
  SidebarChannelAvatar,
  SidebarChannelRow,
  SidebarIconTile,
  SidebarPingBadge,
  SidebarSplitAvatarCluster,
} from "@/components/sidebar/sidebar-channel-icon"
import {
  usePeepochatHighlights,
  usePeepochatLayout,
  usePeepochatSettings,
} from "@/lib/peepochat/peepochat-context"
import {
  isUnreadIndicatorEnabledForChannel,
  isUnreadIndicatorEnabledForSplit,
} from "@/lib/peepochat/peepochat-config"
import {
  CHANNEL_ORDER_PREFIX,
  SPLIT_ORDER_PREFIX,
} from "@/lib/sidebar/sidebar-order"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
    "group/icon flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
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
  showUnread,
  showPing,
  showLive,
  canAddToActiveSplit,
  onSelect,
  onRemove,
  onSplit,
  onMarkRead,
  onUnreadEnabledChange,
}: {
  login: string
  displayName?: string
  profileImageUrl?: string
  isActive: boolean
  activeChannelLogin: string
  unreadEnabled: boolean
  showUnread: boolean
  showPing: boolean
  showLive: boolean
  canAddToActiveSplit: boolean
  onSelect: () => void
  onRemove: () => void
  onSplit: () => void
  onMarkRead: () => void
  onUnreadEnabledChange: (enabled: boolean) => void
}) {
  const label = channelLabel(login, displayName)
  const activeLabel = channelLabel(activeChannelLogin)
  const hasNewMessages = showUnread || showPing
  const canSplit =
    canAddToActiveSplit ||
    (Boolean(activeChannelLogin) && activeChannelLogin !== login)
  const splitActionLabel = canAddToActiveSplit
    ? "Add to current split"
    : `Split with ${activeLabel}`

  return (
    <SidebarIconContextMenu
      label={label}
      isActive={isActive}
      showUnread={showUnread}
      onSelect={onSelect}
      menu={
        <ContextMenuContent>
          <ContextMenuItem disabled={!hasNewMessages} onSelect={onMarkRead}>
            <CheckCheckIcon />
            Mark as read
          </ContextMenuItem>
          <ContextMenuCheckboxItem
            checked={unreadEnabled}
            onCheckedChange={onUnreadEnabledChange}
          >
            Enable unread indicator
          </ContextMenuCheckboxItem>
          <ContextMenuSeparator />
          {canSplit ? (
            <ContextMenuItem onSelect={onSplit}>
              <Columns2Icon />
              {splitActionLabel}
            </ContextMenuItem>
          ) : null}
          {canSplit ? <ContextMenuSeparator /> : null}
          <ContextMenuItem variant="destructive" onSelect={onRemove}>
            <Trash2Icon />
            Remove {label}
          </ContextMenuItem>
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
}: {
  channels: Array<{
    login: string
    displayName?: string
    profileImageUrl?: string
  }>
  isActive: boolean
  unreadEnabled: boolean
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
        <ContextMenuContent>
          <ContextMenuItem disabled={!hasNewMessages} onSelect={onMarkRead}>
            <CheckCheckIcon />
            Mark as read
          </ContextMenuItem>
          <ContextMenuCheckboxItem
            checked={unreadEnabled}
            onCheckedChange={onUnreadEnabledChange}
          >
            Enable unread indicator
          </ContextMenuCheckboxItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={onUngroup}>
            <UngroupIcon />
            Ungroup split
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2Icon />
            Delete split
          </ContextMenuItem>
        </ContextMenuContent>
      }
    >
      <SidebarIconTile
        isActive={isActive}
        showPing={showPing}
        showLive={showLive}
      >
        <SidebarSplitAvatarCluster channels={channels} />
      </SidebarIconTile>
    </SidebarIconContextMenu>
  )
}

function AddChannelDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (login: string) => Promise<void>
}) {
  const [draft, setDraft] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setDraft("")
      setSubmitting(false)
    }
  }

  const handleSubmit = async () => {
    const value = draft.trim()
    if (!value || submitting) {
      return
    }

    setSubmitting(true)
    try {
      await onAdd(value)
      handleOpenChange(false)
    } catch {
      // Caller shows toast
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add channel</DialogTitle>
          <DialogDescription>
            Enter a username to join their channel.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <Label htmlFor="add-channel-input">Channel name</Label>
          <Input
            id="add-channel-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Channel name"
            disabled={submitting}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSubmit()
            }}
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!draft.trim() || submitting}
          >
            {submitting ? "Adding…" : "Add channel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ChannelSidebar() {
  const { config, updateConfig } = usePeepochatSettings()
  const {
    hasUnreadForChannel,
    hasUnreadForSplit,
    hasPingForChannel,
    hasPingForSplit,
    markChannelRead,
    markSplitRead,
    isChannelLive,
    isSplitLive,
  } = usePeepochatHighlights()
  const {
    channels,
    activeChannelLogin,
    setActiveChannel,
    addChannel,
    removeChannel,
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
  const [addDialogOpen, setAddDialogOpen] = React.useState(false)

  const splitById = React.useMemo(
    () => new Map(savedSplits.map((split) => [split.id, split])),
    [savedSplits]
  )

  const channelByLogin = React.useMemo(
    () => new Map(channels.map((channel) => [channel.login, channel])),
    [channels]
  )
  const activeSplit = activeSplitId ? splitById.get(activeSplitId) : undefined
  const activeSplitChannelSet = React.useMemo(
    () => new Set(activeSplit?.channels ?? []),
    [activeSplit]
  )
  const sidebarEntries = React.useMemo(() => {
    return sidebarOrder
      .map((key) => {
        if (key.startsWith(SPLIT_ORDER_PREFIX)) {
          const split = splitById.get(key.slice(SPLIT_ORDER_PREFIX.length))
          if (!split || split.channels.length < 2) {
            return null
          }

          return {
            key,
            kind: "split" as const,
            split,
            channels: split.channels.map(
              (login) => channelByLogin.get(login) ?? { login }
            ),
          }
        }

        if (key.startsWith(CHANNEL_ORDER_PREFIX)) {
          const channel = channelByLogin.get(
            key.slice(CHANNEL_ORDER_PREFIX.length)
          )
          if (!channel || channelsInSplits.has(channel.login)) {
            return null
          }

          return { key, kind: "channel" as const, channel }
        }

        return null
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
  }, [channelByLogin, channelsInSplits, sidebarOrder, splitById])

  const handleAddChannel = async (login: string) => {
    try {
      await addChannel(login)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add channel"
      )
      throw error
    }
  }

  const handleSplitWith = (login: string) => {
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

  const handleDeleteSplit = (splitChannels: string[]) => {
    for (const login of splitChannels) {
      removeChannel(login)
    }
  }

  const addButton = (
    <Button
      variant="outline"
      size="icon"
      className="size-11 shrink-0"
      onClick={() => setAddDialogOpen(true)}
    >
      <PlusIcon className="size-4 shrink-0" />
      <span className="sr-only">Add channel</span>
    </Button>
  )

  return (
    <>
      <Sidebar
        collapsible="icon"
        className="top-12 h-[calc(100svh-3rem)] overflow-visible border-r border-sidebar-border"
      >
        <SidebarContent className="min-h-0 flex-1 overflow-x-visible overflow-y-auto group-data-[collapsible=icon]:overflow-x-visible group-data-[collapsible=icon]:overflow-y-auto">
          <SidebarGroup className="px-0 py-3">
            <SidebarGroupContent className="flex flex-col items-stretch">
              <SortableSidebarList
                itemIds={sidebarEntries.map((entry) => entry.key)}
                onReorder={reorderSidebar}
                className="w-full gap-2"
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
                          isSplitView && activeSplitId === entry.split.id
                        }
                        unreadEnabled={isUnreadIndicatorEnabledForSplit(
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
                        !isSplitView &&
                        entry.channel.login === activeChannelLogin
                      }
                      activeChannelLogin={activeChannelLogin}
                      unreadEnabled={isUnreadIndicatorEnabledForChannel(
                        config,
                        entry.channel.login
                      )}
                      showUnread={showUnread}
                      showPing={showPing}
                      showLive={isChannelLive(entry.channel.login)}
                      canAddToActiveSplit={
                        isSplitView &&
                        Boolean(activeSplitId) &&
                        !activeSplitChannelSet.has(entry.channel.login)
                      }
                      onSelect={() => setActiveChannel(entry.channel.login)}
                      onUnreadEnabledChange={(enabled) =>
                        setChannelUnreadEnabled(entry.channel.login, enabled)
                      }
                      onMarkRead={() => markChannelRead(entry.channel.login)}
                      onRemove={() => removeChannel(entry.channel.login)}
                      onSplit={() => handleSplitWith(entry.channel.login)}
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

      <AddChannelDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAdd={handleAddChannel}
      />
    </>
  )
}
