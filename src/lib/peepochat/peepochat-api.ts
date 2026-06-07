/**
 * Shared types for the Peepochat app.
 *
 * These are re-exported from the browser-native Twitch IRC client so that
 * the rest of the codebase has a single import path for chat-related types.
 */

export type {
  TwitchChatMessage as ChatMessageEvent,
  TwitchConnectionState as ChatConnectionState,
} from "@/lib/twitch/twitch-chat"
