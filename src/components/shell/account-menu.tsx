import * as React from "react"
import { ChevronDownIcon, LogOutIcon, UserIcon } from "lucide-react"

import { usePeepochatSettings } from "@/lib/peepochat/peepochat-context"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"

export function AccountMenu() {
  const { account, oauthBusy, isOAuthConfigured, loginWithTwitch, logout } =
    usePeepochatSettings()

  const [open, setOpen] = React.useState(false)

  const handleLogout = () => {
    logout()
    setOpen(false)
  }

  if (!account) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={loginWithTwitch}
        disabled={oauthBusy || !isOAuthConfigured}
      >
        <UserIcon className="size-3.5" />
        Sign in with Twitch
      </Button>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={oauthBusy}
          className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2 py-1 text-sm transition-colors hover:bg-muted/40"
        >
          <img
            src={account.profileImageUrl}
            alt=""
            className="size-6 shrink-0 rounded-full object-cover"
          />
          <span className="hidden max-w-32 truncate font-medium sm:inline">
            {account.displayName}
          </span>
          <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        className="w-80 overflow-hidden p-0"
      >
        <div className="relative h-32 overflow-hidden bg-muted">
          {account.bannerImageUrl ? (
            <img
              src={account.bannerImageUrl}
              alt=""
              className="size-full object-cover brightness-[0.50] saturate-95"
            />
          ) : (
            <div className="size-full bg-linear-to-br from-primary/40 via-primary/20 to-background" />
          )}

          <div
            className="pointer-events-none absolute inset-0 bg-black/15"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent via-black/20 to-popover"
            aria-hidden
          />

          <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 px-4 pb-3">
            <img
              src={account.profileImageUrl}
              alt=""
              className="size-14 shrink-0 rounded-full border-2 border-popover/90 object-cover shadow-sm"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold text-foreground">
                {account.displayName}
              </div>
              <div className="truncate font-mono text-xs text-muted-foreground">
                ID {account.id}
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-3">
          <Separator className="mb-3" />

          <Button
            variant="outline"
            size="sm"
            className={cn("w-full justify-start")}
            onClick={handleLogout}
          >
            <LogOutIcon className="size-3.5" />
            Log out
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
