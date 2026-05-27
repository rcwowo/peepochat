import * as React from "react"
import { Columns2Icon, PlusIcon, Trash2Icon, UngroupIcon } from "lucide-react"
import { toast } from "sonner"

import { SortableSidebarList } from "@/components/channel-sidebar-list"
import { usePeeepochatLayout } from "@/lib/peepochat-context"
import { CHANNEL_ORDER_PREFIX, SPLIT_ORDER_PREFIX } from "@/lib/sidebar-order"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
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

function channelLabel(login: string, displayName?: string) {
  return displayName ?? login
}

function splitGroupLabel(
  channels: Array<{ login: string; displayName?: string }>
) {
  return channels.map((c) => channelLabel(c.login, c.displayName)).join(", ")
}

function ChannelAvatar({
  login,
  profileImageUrl,
  className,
}: {
  login: string
  profileImageUrl?: string
  className?: string
}) {
  const classes = cn(
    "pointer-events-none size-10 shrink-0 rounded-full object-cover aspect-square",
    className
  )

  if (profileImageUrl) {
    return (
      <img
        src={profileImageUrl}
        alt=""
        draggable={false}
        className={classes}
      />
    )
  }

  return (
    <span
      className={cn(
        classes,
        "flex items-center justify-center bg-primary/15 text-xs font-semibold uppercase text-primary"
      )}
    >
      {login.slice(0, 2)}
    </span>
  )
}

function splitClusterAvatarSize(count: number) {
  if (count <= 2) return "size-6"
  if (count === 3) return "size-[1.2rem]"
  return "size-[1.125rem]"
}

function splitClusterAvatarPosition(index: number, count: number) {
  if (count === 2) {
    return cn(
      index === 0 && "left-0 top-1/2 z-[2] -translate-y-1/2",
      index === 1 && "left-3 top-1/2 z-[1] -translate-y-1/2"
    )
  }

  if (count === 3) {
    return cn(
      index === 0 && "left-1/2 top-0 -translate-x-1/2 z-[4]",
      index === 1 && "bottom-0 left-0 z-[3]",
      index === 2 && "bottom-0 right-0 z-[2]"
    )
  }

  return cn(
    index === 0 && "left-0 top-0 z-[4]",
    index === 1 && "right-0 top-0 z-[3]",
    index === 2 && "left-0 bottom-0 z-[2]",
    index === 3 && "right-0 bottom-0 z-[1]"
  )
}

function SplitAvatarCluster({
  channels,
  ringClass = "ring-sidebar",
  isActive = false,
}: {
  channels: Array<{
    login: string
    profileImageUrl?: string
  }>
  ringClass?: string
  isActive?: boolean
}) {
  const visible = channels.slice(0, 4)
  const count = visible.length
  const avatarSize = splitClusterAvatarSize(count)
  const clusteredRing = isActive ? "ring-sidebar-ring/25" : ringClass

  return (
    <span className="relative size-9 shrink-0 rounded-full">
      {visible.map((channel, index) => (
        <ChannelAvatar
          key={channel.login}
          login={channel.login}
          profileImageUrl={channel.profileImageUrl}
          className={cn(
            avatarSize,
            "absolute ring-2",
            clusteredRing,
            splitClusterAvatarPosition(index, count)
          )}
        />
      ))}
    </span>
  )
}

const sidebarIconButtonClass =
  "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"

function SidebarIconContextMenu({
  label,
  buttonClassName,
  onSelect,
  menu,
  children,
}: {
  label: string
  buttonClassName: string
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
    <ContextMenu onOpenChange={suppressTooltip}>
      <Tooltip open={tooltipOpen} onOpenChange={handleTooltipOpenChange}>
        <ContextMenuTrigger asChild>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={label}
              onClick={onSelect}
              onContextMenu={suppressTooltip}
              onPointerLeave={handlePointerLeave}
              className={buttonClassName}
            >
              {children}
            </button>
          </TooltipTrigger>
        </ContextMenuTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
      {menu}
    </ContextMenu>
  )
}

