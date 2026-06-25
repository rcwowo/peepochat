import { TWITCH_OAUTH_SCOPES } from "@/lib/twitch/twitch-oauth"

export type TwitchOAuthScopeInfo = {
  scope: (typeof TWITCH_OAUTH_SCOPES)[number]
  label: string
  description: string
}

export type TwitchOAuthScopeGroup = {
  id: string
  title: string
  description: string
  scopes: TwitchOAuthScopeInfo[]
}

export const TWITCH_OAUTH_SCOPE_GROUPS: TwitchOAuthScopeGroup[] = [
  {
    id: "chat",
    title: "Chat",
    description: "Core permissions for reading and sending messages.",
    scopes: [
      {
        scope: "chat:read",
        label: "Read chat",
        description: "Connect to channels and display live chat messages.",
      },
      {
        scope: "chat:edit",
        label: "Send messages",
        description:
          "Send messages, replies, and chat commands from your account.",
      },
      {
        scope: "user:read:emotes",
        label: "Subscribed emotes",
        description: "Load emotes from channels you are subscribed to.",
      },
    ],
  },
  {
    id: "moderation",
    title: "Moderation",
    description: "Tools for moderating chat when you have mod permissions.",
    scopes: [
      {
        scope: "moderation:read",
        label: "View moderation info",
        description: "See ban and timeout status on user cards.",
      },
      {
        scope: "moderator:manage:banned_users",
        label: "Ban & timeout users",
        description: "Timeout, ban, and unban users from chat.",
      },
      {
        scope: "moderator:manage:chat_messages",
        label: "Delete messages",
        description: "Remove individual chat messages as a moderator.",
      },
      {
        scope: "moderator:manage:chat_settings",
        label: "Chat settings",
        description:
          "Change slow mode, follower mode, and other chat settings.",
      },
      {
        scope: "moderator:manage:announcements",
        label: "Announcements",
        description: "Send highlighted announcement messages in chat.",
      },
      {
        scope: "moderator:manage:shoutouts",
        label: "Shoutouts",
        description: "Give shoutouts to other channels from chat.",
      },
      {
        scope: "channel:manage:moderators",
        label: "Manage moderators",
        description: "Add or remove moderators for a channel you manage.",
      },
      {
        scope: "channel:manage:vips",
        label: "Manage VIPs",
        description: "Add or remove VIP badges for a channel you manage.",
      },
    ],
  },
  {
    id: "broadcast",
    title: "Broadcast & channel",
    description: "Stream and channel management actions from chat.",
    scopes: [
      {
        scope: "channel:edit:commercial",
        label: "Run commercials",
        description: "Start ad breaks when you are streaming.",
      },
      {
        scope: "channel:manage:raids",
        label: "Start raids",
        description: "Raid another channel from chat.",
      },
      {
        scope: "channel:manage:broadcast",
        label: "Edit stream info",
        description: "Update your stream title and category.",
      },
      {
        scope: "user:manage:whispers",
        label: "Send whispers",
        description: "Send private whispers to other Twitch users.",
      },
    ],
  },
]

const scopeInfoById = new Map<string, TwitchOAuthScopeInfo>(
  TWITCH_OAUTH_SCOPE_GROUPS.flatMap((group) =>
    group.scopes.map((entry) => [entry.scope, entry] as const)
  )
)

/** Ordered list matching the scopes requested at login. */
export function getTwitchOAuthScopeCatalog(): TwitchOAuthScopeInfo[] {
  return TWITCH_OAUTH_SCOPES.map(
    (scope) =>
      scopeInfoById.get(scope) ?? {
        scope,
        label: scope,
        description: "Used by Peepochat for Twitch integration.",
      }
  )
}
