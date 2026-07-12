import iconSrc from "/branding/icon.svg"
import logoSrc from "/branding/full-logo.svg"
import { AccountMenu } from "@/components/shell/account-menu"
import { NotificationCenter } from "@/components/shell/notification-center"
import { useNotificationDocumentIndicators } from "@/hooks/use-notification-document-indicators"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { PanelLeftIcon } from "lucide-react"

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
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-sidebar px-4">
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
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
        <img
          src={iconSrc}
          alt="Peepochat"
          className="size-6 brand-mark sm:hidden"
        />
        <img
          src={logoSrc}
          alt="Peepochat"
          className="hidden h-6 w-auto brand-mark sm:block"
        />
      </div>
      <div className="flex items-center gap-3">
        <AccountMenu onSettingsClick={onSettingsClick} />

        <NotificationCenter />
      </div>
    </header>
  )
}
