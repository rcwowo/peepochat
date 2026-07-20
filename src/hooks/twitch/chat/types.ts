import type { TwitchTimelineItem } from "@/lib/twitch/twitch-chat-types"

export type PendingConnect = {
  resolve: () => void
  reject: (err: Error) => void
}

export type PendingReadConnect = PendingConnect & {
  key: string
  expectedChannels: string[]
}

export type PendingConnectionRecovery = {
  id: number
  promise: Promise<void>
  resolve: () => void
}

export type AppendRoomTimelineOptions = {
  roomId?: string | null
}

export type PendingLiveTimelineBatch = {
  items: TwitchTimelineItem[]
  roomId: string | null | undefined
  frameId: number | null
}

export const SYNC_CHANNELS_SUPERSEDED_MESSAGE = "Channel list updated"

export function isSyncChannelsSupersededError(error: unknown): boolean {
  return (
    error instanceof Error && error.message === SYNC_CHANNELS_SUPERSEDED_MESSAGE
  )
}

export const EMOTE_LOAD_RETRY_MS = 60_000
export const RECONNECT_TOAST_ID = "twitch-connection-recovery"
