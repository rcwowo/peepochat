import type { ChannelProfileHint } from "@/lib/chat/chat-emote-catalog"
import type {
  TwitchBadge,
  TwitchChatMessage,
  TwitchEmote,
  TwitchSystemMessage,
} from "@/lib/twitch/twitch-chat"

export type TwitchAutomodHeldStatus =
  | "pending"
  | "approved"
  | "denied"
  | "expired"

export type TwitchAutomodHeldMessage = {
  id: string
  messageId: string
  channel: string
  roomId: string | null
  userId: string
  userName: string
  displayName: string
  text: string
  emotes: TwitchEmote[]
  color: string | null
  receivedAt: string
  heldAt: string
  status: TwitchAutomodHeldStatus
}

export type TwitchSuspiciousUserStatus = "monitored" | "restricted"

export type TwitchSuspiciousUserMessage = {
  id: string
  messageId: string
  channel: string
  roomId: string | null
  userId: string
  userName: string
  displayName: string
  text: string
  emotes: TwitchEmote[]
  color: string | null
  receivedAt: string
  status: TwitchSuspiciousUserStatus
  deletedAt: string | null
}

export type TwitchTimelineItem =
  | { kind: "chat"; message: TwitchChatMessage; isHistorical?: boolean }
  | { kind: "system"; message: TwitchSystemMessage; isHistorical?: boolean }
  | {
      kind: "automod"
      message: TwitchAutomodHeldMessage
      isHistorical?: boolean
    }
  | {
      kind: "suspicious"
      message: TwitchSuspiciousUserMessage
      isHistorical?: boolean
    }

export type TwitchChatRoomState = {
  login: string
  roomId: string | null
  joined: boolean
  joining: boolean
  timeline: TwitchTimelineItem[]
}

export type TwitchSelfChatState = {
  channel: string
  roomId: string | null
  displayName: string
  color: string | null
  badges: TwitchBadge[]
  isBroadcaster: boolean
  isModerator: boolean
  isSubscriber: boolean
  isVip: boolean
}

export type TwitchChatEmoteLoadContext = {
  accessToken?: string
  clientId?: string
  userId?: string
  userLogin?: string
  userDisplayName?: string
  channelHints?: ChannelProfileHint[]
}
