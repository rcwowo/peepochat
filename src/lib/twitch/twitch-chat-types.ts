import type { ChannelProfileHint } from "@/lib/chat/chat-emote-catalog"
import type {
  TwitchBadge,
  TwitchChatMessage,
  TwitchSystemMessage,
} from "@/lib/twitch/twitch-chat"

export type TwitchTimelineItem =
  | { kind: "chat"; message: TwitchChatMessage; isHistorical?: boolean }
  | { kind: "system"; message: TwitchSystemMessage; isHistorical?: boolean }

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
