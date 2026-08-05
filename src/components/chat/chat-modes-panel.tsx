import * as React from "react"
import { SwordsIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CHAT_COMMAND_SCOPES } from "@/lib/chat/chat-command-scopes"
import {
  DEFAULT_FOLLOWERS_ONLY_MINUTES,
  DEFAULT_SLOW_MODE_SECONDS,
  durationOptionsWithCurrent,
  FOLLOWERS_ONLY_DURATION_OPTIONS,
  formatFollowersOnlyDuration,
  formatSlowModeDuration,
  SLOW_MODE_DURATION_OPTIONS,
  type TwitchChatModes,
} from "@/lib/chat/chat-modes"
import {
  actorCanModerate,
  hasModerationScope,
} from "@/lib/chat/moderation-permissions"
import { useChannelRoom } from "@/hooks/chat-ui/use-channel-room"
import type { TwitchAccount } from "@/lib/peepochat/peepochat-config"
import type { TwitchSelfChatState } from "@/lib/twitch/twitch-chat-types"
import { updateTwitchChatSettings } from "@/lib/twitch/twitch-api"
import { cn } from "@/lib/utils"

type ChatModesMenuProps = {
  channelLogin: string
  channelRoomId: string | null
  account: TwitchAccount | null
  selfChatState: TwitchSelfChatState | null
}

type ModeKey =
  "emoteOnly" | "subscribersOnly" | "followersOnly" | "slowMode" | "uniqueMode"

const MODE_ROWS: { key: ModeKey; label: string }[] = [
  { key: "emoteOnly", label: "Emote only" },
  { key: "subscribersOnly", label: "Subscribers only" },
  { key: "followersOnly", label: "Followers only" },
  { key: "slowMode", label: "Slow mode" },
  { key: "uniqueMode", label: "Unique mode" },
]

