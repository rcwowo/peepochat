import { PanelLeftIcon, SettingsIcon } from "lucide-react"

import { AccountMenu } from "@/components/shell/account-menu"
import { ChannelSearch } from "@/components/shell/channel-search"
import { NotificationCenter } from "@/components/shell/notification-center"
import { useNotificationDocumentIndicators } from "@/hooks/use-notification-document-indicators"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function AppHeader({
  onSettingsClick,
  channelSidebarVisible,
  onChannelSidebarToggle,
}: {
  onSettingsClick: () => void
  channelSidebarVisible: boolean
  onChannelSidebarToggle: () => void
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
              onClick={onChannelSidebarToggle}
              aria-pressed={channelSidebarVisible}
            >
              <PanelLeftIcon className="size-4" />
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
        <NotificationCenter />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={onSettingsClick}
              aria-label="Settings"
            >
              <SettingsIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}
