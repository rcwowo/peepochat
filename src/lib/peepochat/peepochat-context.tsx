import * as React from "react"

import type { CachedChatView } from "@/hooks/chat-ui/use-chat-layout"
import { usePeepochatConfig } from "@/hooks/peepochat/use-peepochat-config"
import type {
  SendOutcomeEvent,
  TwitchChannelSendBlock,
} from "@/lib/chat/send/send-notice"
import type { ChatSendResult } from "@/lib/chat/send/send"
import type { ComposerEmoteCatalog } from "@/lib/chat/emotes/catalog"
import type {
  ChannelChatter,
  ChatterSearchOptions,
} from "@/lib/chat/chatters/store"
import type { ChatBadgeCatalog } from "@/lib/chat/presentation/badges"
import type { ResolvedMemberBadge } from "@/lib/rcw/badges"
import type {
  AppConfig,
  ChatSplit,
  ChatSplitLayoutNode,
  SplitLayoutEdge,
  TwitchAccount,
  TwitchChannel,
} from "@/lib/peepochat/peepochat-config"
import type { ChannelPinnedMessage } from "@/lib/twitch/chat/pins"
import type {
  TwitchAutomodHeldMessage,
  TwitchChatRoomState,
  TwitchSelfChatState,
  TwitchTimelineItem,
} from "@/lib/twitch/chat/types"
import type {
  TwitchChatMessage,
  TwitchConnectionState,
  TwitchSystemMessage,
} from "@/lib/twitch/chat/chat"

export type { TwitchTimelineItem } from "@/lib/twitch/chat/types"

export type PeepochatConfigContextValue = {
  config: AppConfig
  ready: boolean
  needsOnboarding: boolean
  completeOnboarding: () => void
  requireOnboarding: () => void
  updateConfig: ReturnType<typeof usePeepochatConfig>["updateConfig"]
  restoreBackup: ReturnType<typeof usePeepochatConfig>["restoreBackup"]
  account: TwitchAccount | null
  oauthBusy: boolean
  isOAuthConfigured: boolean
  loginWithTwitch: () => void
  logout: () => void
  channels: TwitchChannel[]
  activeChannelLogin: string
  setActiveChannel: (login: string) => void
  addChannel: (login: string) => Promise<string>
  removeChannel: (login: string) => void
}

export type PeepochatLayoutContextValue = {
  savedSplits: ChatSplit[]
  activeSplitId: string | null
  activeSplitLayout?: ChatSplitLayoutNode
  sidebarOrder: string[]
  splitChannels: string[]
  isSplitView: boolean
  channelsInSplits: Set<string>
  visibleChannelLogins: string[]
  keepChatViewsMounted: boolean
  cachedChatViews: CachedChatView[]
  activeChatViewKey: string | null
  mountedChannelLogins: string[]
  selectSplit: (splitId: string) => void
  openSplitView: (channels: string[]) => void
  addSplitChannel: (login: string) => void
  removeSplitChannel: (login: string) => void
  unsplit: (splitId: string) => void
  reorderSidebar: (activeId: string, overId: string) => void
  moveSplitPane: (
    splitId: string,
    sourceChannel: string,
    targetChannel: string,
    edge: SplitLayoutEdge
  ) => void
  resizeSplitPanePath: (
    splitId: string,
    path: number[],
    sizes: number[]
  ) => void
}

export type PeepochatSidebarHighlightsContextValue = {
  hasUnreadForChannel: (login: string) => boolean
  hasUnreadForSplit: (splitId: string, channelLogins: string[]) => boolean
  hasPingForChannel: (login: string) => boolean
  hasPingForSplit: (splitId: string, channelLogins: string[]) => boolean
  markChannelRead: (login: string) => void
  markSplitRead: (splitId: string) => void
  isChannelLive: (login: string) => boolean
  getChannelLiveStream: (
    login: string
  ) => import("@/lib/twitch/auth/api").TwitchLiveStream | null
  isSplitLive: (channelLogins: string[]) => boolean
  liveIndicatorsEnabled: boolean
}

export type PeepochatPlayerContextValue = {
  playerChannelLogin: string | null
  playerViewActive: boolean
  openPlayer: (login: string) => void
  selectPlayer: () => void
  closePlayer: () => void
}

