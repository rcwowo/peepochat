import logoSrc from "/logo.svg"
import { AccountMenu } from "@/components/shell/account-menu"
import { NotificationCenter } from "@/components/shell/notification-center"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { SettingsIcon } from "lucide-react"

export function AppHeader({
  onSettingsClick,
}: {
  onSettingsClick: () => void
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-sidebar px-4">
      <div className="flex items-center gap-2">
        <img src={logoSrc} alt="Peepochat" className="brand-mark h-6 w-auto" />
      </div>
      <div className="flex items-center gap-3">
        <AccountMenu />

        <NotificationCenter />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" onClick={onSettingsClick}>
              <SettingsIcon className="size-4" />
              <span className="sr-only">Settings</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}
