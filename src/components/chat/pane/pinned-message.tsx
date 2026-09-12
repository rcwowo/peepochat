import * as React from "react"
import { PinIcon, PinOffIcon } from "lucide-react"
import { toast } from "sonner"

import { ChatMessageRow } from "@/components/chat/message/row"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { canPinMessageInChannel } from "@/lib/chat/moderation/permissions"
import type { ChatBadgeCatalog } from "@/lib/chat/presentation/badges"
import type {
  DeletedMessagesBehavior,
  MessageTimestampFormat,
  TwitchAccount,
} from "@/lib/peepochat/peepochat-config"
import { usePeepochatChat } from "@/lib/peepochat/peepochat-context"
import type { ResolvedMemberBadge } from "@/lib/rcw/badges"
import { TwitchApiError, unpinTwitchChatMessage } from "@/lib/twitch/auth/api"
import type { TwitchSelfChatState } from "@/lib/twitch/chat/types"
import type { ChannelPinnedMessage } from "@/lib/twitch/chat/pins"

const PINNED_QUICK_ACTIONS = {
  copyEnabled: false,
  replyEnabled: false,
  pinEnabled: false,
  deleteEnabled: false,
  timeoutEnabled: false,
  banEnabled: false,
}

function formatPinRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) {
    return `${seconds}s`
  }
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`
}

function usePinRemainingLabel(endsAt: string | null): string | null {
  const [now, setNow] = React.useState(() => Date.now())

  React.useEffect(() => {
    if (!endsAt) {
      return
    }

    const interval = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(interval)
    }
  }, [endsAt])

  if (!endsAt) {
    return null
  }

  const expiresAt = Date.parse(endsAt)
  if (!Number.isFinite(expiresAt)) {
    return null
  }

  return formatPinRemaining(expiresAt - now)
}

export function ChatPinnedMessageBar({
  pin,
  timestampFormat,
  deletedMessagesBehavior,
  account,
  channelRoomId,
  selfChatState,
  badgeCatalog,
  getMemberBadge,
  showBadgeFallback,
  showTwitchBadges,
  showMemberBadges,
}: {
  pin: ChannelPinnedMessage
  timestampFormat: MessageTimestampFormat
  deletedMessagesBehavior: DeletedMessagesBehavior
  account: TwitchAccount | null
  channelRoomId: string | null
  selfChatState: TwitchSelfChatState | null
  badgeCatalog: ChatBadgeCatalog
  getMemberBadge: (userId: string | null) => ResolvedMemberBadge | null
  showBadgeFallback: boolean
  showTwitchBadges: boolean
  showMemberBadges: boolean
}) {
  const remaining = usePinRemainingLabel(pin.endsAt)
  const pinnedBy = pin.pinnedByUserName || pin.pinnedByUserLogin
  const { clearPinnedMessage } = usePeepochatChat()
  const [unpinPending, setUnpinPending] = React.useState(false)
  const unpinPendingRef = React.useRef(false)
  const canUnpin = canPinMessageInChannel({
    account,
    broadcasterId: channelRoomId,
    channelLogin: pin.message.channel,
    selfState: selfChatState,
  })

  const unpinMessage = React.useCallback(async () => {
    if (!account || !channelRoomId || unpinPendingRef.current) {
      return
    }

    unpinPendingRef.current = true
    setUnpinPending(true)
    try {
      try {
        await unpinTwitchChatMessage({
          broadcasterId: channelRoomId,
          moderatorId: account.id,
          messageId: pin.message.id,
          accessToken: account.accessToken,
          clientId: account.clientId,
        })
      } catch (error) {
        if (!(error instanceof TwitchApiError && error.status === 404)) {
          toast.error(
            error instanceof Error ? error.message : "Could not unpin message."
          )
          return
        }
      }
      clearPinnedMessage(pin.message.channel)
      toast.success("Message unpinned.")
    } finally {
      unpinPendingRef.current = false
      setUnpinPending(false)
    }
  }, [
    account,
    channelRoomId,
    clearPinnedMessage,
    pin.message.channel,
    pin.message.id,
  ])

  return (
    <div className="absolute inset-x-2 top-2 z-20 overflow-hidden rounded-md border border-border bg-background shadow-md">
      <div className="flex items-center gap-2 px-3 py-1 text-xs font-medium text-muted-foreground">
        <PinIcon className="size-3.5 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 truncate">
          {pinnedBy ? `Pinned by ${pinnedBy}` : "Pinned message"}
        </span>
        {remaining || canUnpin ? (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {remaining ? (
              <span className="tabular-nums">{remaining}</span>
            ) : null}
            {canUnpin ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Unpin message"
                      className="text-muted-foreground hover:text-foreground"
                      disabled={unpinPending}
                      onClick={() => void unpinMessage()}
                    >
                      <PinOffIcon className="size-3.5" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Unpin message</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="max-h-32 overflow-y-auto py-1">
        <ChatMessageRow
          message={pin.message}
          timestampFormat={timestampFormat}
          messageQuickActions={PINNED_QUICK_ACTIONS}
          deletedMessagesBehavior={deletedMessagesBehavior}
          account={account}
          channelRoomId={channelRoomId}
          selfChatState={selfChatState}
          badgeCatalog={badgeCatalog}
          getMemberBadge={getMemberBadge}
          showBadgeFallback={showBadgeFallback}
          showTwitchBadges={showTwitchBadges}
          showMemberBadges={showMemberBadges}
        />
      </div>
    </div>
  )
}
