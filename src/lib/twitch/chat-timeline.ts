import type { DeletedMessagesBehavior } from "@/lib/peepochat/peepochat-config"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import type {
  TwitchBadge,
  TwitchChatMessage,
  TwitchSelfUserState,
} from "@/lib/twitch/twitch-chat"
import type {
  TwitchChatRoomState,
  TwitchSelfChatState,
  TwitchTimelineItem,
} from "@/lib/twitch/twitch-chat-types"

export function notifyChatMessageDeleted(
  channelLogin: string,
  messageId: string
) {
  if (typeof window === "undefined") {
    return
  }

  window.dispatchEvent(
    new CustomEvent("peepochat:message-deleted", {
      detail: { channelLogin, messageId },
    })
  )
}

export type TimelineMatchableMessage = {
  id: string
  userId: string | null
  userName: string
}

export function applyDeletedBehaviorToChatEntry(
  entry: Extract<TwitchTimelineItem, { kind: "chat" }>,
  deletedAt: string,
  behavior: DeletedMessagesBehavior
): TwitchTimelineItem | null {
  if (entry.message.deletedAt) {
    return entry
  }

  if (behavior === "remove") {
    return null
  }

  return {
    ...entry,
    message: { ...entry.message, deletedAt },
  }
}

function applyDeletedBehaviorToSuspiciousEntry(
  entry: Extract<TwitchTimelineItem, { kind: "suspicious" }>,
  deletedAt: string,
  behavior: DeletedMessagesBehavior
): TwitchTimelineItem | null {
  if (entry.message.deletedAt) {
    return entry
  }

  if (behavior === "remove") {
    return null
  }

  return {
    ...entry,
    message: { ...entry.message, deletedAt },
  }
}

export function applyDeletedBehaviorToTimeline(
  timeline: TwitchTimelineItem[],
  matches: (message: TimelineMatchableMessage) => boolean,
  deletedAt: string,
  behavior: DeletedMessagesBehavior
): { timeline: TwitchTimelineItem[]; deletedMessageIds: string[] } {
  const next: TwitchTimelineItem[] = []
  const deletedMessageIds: string[] = []

  for (const entry of timeline) {
    if (entry.kind === "chat" && matches(entry.message)) {
      const updated = applyDeletedBehaviorToChatEntry(
        entry,
        deletedAt,
        behavior
      )
      if (updated) {
        next.push(updated)
      }
      deletedMessageIds.push(entry.message.id)
      continue
    }

    if (entry.kind === "suspicious" && matches(entry.message)) {
      const updated = applyDeletedBehaviorToSuspiciousEntry(
        entry,
        deletedAt,
        behavior
      )
      if (updated) {
        next.push(updated)
      }
      deletedMessageIds.push(entry.message.id)
      continue
    }

    next.push(entry)
  }

  return { timeline: next, deletedMessageIds }
}

export function purgeDeletedChatEntries(
  timeline: TwitchTimelineItem[]
): TwitchTimelineItem[] {
  return timeline.filter((entry) => {
    if (entry.kind === "chat" || entry.kind === "suspicious") {
      return entry.message.deletedAt === null
    }
    return true
  })
}

export function purgeMessagesFromUsers(
  timeline: TwitchTimelineItem[],
  matches: (message: TimelineMatchableMessage) => boolean
): TwitchTimelineItem[] {
  return timeline.filter((entry) => {
    if (entry.kind === "chat" || entry.kind === "suspicious") {
      return !matches(entry.message)
    }
    return true
  })
}

export function buildSyncChannelsKey(channelLogins: string[]): string {
  return channelLogins.join("\0")
}

export function toSelfChatState(
  state: TwitchSelfUserState
): TwitchSelfChatState {
  return state
}

export function selfStateFromMessage(
  message: TwitchChatMessage
): TwitchSelfChatState {
  return {
    channel: normalizeChannelLogin(message.channel),
    roomId: message.roomId,
    displayName: message.displayName,
    color: message.color,
    badges: message.badges,
    isBroadcaster: message.flags.isBroadcaster,
    isModerator: message.flags.isModerator,
    isSubscriber: message.flags.isSubscriber,
    isVip: message.flags.isVip,
  }
}

export function createEmptyRoom(login: string): TwitchChatRoomState {
  return {
    login,
    roomId: null,
    joined: false,
    joining: true,
    timeline: [],
  }
}

export function partitionTimeline(timeline: TwitchTimelineItem[]) {
  const historical: TwitchTimelineItem[] = []
  const live: TwitchTimelineItem[] = []

  for (const entry of timeline) {
    if (entry.isHistorical) {
      historical.push(entry)
    } else {
      live.push(entry)
    }
  }

  return { historical, live }
}

export function partitionTimelineWithKnownIds(timeline: TwitchTimelineItem[]) {
  const historical: TwitchTimelineItem[] = []
  const live: TwitchTimelineItem[] = []
  const knownIds = new Set<string>()

  for (const entry of timeline) {
    knownIds.add(entry.message.id)
    if (entry.isHistorical) {
      historical.push(entry)
    } else {
      live.push(entry)
    }
  }

  return { historical, live, knownIds }
}

export function trimTimeline(
  timeline: TwitchTimelineItem[],
  limit: number
): TwitchTimelineItem[] {
  if (timeline.length <= limit) {
    return timeline
  }

  const { historical, live } = partitionTimeline(timeline)
  let excess = historical.length + live.length - limit

  if (excess <= 0) {
    return timeline
  }

  let trimmedHistorical = historical
  if (trimmedHistorical.length > 0) {
    const removeCount = Math.min(excess, trimmedHistorical.length)
    trimmedHistorical = trimmedHistorical.slice(removeCount)
    excess -= removeCount
  }

  const trimmedLive = excess > 0 ? live.slice(excess) : live

  return [...trimmedHistorical, ...trimmedLive]
}

export function getTimelineMessageIds(timeline: TwitchTimelineItem[]) {
  const ids = new Set<string>()
  for (const entry of timeline) {
    ids.add(entry.message.id)
  }
  return ids
}

export type SenderState = {
  color: string | null
  badges: TwitchBadge[]
  displayName: string | null
  isBroadcaster: boolean
  isModerator: boolean
  isSubscriber: boolean
  isVip: boolean
}

export function createEmptySenderState(): SenderState {
  return {
    color: null,
    badges: [],
    displayName: null,
    isBroadcaster: false,
    isModerator: false,
    isSubscriber: false,
    isVip: false,
  }
}