function ChatModesPanel({
  modes,
  disabled,
  pending,
  followersDuration,
  slowDuration,
  onToggleMode,
  onFollowersDurationChange,
  onSlowDurationChange,
}: {
  modes: TwitchChatModes
  disabled: boolean
  pending: boolean
  followersDuration: number
  slowDuration: number
  onToggleMode: (key: ModeKey, enabled: boolean) => void
  onFollowersDurationChange: (minutes: number) => void
  onSlowDurationChange: (seconds: number) => void
}) {
  const followersOptions = durationOptionsWithCurrent(
    FOLLOWERS_ONLY_DURATION_OPTIONS,
    followersDuration,
    formatFollowersOnlyDuration
  )
  const slowOptions = durationOptionsWithCurrent(
    SLOW_MODE_DURATION_OPTIONS,
    slowDuration,
    formatSlowModeDuration
  )

  return (
    <div>
      <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">
        Chat modes
      </div>
      <div>
        {MODE_ROWS.map((row) => (
          <label
            key={row.key}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1",
              disabled || pending
                ? "cursor-not-allowed opacity-60"
                : "hover:bg-foreground/10"
            )}
          >
            <Checkbox
              checked={modes[row.key]}
              disabled={disabled || pending}
              className="size-3.5"
              onCheckedChange={(value) => onToggleMode(row.key, value === true)}
            />
            <span className="text-sm leading-none">{row.label}</span>
          </label>
        ))}
      </div>
      <div className="-mx-1 my-1 h-px bg-border" />
      <div className="space-y-1.5 px-1.5 py-1">
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">
            Followers only duration
          </div>
          <Select
            value={String(followersDuration)}
            disabled={disabled || pending}
            onValueChange={(value) => onFollowersDurationChange(Number(value))}
          >
            <SelectTrigger size="sm" className="h-7 w-full bg-muted/30">
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              align="start"
              position="popper"
              className="z-80 min-w-(--radix-select-trigger-width)"
            >
              {followersOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">
            Slow mode duration
          </div>
          <Select
            value={String(slowDuration)}
            disabled={disabled || pending}
            onValueChange={(value) => onSlowDurationChange(Number(value))}
          >
            <SelectTrigger size="sm" className="h-7 w-full bg-muted/30">
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              align="start"
              position="popper"
              className="z-80 min-w-(--radix-select-trigger-width)"
            >
              {slowOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

export function ChatModesMenu({
  channelLogin,
  channelRoomId,
  account,
  selfChatState,
}: ChatModesMenuProps) {
  const room = useChannelRoom(channelLogin)
  const modes = room?.chatModes
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [preferredFollowersDuration, setPreferredFollowersDuration] =
    React.useState(DEFAULT_FOLLOWERS_ONLY_MINUTES)
  const [preferredSlowDuration, setPreferredSlowDuration] = React.useState(
    DEFAULT_SLOW_MODE_SECONDS
  )

  const canManage = actorCanModerate(
    account,
    channelRoomId,
    selfChatState,
    channelLogin
  )
  const hasScope = hasModerationScope(account, CHAT_COMMAND_SCOPES.chatSettings)

  const followersDuration = modes?.followersOnly
    ? modes.followersOnlyMinutes
    : preferredFollowersDuration
  const slowDuration = modes?.slowMode
    ? modes.slowModeSeconds || DEFAULT_SLOW_MODE_SECONDS
    : preferredSlowDuration

  const applySettings = React.useCallback(
    async (
      settings: Parameters<typeof updateTwitchChatSettings>[0]["settings"]
    ) => {
      if (!account || !channelRoomId) {
        toast.error("Channel is still connecting.")
        return
      }
      if (!hasScope) {
        toast.error(
          `Missing permission (${CHAT_COMMAND_SCOPES.chatSettings}). Sign out and sign back in to grant updated scopes.`
        )
        return
      }

      setPending(true)
      try {
        await updateTwitchChatSettings({
          broadcasterId: channelRoomId,
          moderatorId: account.id,
          accessToken: account.accessToken,
          clientId: account.clientId,
          settings,
        })
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not update chat settings."
        )
      } finally {
        setPending(false)
      }
    },
    [account, channelRoomId, hasScope]
  )

  const onToggleMode = React.useCallback(
    (key: ModeKey, enabled: boolean) => {
      switch (key) {
        case "emoteOnly":
          void applySettings({ emoteMode: enabled })
          break
        case "subscribersOnly":
          void applySettings({ subscriberMode: enabled })
          break
        case "uniqueMode":
          void applySettings({ uniqueChatMode: enabled })
          break
        case "followersOnly":
          void applySettings(
            enabled
              ? {
                  followerMode: true,
                  followerModeDuration: followersDuration,
                }
              : { followerMode: false }
          )
          break
        case "slowMode":
          void applySettings(
            enabled
              ? {
                  slowMode: true,
                  slowModeWaitTime: slowDuration,
                }
              : { slowMode: false }
          )
          break
      }
    },
    [applySettings, followersDuration, slowDuration]
  )

  const onFollowersDurationChange = React.useCallback(
    (minutes: number) => {
      setPreferredFollowersDuration(minutes)
      if (modes?.followersOnly) {
        void applySettings({
          followerMode: true,
          followerModeDuration: minutes,
        })
      }
    },
    [applySettings, modes?.followersOnly]
  )

  const onSlowDurationChange = React.useCallback(
    (seconds: number) => {
      setPreferredSlowDuration(seconds)
      if (modes?.slowMode) {
        void applySettings({
          slowMode: true,
          slowModeWaitTime: seconds,
        })
      }
    },
    [applySettings, modes?.slowMode]
  )

  if (!canManage || !modes) {
    return null
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-foreground data-[state=open]:text-foreground"
          aria-label="Chat modes"
        >
          <SwordsIcon className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={4}
        className="relative w-44 border-0 bg-popover/70 p-1 shadow-md ring-1 ring-foreground/10 before:pointer-events-none before:absolute before:inset-0 before:-z-1 before:rounded-[inherit] before:backdrop-blur-2xl before:backdrop-saturate-150"
      >
        <ChatModesPanel
          modes={modes}
          disabled={!channelRoomId}
          pending={pending}
          followersDuration={followersDuration}
          slowDuration={slowDuration}
          onToggleMode={onToggleMode}
          onFollowersDurationChange={onFollowersDurationChange}
          onSlowDurationChange={onSlowDurationChange}
        />
      </PopoverContent>
    </Popover>
  )
}
