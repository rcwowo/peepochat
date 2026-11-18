import { PanelLeftIcon, SettingsIcon } from "lucide-react"

import { AccountMenu } from "@/components/shell/account-menu"
import { ChannelSearch } from "@/components/shell/channel-search"
import { NotificationCenter } from "@/components/shell/notification-center"
import { useNotificationDocumentIndicators } from "@/hooks/use-notification-document-indicators"
import { AltHint } from "@/components/ui/alt-hint"
import { Button } from "@/components/ui/button"
import { getAltHintKey } from "@/lib/hotkeys/alt-hints"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function AppHeader({
  onSettingsClick,
  channelSidebarVisible,
  onChannelSidebarToggle,
  notificationsOpen,
  onNotificationsOpenChange,
}: {
  onSettingsClick: () => void
  channelSidebarVisible: boolean
  onChannelSidebarToggle: () => void
  notificationsOpen: boolean
  onNotificationsOpenChange: (open: boolean) => void
}) {
  useNotificationDocumentIndicators()

  return (
    <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border bg-sidebar p-2">
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              className="relative"
              onClick={onChannelSidebarToggle}
              aria-pressed={channelSidebarVisible}
            >
              <PanelLeftIcon className="size-4" />
              <AltHint
                label={getAltHintKey("sidebar.toggle")}
                className="-right-1.5 -bottom-1.5"
              />
              <span className="sr-only">
                {channelSidebarVisible
                  ? "Hide channel sidebar"
                  : "Show channel sidebar"}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {channelSidebarVisible
              ? "Hide channel sidebar"
              : "Show channel sidebar"}
          </TooltipContent>
        </Tooltip>
        <AccountMenu />
      </div>
      <div className="flex items-center gap-2">
        <ChannelSearch />
        <NotificationCenter
          open={notificationsOpen}
          onOpenChange={onNotificationsOpenChange}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              className="relative"
              onClick={onSettingsClick}
              aria-label="Settings"
            >
              <SettingsIcon className="size-4" />
              <AltHint
                label={getAltHintKey("settings.open")}
                className="-right-1.5 -bottom-1.5"
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}
