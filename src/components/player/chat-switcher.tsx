import { ChevronDownIcon, MessagesSquareIcon } from "lucide-react"

import { WatchChannelAvatar } from "@/components/player/watch-channel-avatar"
import { useWatchedChannel } from "@/hooks/player/use-watched-channel"
import { formatViewerCount } from "@/lib/twitch/channel/stream-display"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type ChatSwitcherConfig = {
  logins: string[]
  selectedLogin: string | null
  onSelect: (login: string) => void
}

function ChatSwitcherItem({ login }: { login: string }) {
  const { displayName, profileImageUrl, stream } = useWatchedChannel(login)

  return (
    <DropdownMenuRadioItem value={login}>
      <WatchChannelAvatar login={login} profileImageUrl={profileImageUrl} />
      <span className="min-w-0 flex-1 truncate">{displayName}</span>
      {stream ? (
        <span className="shrink-0 text-xs text-red-500 tabular-nums">
          {formatViewerCount(stream.viewerCount)}
        </span>
      ) : null}
    </DropdownMenuRadioItem>
  )
}

export function ChatSwitcherMenu({
  logins,
  selectedLogin,
  onSelect,
}: ChatSwitcherConfig) {
  if (logins.length < 2) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="gap-0.5 px-1 text-muted-foreground hover:text-foreground aria-expanded:bg-foreground/10 aria-expanded:text-foreground"
          aria-label="Switch chat"
        >
          <MessagesSquareIcon className="size-3.5" aria-hidden />
          <ChevronDownIcon className="size-3" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Show chat for</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={selectedLogin ?? ""}
          onValueChange={onSelect}
        >
          {logins.map((login) => (
            <ChatSwitcherItem key={login} login={login} />
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
