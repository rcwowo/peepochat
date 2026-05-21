import * as React from "react"
import { PlusIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { useChatvoice } from "@/lib/chatvoice-context"
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
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
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
    "size-10 shrink-0 rounded-full object-cover aspect-square",
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

function ChannelMenuButton({
  login,
  displayName,
  profileImageUrl,
  isActive,
  onSelect,
  onRemove,
}: {
  login: string
  displayName?: string
  profileImageUrl?: string
  isActive: boolean
  onSelect: () => void
  onRemove: () => void
}) {
  const { state, isMobile } = useSidebar()
  const collapsed = state === "collapsed" && !isMobile

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
      className="group/channel relative h-10"
    >
      <ChannelAvatar
        login={login}
        profileImageUrl={profileImageUrl}
        className="size-8"
      />
      <span className="truncate font-medium">{label}</span>
      <button
        type="button"
        aria-label={`Remove ${label}`}
        className="absolute right-1 top-1/2 hidden size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground group-hover/channel:flex"
        onClick={(event) => {
          event.stopPropagation()
          onRemove()
        }}
      >
        <XIcon className="size-3" />
      </button>
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
  } = useChatvoice()
  const { state, isMobile } = useSidebar()
  const collapsed = state === "collapsed" && !isMobile
  const [addDialogOpen, setAddDialogOpen] = React.useState(false)

  const handleAddChannel = async (login: string) => {
    try {
      await addChannel(login)
      toast.success(`Added #${login.replace(/^#/, "").toLowerCase()}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add channel")
      throw error
    }
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
              <SidebarMenu
                className={cn(
                  "group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-3"
                )}
              >
                {channels.map((channel) => (
                  <SidebarMenuItem
                    key={channel.login}
                    className="group-data-[collapsible=icon]:w-auto"
                  >
                    <ChannelMenuButton
                      login={channel.login}
                      displayName={channel.displayName}
                      profileImageUrl={channel.profileImageUrl}
                      isActive={channel.login === activeChannelLogin}
                      onSelect={() => setActiveChannel(channel.login)}
                      onRemove={() => {
                        removeChannel(channel.login)
                        toast.info(`Removed #${channel.login}`)
                      }}
                    />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
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
