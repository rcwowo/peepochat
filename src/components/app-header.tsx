import * as React from "react"
import { CircleIcon, LogOutIcon, SettingsIcon } from "lucide-react"
import { toast } from "sonner"

import logoSrc from "/logo.png"
import { useChatvoice } from "@/lib/chatvoice-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function AppHeader({
  onSettingsClick,
}: {
  onSettingsClick: () => void
}) {
  const {
    config,
    updateConfig,
    connectionState,
    startConnection,
    stopConnection,
  } = useChatvoice()

  const connected = connectionState?.connected ?? false
  const channel = connectionState?.channel
  const [popoverOpen, setPopoverOpen] = React.useState(false)
  const popoverRef = React.useRef<HTMLDivElement>(null)

  // Close popover on outside click
  React.useEffect(() => {
    if (!popoverOpen) return
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setPopoverOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [popoverOpen])

  const handleConnect = () => {
    const ch = config.twitch.channel.trim()
    if (!ch) return
    setPopoverOpen(false)
    toast.promise(startConnection(ch), {
      loading: `Connecting to #${ch}…`,
      success: (channel) => `Connected to #${channel}`,
      error: (err) =>
        err instanceof Error ? err.message : "Connection failed",
    })
  }

  const handleDisconnect = () => {
    stopConnection()
    toast.info("Disconnected from Twitch chat.")
    setPopoverOpen(false)
  }

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex items-center gap-2">
        <img src={logoSrc} alt="Peepochat" className="h-6 w-auto dark:invert" />
      </div>
      <div className="flex items-center gap-3">
        <div className="relative" ref={popoverRef}>
          <button
            type="button"
            onClick={() => setPopoverOpen(!popoverOpen)}
            className={`flex items-center gap-2 rounded-md px-2.5 py-1 border text-sm text-muted-foreground transition-colors cursor-pointer ${
              connected ? "border-green-500/50 bg-green-500/10 hover:bg-green-500/30" : "border-muted/50 hover:bg-muted/30"
            }`}
          >
            <CircleIcon
              className={`size-2.5 shrink-0 fill-current ${
                connected ? "text-green-500" : "text-muted-foreground/50"
              }`}
            />
            <span className={`hidden truncate sm:inline ${
              connected ? "text-green-500" : "text-muted-foreground/50"
            }`}>
              {connected ? "Connected" : "Disconnected"}
            </span>
          </button>

          {popoverOpen && (
            <div className="absolute top-full right-0 z-50 mt-1.5 w-72 rounded-lg border border-border bg-popover p-3 shadow-lg">
              {connected ? (
                <div className="space-y-3">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Connected to </span>
                    <span className="font-medium">#{channel}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={handleDisconnect}
                  >
                    <LogOutIcon className="size-3.5" />
                    Disconnect
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    Connect to a Twitch channel
                  </div>
                  <Input
                    value={config.twitch.channel}
                    onChange={(e) =>
                      updateConfig((current) => ({
                        ...current,
                        twitch: { ...current.twitch, channel: e.target.value },
                      }))
                    }
                    placeholder="Channel name"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleConnect()
                    }}
                  />
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={handleConnect}
                    disabled={!config.twitch.channel.trim()}
                  >
                    Connect
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

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
