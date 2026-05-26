import * as React from "react"
import { Columns2Icon, PlusIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { SortableSidebarList } from "@/components/channel-sidebar-list"
import { preventRowDrag } from "@/components/sortable-sidebar-utils"
import { usePeeepochat } from "@/lib/peepochat-context"
import { CHANNEL_ORDER_PREFIX, SPLIT_ORDER_PREFIX } from "@/lib/sidebar-order"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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
  SidebarHeader,
  SidebarMenuButton,
  useSidebar,
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
    "size-10 shrink-0 rounded-full object-cover aspect-square cursor-pointer",
    className
  )

  if (profileImageUrl) {
    return <img src={profileImageUrl} alt="" className={classes} />
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
  size = "md",
  variant = "inline",
  ringClass = "ring-sidebar",
  isActive = false,
}: {
  channels: Array<{
    login: string
    profileImageUrl?: string
  }>
  size?: "md" | "sm"
  variant?: "inline" | "clustered"
  ringClass?: string
  isActive?: boolean
}) {
  const visible = channels.slice(0, 4)
  const count = visible.length

  if (variant === "clustered") {
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

  const avatarSize = size === "sm" ? "size-7" : "size-8"

  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center",
        size === "sm"
          ? "h-8 w-[calc(1.75rem+0.5rem*var(--n))]"
          : "h-10 w-[calc(2rem+0.55rem*var(--n))]"
      )}
      style={
        { "--n": Math.max(visible.length - 1, 0) } as React.CSSProperties
      }
    >
      {visible.map((channel, index) => (
        <ChannelAvatar
          key={channel.login}
          login={channel.login}
          profileImageUrl={channel.profileImageUrl}
          className={cn(
            avatarSize,
            "absolute top-1/2 -translate-y-1/2 ring-2",
            ringClass,
            index === 0 && "left-0 z-4",
            index === 1 && "left-[0.55rem] z-3",
            index === 2 && "left-[1.1rem] z-2",
            index === 3 && "left-[1.65rem] z-1"
          )}
        />
      ))}
    </span>
  )
}

function CollapsedChannelButton({
  login,
  displayName,
  profileImageUrl,
  isActive,
  onSelect,
}: {
  login: string
  displayName?: string
  profileImageUrl?: string
  isActive: boolean
  onSelect: () => void
}) {
  const label = channelLabel(login, displayName)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onSelect}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full outline-none transition-colors",
            "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            "cursor-inherit",
            isActive
              ? "bg-sidebar-accent ring-2 ring-sidebar-ring"
              : "hover:bg-sidebar-accent"
          )}
        >
          <ChannelAvatar login={login} profileImageUrl={profileImageUrl} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

function SortableRowContent({ children }: { children: React.ReactNode }) {
  const { state } = useSidebar()
  const collapsed = state === "collapsed"

  if (!collapsed) {
    return children
  }

  return (
    <div className="flex w-full items-center justify-center">{children}</div>
  )
}

function CollapsedSplitButton({
  channels,
  isActive,
  onSelect,
}: {
  channels: Array<{
    login: string
    displayName?: string
    profileImageUrl?: string
  }>
  isActive: boolean
  onSelect: () => void
}) {
  const label = splitGroupLabel(channels)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onSelect}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full outline-none transition-[background-color,box-shadow]",
            "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            "cursor-inherit",
            isActive
              ? "bg-sidebar-ring/25 shadow-[0_0_0_2px_var(--color-sidebar-ring)]"
              : "bg-secondary shadow-[0_0_0_1px_var(--color-sidebar-border)] hover:bg-sidebar-accent hover:shadow-[0_0_0_2px_var(--color-sidebar-ring)]"
          )}
        >
          <SplitAvatarCluster
            channels={channels}
            size="sm"
            variant="clustered"
            isActive={isActive}
            ringClass="ring-secondary"
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

function ChannelMenuButton({
  login,
  displayName,
  profileImageUrl,
  isActive,
  onSelect,
  onRemove,
  onSplit,
  showSplitAction,
}: {
  login: string
  displayName?: string
  profileImageUrl?: string
  isActive: boolean
  onSelect: () => void
  onRemove: () => void
  onSplit?: () => void
  showSplitAction?: boolean
}) {
  const { state } = useSidebar()
  const collapsed = state === "collapsed"

  if (collapsed) {
    return (
      <CollapsedChannelButton
        login={login}
        displayName={displayName}
        profileImageUrl={profileImageUrl}
        isActive={isActive}
        onSelect={onSelect}
      />
    )
  }

  const label = channelLabel(login, displayName)

  return (
    <SidebarMenuButton
      isActive={isActive}
      onClick={onSelect}
      className="group/channel relative h-10 w-full cursor-inherit"
    >
        <ChannelAvatar
          login={login}
          profileImageUrl={profileImageUrl}
          className="size-8"
        />
        <span className="truncate font-medium">{label}</span>
        <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 group-hover/channel:flex">
        {showSplitAction && onSplit ? (
          <button
            type="button"
            aria-label={`Split with ${label}`}
            className="flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onPointerDown={preventRowDrag}
            onClick={(event) => {
              event.stopPropagation()
              onSplit()
            }}
          >
            <Columns2Icon className="size-3" />
          </button>
        ) : null}
        <button
          type="button"
          aria-label={`Remove ${label}`}
          className="flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          onPointerDown={preventRowDrag}
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
        >
          <XIcon className="size-3" />
        </button>
      </div>
    </SidebarMenuButton>
  )
}

