export type TwitchChatModes = {
  emoteOnly: boolean
  subscribersOnly: boolean
  followersOnly: boolean
  followersOnlyMinutes: number
  slowMode: boolean
  slowModeSeconds: number
  uniqueMode: boolean
}

export type TwitchChatModesPatch = Partial<TwitchChatModes>

export const DEFAULT_CHAT_MODES: TwitchChatModes = {
  emoteOnly: false,
  subscribersOnly: false,
  followersOnly: false,
  followersOnlyMinutes: 0,
  slowMode: false,
  slowModeSeconds: 0,
  uniqueMode: false,
}

export const DEFAULT_SLOW_MODE_SECONDS = 30
export const DEFAULT_FOLLOWERS_ONLY_MINUTES = 10

export const FOLLOWERS_ONLY_DURATION_OPTIONS = [
  { value: 0, label: "0 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 1440, label: "1 day" },
  { value: 10080, label: "1 week" },
  { value: 43200, label: "1 month" },
  { value: 129600, label: "3 months" },
] as const

export const SLOW_MODE_DURATION_OPTIONS = [
  { value: 3, label: "3 seconds" },
  { value: 5, label: "5 seconds" },
  { value: 10, label: "10 seconds" },
  { value: 20, label: "20 seconds" },
  { value: 30, label: "30 seconds" },
  { value: 60, label: "1 minute" },
  { value: 120, label: "2 minutes" },
] as const

export function mergeChatModes(
  current: TwitchChatModes | null | undefined,
  patch: TwitchChatModesPatch
): TwitchChatModes {
  return {
    ...(current ?? DEFAULT_CHAT_MODES),
    ...patch,
  }
}

export function hasAnyChatModeEnabled(modes: TwitchChatModes): boolean {
  return (
    modes.emoteOnly ||
    modes.subscribersOnly ||
    modes.followersOnly ||
    modes.slowMode ||
    modes.uniqueMode
  )
}

export function chatModesNoticeId(channelLogin: string): string {
  return `chat-modes:${channelLogin}`
}

function formatMinutes(minutes: number): string {
  if (minutes === 0) return "0 minutes"
  if (minutes === 60) return "1 hour"
  if (minutes === 1440) return "1 day"
  if (minutes === 10080) return "1 week"
  if (minutes === 43200) return "1 month"
  if (minutes === 129600) return "3 months"
  if (minutes % 1440 === 0) {
    const days = minutes / 1440
    return `${days} day${days === 1 ? "" : "s"}`
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60
    return `${hours} hour${hours === 1 ? "" : "s"}`
  }
  return `${minutes} minute${minutes === 1 ? "" : "s"}`
}

function formatSeconds(seconds: number): string {
  if (seconds === 60) return "1 minute"
  if (seconds === 120) return "2 minutes"
  if (seconds % 60 === 0) {
    const minutes = seconds / 60
    return `${minutes} minute${minutes === 1 ? "" : "s"}`
  }
  return `${seconds} second${seconds === 1 ? "" : "s"}`
}

function joinEnglishList(items: string[]): string {
  if (items.length === 1) return items[0]!
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`
}

export function formatChatModesNotice(modes: TwitchChatModes): string | null {
  const parts: string[] = []

  if (modes.emoteOnly) {
    parts.push("emote-only mode")
  }
  if (modes.subscribersOnly) {
    parts.push("subscribers-only mode")
  }
  if (modes.followersOnly) {
    parts.push(
      modes.followersOnlyMinutes > 0
        ? `followers-only mode (${formatMinutes(modes.followersOnlyMinutes)})`
        : "followers-only mode"
    )
  }
  if (modes.slowMode) {
    parts.push(`slow mode (${formatSeconds(modes.slowModeSeconds)})`)
  }
  if (modes.uniqueMode) {
    parts.push("unique chat mode")
  }

  if (parts.length === 0) {
    return null
  }

  return `This room is in ${joinEnglishList(parts)}.`
}

export function durationOptionsWithCurrent(
  options: readonly { value: number; label: string }[],
  current: number,
  formatLabel: (value: number) => string
): { value: string; label: string }[] {
  const mapped = options.map((option) => ({
    value: String(option.value),
    label: option.label,
  }))

  if (options.some((option) => option.value === current)) {
    return mapped
  }

  return [
    {
      value: String(current),
      label: formatLabel(current),
    },
    ...mapped,
  ]
}

export function formatFollowersOnlyDuration(minutes: number): string {
  return formatMinutes(minutes)
}

export function formatSlowModeDuration(seconds: number): string {
  return formatSeconds(seconds)
}