export type PeepochatChatContextValue = {
  connectionState: TwitchConnectionState
  sendConnectionState: TwitchConnectionState
  logs: string[]
  subscribeToRoom: (login: string, listener: () => void) => () => void
  getTimeline: (login: string) => TwitchTimelineItem[]
  getRoom: (login: string) => TwitchChatRoomState | null
  getRoomId: (login: string) => string | null
  subscribeToPinnedMessage: (login: string, listener: () => void) => () => void
  getPinnedMessage: (login: string) => ChannelPinnedMessage | null
  refreshPinnedMessage: (login: string) => void
  clearPinnedMessage: (login: string) => void
  subscribeToChatters: (login: string, listener: () => void) => () => void
  getChatters: (login: string) => ChannelChatter[]
  getChatterByLogin: (
    channelLogin: string,
    chatterLogin: string
  ) => ChannelChatter | null
  searchChatters: (
    login: string,
    query: string,
    options?: ChatterSearchOptions
  ) => ChannelChatter[]
  isRecentMessagesLoading: (login: string) => boolean
  subscribeToRecentMessagesLoading: (
    login: string,
    listener: () => void
  ) => () => void
  getSelfChatState: (login: string) => TwitchSelfChatState | null
  getChannelSendBlock: (login: string) => TwitchChannelSendBlock | null
  registerSendOutcomeListener: (
    listener: (event: SendOutcomeEvent) => void,
    options?: { channel?: string }
  ) => () => void
  replayPendingComposerNotice: (channel: string) => void
  dismissComposerNotice: (notice: { channel: string; id: string }) => void
  getBadgeCatalog: (login: string) => ChatBadgeCatalog
  getBadgeCatalogByRoomId: (roomId: string | null) => ChatBadgeCatalog
  subscribeToBadgeCatalogs: (listener: () => void) => () => void
  loadBadgesForRoom: (roomId: string | null) => void
  ensureSharedChatSourceProfiles: (
    ids: Array<string | null | undefined>
  ) => void
  getMemberBadge: (userId: string | null) => ResolvedMemberBadge | null
  getComposerEmoteCatalog: (login: string) => ComposerEmoteCatalog
  ensureComposerEmotes: (login: string, roomId: string | null) => void
  isComposerEmotesLoading: (login: string) => boolean
  refreshEmotes: (login: string) => Promise<boolean>
  sendChatMessage: (
    login: string,
    message: string,
    reply?: import("@/lib/twitch/chat/chat").TwitchChatReply | null
  ) => ChatSendResult
  sendActionMessage: (
    login: string,
    message: string,
    reply?: import("@/lib/twitch/chat/chat").TwitchChatReply | null
  ) => ChatSendResult
  executeChatCommand: (
    login: string,
    input: string
  ) => Promise<import("@/lib/chat/commands/commands").ChatCommandResult>
  markChatMessageDeleted: (login: string, messageId: string) => void
  injectChatMessage: (message: TwitchChatMessage) => boolean
  injectSystemMessage: (message: TwitchSystemMessage) => boolean
  injectAutomodHeldMessage: (
    login: string,
    message: TwitchAutomodHeldMessage
  ) => boolean
  canSendChat: boolean
  hasBadgeSupport: boolean
  hideBlockedUsers: boolean
  isUserBlocked: (userId?: string | null, login?: string | null) => boolean
  blockUser: (userId: string, login: string) => Promise<void>
  unblockUser: (userId: string, login?: string) => Promise<void>
}

export type PeepochatContextValue = PeepochatConfigContextValue &
  PeepochatLayoutContextValue &
  PeepochatChatContextValue

export const PeepochatConfigContext =
  React.createContext<PeepochatConfigContextValue | null>(null)
export const PeepochatLayoutContext =
  React.createContext<PeepochatLayoutContextValue | null>(null)
export const PeepochatChatContext =
  React.createContext<PeepochatChatContextValue | null>(null)
export const PeepochatSidebarHighlightsContext =
  React.createContext<PeepochatSidebarHighlightsContextValue | null>(null)
export const PeepochatPlayerContext =
  React.createContext<PeepochatPlayerContextValue | null>(null)

export function usePeepochatSettings() {
  const context = React.useContext(PeepochatConfigContext)
  if (!context) {
    throw new Error(
      "usePeepochatSettings must be used within a PeepochatProvider"
    )
  }
  return context
}

export function usePeepochatLayout() {
  const layout = React.useContext(PeepochatLayoutContext)
  if (!layout) {
    throw new Error(
      "usePeepochatLayout must be used within a PeepochatProvider"
    )
  }
  return layout
}

export function usePeepochatSidebarHighlights() {
  const context = React.useContext(PeepochatSidebarHighlightsContext)
  if (!context) {
    throw new Error(
      "usePeepochatSidebarHighlights must be used within a PeepochatProvider"
    )
  }
  return context
}

export function usePeepochatPlayer() {
  const context = React.useContext(PeepochatPlayerContext)
  if (!context) {
    throw new Error(
      "usePeepochatPlayer must be used within a PeepochatProvider"
    )
  }
  return context
}

export function usePeepochatChat() {
  const context = React.useContext(PeepochatChatContext)
  if (!context) {
    throw new Error("usePeepochatChat must be used within a PeepochatProvider")
  }
  return context
}

export function usePeepochat() {
  const config = React.useContext(PeepochatConfigContext)
  const layout = React.useContext(PeepochatLayoutContext)
  const chat = React.useContext(PeepochatChatContext)
  const highlights = React.useContext(PeepochatSidebarHighlightsContext)
  if (!config || !layout || !chat || !highlights) {
    throw new Error("usePeepochat must be used within a PeepochatProvider")
  }
  return { ...config, ...layout, ...chat, ...highlights }
}