function ChannelContextMenu({
  login,
  displayName,
  profileImageUrl,
  isActive,
  activeChannelLogin,
  onSelect,
  onRemove,
  onSplit,
}: {
  login: string
  displayName?: string
  profileImageUrl?: string
  isActive: boolean
  activeChannelLogin: string
  onSelect: () => void
  onRemove: () => void
  onSplit: () => void
}) {
  const label = channelLabel(login, displayName)
  const activeLabel = channelLabel(activeChannelLogin)
  const canSplit =
    Boolean(activeChannelLogin) && activeChannelLogin !== login

  return (
    <SidebarIconContextMenu
      label={label}
      onSelect={onSelect}
      buttonClassName={cn(
        sidebarIconButtonClass,
        isActive
          ? "bg-sidebar-accent ring-2 ring-sidebar-ring"
          : "hover:bg-sidebar-accent"
      )}
      menu={
        <ContextMenuContent>
          {canSplit ? (
            <ContextMenuItem onSelect={onSplit}>
              <Columns2Icon />
              Split with {activeLabel}
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
      <ChannelAvatar login={login} profileImageUrl={profileImageUrl} />
    </SidebarIconContextMenu>
  )
}

function SplitContextMenu({
  channels,
  isActive,
  onSelect,
  onUngroup,
  onDelete,
}: {
  channels: Array<{
    login: string
    displayName?: string
    profileImageUrl?: string
  }>
  isActive: boolean
  onSelect: () => void
  onUngroup: () => void
  onDelete: () => void
}) {
  const label = splitGroupLabel(channels)

  return (
    <SidebarIconContextMenu
      label={label}
      onSelect={onSelect}
      buttonClassName={cn(
        sidebarIconButtonClass,
        isActive
          ? "bg-sidebar-ring/25 shadow-[0_0_0_2px_var(--color-sidebar-ring)]"
          : "bg-secondary shadow-[0_0_0_1px_var(--color-sidebar-border)] hover:bg-sidebar-accent hover:shadow-[0_0_0_2px_var(--color-sidebar-ring)]"
      )}
      menu={
        <ContextMenuContent>
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
      <SplitAvatarCluster
        channels={channels}
        isActive={isActive}
        ringClass="ring-secondary"
      />
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

  React.useEffect(() => {
    if (!open) {
      setDraft("")
      setSubmitting(false)
    }
  }, [open])

  const handleSubmit = async () => {
    const value = draft.trim()
    if (!value || submitting) {
      return
    }

    setSubmitting(true)
    try {
      await onAdd(value)
      onOpenChange(false)
    } catch {
      // Caller shows toast
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
  } = usePeeepochatLayout()
  const [addDialogOpen, setAddDialogOpen] = React.useState(false)

  const splitById = React.useMemo(
    () => new Map(savedSplits.map((split) => [split.id, split])),
    [savedSplits]
  )

  const channelByLogin = React.useMemo(
    () => new Map(channels.map((channel) => [channel.login, channel])),
    [channels]
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
      toast.success(`Added #${login.replace(/^#/, "").toLowerCase()}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add channel")
      throw error
    }
  }

  const handleSplitWith = (login: string) => {
    if (isSplitView) {
      addSplitChannel(login)
      toast.success(`Added #${login} to split`)
      return
    }

    if (!activeChannelLogin || activeChannelLogin === login) {
      return
    }

    openSplitView([activeChannelLogin, login])
    toast.success(`Split view: #${activeChannelLogin} + #${login}`)
  }

  const handleDeleteSplit = (splitChannels: string[]) => {
    for (const login of splitChannels) {
      removeChannel(login)
    }
    toast.info("Split deleted")
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
        className="top-12 h-[calc(100svh-3rem)] border-r border-sidebar-border"
      >
        <SidebarContent className="overflow-x-hidden overflow-y-auto">
          <SidebarGroup className="px-2 py-3">
            <SidebarGroupContent>
              <SortableSidebarList
                itemIds={sidebarEntries.map((entry) => entry.key)}
                onReorder={reorderSidebar}
                className="items-center gap-3"
              >
                {(itemId) => {
                  const entry = sidebarEntries.find((e) => e.key === itemId)
                  if (!entry) {
                    return null
                  }

                  if (entry.kind === "split") {
                    return (
                      <div className="flex w-full items-center justify-center">
                        <SplitContextMenu
                          channels={entry.channels}
                          isActive={
                            isSplitView && activeSplitId === entry.split.id
                          }
                          onSelect={() => selectSplit(entry.split.id)}
                          onUngroup={() => {
                            unsplit(entry.split.id)
                            toast.info("Split ungrouped")
                          }}
                          onDelete={() =>
                            handleDeleteSplit(entry.split.channels)
                          }
                        />
                      </div>
                    )
                  }

                  return (
                    <div className="flex w-full items-center justify-center">
                      <ChannelContextMenu
                        login={entry.channel.login}
                        displayName={entry.channel.displayName}
                        profileImageUrl={entry.channel.profileImageUrl}
                        isActive={
                          !isSplitView &&
                          entry.channel.login === activeChannelLogin
                        }
                        activeChannelLogin={activeChannelLogin}
                        onSelect={() => setActiveChannel(entry.channel.login)}
                        onRemove={() => {
                          removeChannel(entry.channel.login)
                          toast.info(`Removed #${entry.channel.login}`)
                        }}
                        onSplit={() => handleSplitWith(entry.channel.login)}
                      />
                    </div>
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
