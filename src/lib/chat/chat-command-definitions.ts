export type ChatCommandDefinition = {
  name: string
  usage: string
  description: string
  aliases?: string[]
  usageDetail?: string
}

export const ANNOUNCEMENT_COLORS = [
  "primary",
  "blue",
  "green",
  "orange",
  "purple",
] as const

export const ANNOUNCEMENT_COLOR_SET = new Set<string>(ANNOUNCEMENT_COLORS)

export const CHAT_COMMAND_DEFINITIONS: ChatCommandDefinition[] = [
  {
    name: "announce",
    usage: "[color] <message>",
    description: "Send a chat announcement",
    usageDetail: `Colors: ${ANNOUNCEMENT_COLORS.join(", ")} (if no color or invalid color, primary is used)`,
  },
  { name: "ban", usage: "<username> [reason]", description: "Permanently ban a user" },
  {
    name: "commercial",
    usage: "[seconds]",
    description: "Start a commercial (broadcaster only)",
  },
  { name: "clear", usage: "", description: "Clear all chat messages" },
  { name: "emoteonly", usage: "", description: "Emote-only mode on" },
  { name: "emoteonlyoff", usage: "", description: "Emote-only mode off" },
  {
    name: "followers",
    usage: "[minutes]",
    description: "Followers-only mode on",
  },
  { name: "followersoff", usage: "", description: "Followers-only mode off" },
  {
    name: "marker",
    usage: "[description]",
    description: "Add a stream marker",
  },
  { name: "me", usage: "<action>", description: "Send an action message" },
  { name: "mod", usage: "<username>", description: "Grant moderator" },
  { name: "mods", usage: "", description: "List channel moderators" },
  { name: "raid", usage: "<username>", description: "Raid another channel" },
  { name: "unraid", usage: "", description: "Cancel a pending raid" },
  {
    name: "slow",
    usage: "[seconds]",
    description: "Slow mode on",
  },
  { name: "slowoff", usage: "", description: "Slow mode off" },
  { name: "subscribers", usage: "", description: "Subscribers-only mode on" },
  {
    name: "subscribersoff",
    usage: "",
    description: "Subscribers-only mode off",
  },
  {
    name: "timeout",
    usage: "<username> [seconds] [reason]",
    description: "Timeout a user",
  },
  { name: "untimeout", usage: "<username>", description: "Remove a timeout" },
  { name: "unban", usage: "<username>", description: "Unban a user" },
  { name: "uniquechat", usage: "", description: "Unique chat mode on" },
  { name: "uniquechatoff", usage: "", description: "Unique chat mode off" },
  { name: "vip", usage: "<username>", description: "Grant VIP" },
  { name: "vips", usage: "", description: "List channel VIPs" },
  { name: "unvip", usage: "<username>", description: "Remove VIP" },
  { name: "user", usage: "<username>", description: "Open a user card" },
  { name: "w", usage: "<username> <message>", description: "Send a whisper" },
  {
    name: "shoutout",
    usage: "<username>",
    description: "Send a shoutout",
    aliases: ["so"],
  },
]

export const KNOWN_CHAT_COMMANDS = new Set(
  CHAT_COMMAND_DEFINITIONS.flatMap((command) => [
    command.name,
    ...(command.aliases ?? []),
  ])
)

export function resolveCommandDefinition(
  token: string
): ChatCommandDefinition | null {
  const normalized = token.toLowerCase()
  if (!normalized) {
    return null
  }

  return (
    CHAT_COMMAND_DEFINITIONS.find(
      (command) =>
        command.name === normalized ||
        command.aliases?.some((alias) => alias === normalized)
    ) ?? null
  )
}