function SplitMenuButton({
  channels,
  isActive,
  onSelect,
  onUnsplit,
}: {
  channels: Array<{
    login: string
    displayName?: string
    profileImageUrl?: string
  }>
  isActive: boolean
  onSelect: () => void
  onUnsplit: () => void
}) {
  const { state } = useSidebar()
  const collapsed = state === "collapsed"

  if (collapsed) {
    return (
      <CollapsedSplitButton
        channels={channels}
        isActive={isActive}
        onSelect={onSelect}
      />
    )
  }

  const label = splitGroupLabel(channels)

  return (
    <SidebarMenuButton
      isActive={isActive}
      onClick={onSelect}
      className="group/split relative h-10 w-full cursor-inherit"
    >
      <SplitAvatarCluster channels={channels} />
      <span className="truncate font-medium">{label}</span>
      <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 group-hover/split:flex">
        <button
          type="button"
          aria-label={`Unsplit ${label}`}
          className="flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          onPointerDown={preventRowDrag}
          onClick={(event) => {
            event.stopPropagation()
            onUnsplit()
          }}
        >
          <XIcon className="size-3" />
        </button>
      </div>
    </SidebarMenuButton>
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
  } = usePeeepochat()
  const { state } = useSidebar()
  const collapsed = state === "collapsed"
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

  const addButton = (
    <Button
      variant="outline"
      size={collapsed ? "icon" : "sm"}
      className={cn(collapsed ? "size-11 shrink-0" : "w-full")}
      onClick={() => setAddDialogOpen(true)}
    >
      <PlusIcon className="size-4 shrink-0" />
      {!collapsed && <span>Add channel</span>}
    </Button>
  )

  return (
    <>
      <Sidebar
        collapsible="icon"
        className="top-12 h-[calc(100svh-3rem)] border-r border-sidebar-border"
      >
        <SidebarHeader className="px-2 py-3 group-data-[collapsible=icon]:hidden">
          <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Channels
          </p>
        </SidebarHeader>

        <SidebarContent className="group-data-[collapsible=icon]:overflow-y-auto group-data-[collapsible=icon]:overflow-x-hidden">
          <SidebarGroup className="group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-3">
            <SidebarGroupContent>
              <SortableSidebarList
                itemIds={sidebarEntries.map((entry) => entry.key)}
                onReorder={reorderSidebar}
                className="group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-3"
              >
                {(itemId) => {
                  const entry = sidebarEntries.find((e) => e.key === itemId)
                  if (!entry) {
                    return null
                  }

                  if (entry.kind === "split") {
                    return (
                      <SortableRowContent>
                        <SplitMenuButton
                          channels={entry.channels}
                          isActive={
                            isSplitView && activeSplitId === entry.split.id
                          }
                          onSelect={() => selectSplit(entry.split.id)}
                          onUnsplit={() => {
                            unsplit(entry.split.id)
                            toast.info("Split removed")
                          }}
                        />
                      </SortableRowContent>
                    )
                  }

                  return (
                    <SortableRowContent>
                      <ChannelMenuButton
                      login={entry.channel.login}
                      displayName={entry.channel.displayName}
                      profileImageUrl={entry.channel.profileImageUrl}
                      isActive={
                        !isSplitView &&
                        entry.channel.login === activeChannelLogin
                      }
                      onSelect={() => setActiveChannel(entry.channel.login)}
                      onRemove={() => {
                        removeChannel(entry.channel.login)
                        toast.info(`Removed #${entry.channel.login}`)
                      }}
                      showSplitAction={Boolean(
                        activeChannelLogin &&
                          entry.channel.login !== activeChannelLogin
                      )}
                      onSplit={() => handleSplitWith(entry.channel.login)}
                    />
                    </SortableRowContent>
                  )
                }}
              </SortableSidebarList>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter
          className={cn(
            "p-2",
            collapsed && "flex items-center justify-center"
          )}
        >
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>{addButton}</TooltipTrigger>
              <TooltipContent side="right">Add channel</TooltipContent>
            </Tooltip>
          ) : (
            addButton
          )}
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
