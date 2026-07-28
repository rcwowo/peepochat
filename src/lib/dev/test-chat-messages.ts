import {
  createModerateActionMessage,
  EMPTY_SYSTEM_MESSAGE_META,
  type TwitchBadge,
  type TwitchChatMessage,
  type TwitchEmote,
  type TwitchSystemMessage,
} from "@/lib/twitch/twitch-chat"
import type { TwitchAutomodHeldMessage } from "@/lib/twitch/twitch-chat-types"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import { buildTwitchEmoteCdnUrl } from "@/lib/twitch/twitch-api"

export const FAKE_MESSAGE_KINDS = [
  "chat",
  "action",
  "first_message",
  "reply",
  "deleted",
  "cheer",
  "subscription",
  "gift_sub",
  "raid",
  "announcement",
  "mod_timeout",
  "mod_ban",
  "mod_unban",
  "notice",
  "status",
  "automod",
] as const

export type FakeMessageKind = (typeof FAKE_MESSAGE_KINDS)[number]

export const FAKE_MESSAGE_KIND_OPTIONS: {
  value: FakeMessageKind
  label: string
}[] = [
  { value: "chat", label: "Chat message" },
  { value: "action", label: "Action (/me)" },
  { value: "first_message", label: "First-time chatter" },
  { value: "reply", label: "Reply" },
  { value: "deleted", label: "Deleted message" },
  { value: "cheer", label: "Bits cheer" },
  { value: "subscription", label: "Subscription" },
  { value: "gift_sub", label: "Gift sub" },
  { value: "raid", label: "Raid" },
  { value: "announcement", label: "Announcement" },
  { value: "mod_timeout", label: "Mod timeout" },
  { value: "mod_ban", label: "Mod ban" },
  { value: "mod_unban", label: "Mod unban" },
  { value: "notice", label: "Notice" },
  { value: "status", label: "Status / ritual" },
  { value: "automod", label: "AutoMod held" },
]

export type FakeAnnouncementTheme =
  "primary" | "blue" | "green" | "orange" | "purple"

export const FAKE_ANNOUNCEMENT_THEME_OPTIONS: {
  value: FakeAnnouncementTheme
  label: string
}[] = [
  { value: "primary", label: "Primary" },
  { value: "blue", label: "Blue" },
  { value: "green", label: "Green" },
  { value: "orange", label: "Orange" },
  { value: "purple", label: "Purple" },
]

export type FakeChatRole =
  "none" | "broadcaster" | "moderator" | "vip" | "subscriber"

export const FAKE_CHAT_ROLE_OPTIONS: { value: FakeChatRole; label: string }[] =
  [
    { value: "none", label: "None" },
    { value: "broadcaster", label: "Broadcaster" },
    { value: "moderator", label: "Moderator" },
    { value: "vip", label: "VIP" },
    { value: "subscriber", label: "Subscriber" },
  ]

export type FakeMessageOptions = {
  channelLogin: string
  roomId?: string | null
  displayName?: string
  userName?: string
  text?: string
  color?: string | null
  includeEmotes?: boolean
  role?: FakeChatRole
  announcementTheme?: FakeAnnouncementTheme
  viewerCount?: number
  cumulativeMonths?: number
  giftCount?: number
  banDurationSeconds?: number
}

export type FakeTimelinePayload =
  | { kind: "chat"; message: TwitchChatMessage }
  | { kind: "system"; message: TwitchSystemMessage }
  | {
      kind: "automod"
      channelLogin: string
      message: TwitchAutomodHeldMessage
    }

const SAMPLE_TWITCH_EMOTES = [
  { id: "25", code: "Kappa" },
  { id: "425618", code: "LUL" },
] as const

const ANNOUNCEMENT_ACCENTS: Record<FakeAnnouncementTheme, string> = {
  primary: "#9146ff",
  blue: "#00d6d6",
  green: "#00db84",
  orange: "#ffb31a",
  purple: "#ff75e6",
}

function nextFakeId(prefix: string) {
  return `dev-fake-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function twitchEmoteImageUrl(emoteId: string) {
  return buildTwitchEmoteCdnUrl(emoteId)
}

function appendSampleEmotes(text: string): {
  text: string
  emotes: TwitchEmote[]
} {
  let nextText = text
  const emotes: TwitchEmote[] = []

  for (const sample of SAMPLE_TWITCH_EMOTES) {
    const needsSpace = nextText.length > 0 && !nextText.endsWith(" ")
    const prefix = needsSpace ? " " : ""
    const start = nextText.length + prefix.length
    nextText += `${prefix}${sample.code}`
    emotes.push({
      id: sample.id,
      code: sample.code,
      provider: "twitch",
      imageUrl: twitchEmoteImageUrl(sample.id),
      start,
      end: start + sample.code.length - 1,
    })
  }

  return { text: nextText, emotes }
}

function normalizeActorName(displayName: string, userName: string) {
  const display = displayName.trim() || "FakeUser"
  const login =
    userName.trim().toLowerCase() ||
    display.toLowerCase().replace(/[^a-z0-9_]/g, "") ||
    "fakeuser"
  return { displayName: display, userName: login }
}

function badgesForRole(role: FakeChatRole): {
  badges: TwitchBadge[]
  flags: TwitchChatMessage["flags"]
} {
  const flags: TwitchChatMessage["flags"] = {
    isBroadcaster: role === "broadcaster",
    isModerator: role === "moderator" || role === "broadcaster",
    isSubscriber: role === "subscriber" || role === "broadcaster",
    isVip: role === "vip",
    isFirst: false,
    isAction: false,
  }

  const badges: TwitchBadge[] = []
  if (flags.isBroadcaster) {
    badges.push({ set: "broadcaster", version: "1" })
  }
  if (flags.isModerator && !flags.isBroadcaster) {
    badges.push({ set: "moderator", version: "1" })
  }
  if (flags.isVip) {
    badges.push({ set: "vip", version: "1" })
  }
  if (flags.isSubscriber) {
    badges.push({ set: "subscriber", version: "0" })
  }

  return { badges, flags }
}

function defaultTextForKind(kind: FakeMessageKind): string {
  switch (kind) {
    case "action":
      return "waves at everyone in chat"
    case "first_message":
      return "Hi everyone, this is my first message!"
    case "reply":
      return "Yeah, I totally agree with that"
    case "deleted":
      return "This message should appear deleted"
    case "cheer":
      return "Cheer300 Please take my money."
    case "subscription":
      return "Thanks for the great stream!"
    case "gift_sub":
      return ""
    case "raid":
      return ""
    case "announcement":
      return "Important community update from the mods!"
    case "mod_timeout":
    case "mod_ban":
    case "mod_unban":
      return "troublemaker"
    case "notice":
      return "This room is now in followers-only mode."
    case "status":
      return "FakeUser is new here! Say hello!"
    case "automod":
      return "This held message has some spicy words"
    case "chat":
    default:
      return "Hello chat, this is a test message!"
  }
}

function buildCheerMessage(options: FakeMessageOptions): TwitchChatMessage {
  const channel = normalizeChannelLogin(options.channelLogin)
  const { displayName, userName } = normalizeActorName(
    options.displayName ?? "FakeUser",
    options.userName ?? ""
  )
  const role = options.role ?? "none"
  const { badges, flags } = badgesForRole(role)
  const text = options.text?.trim() || "Cheer300 Please take my money."
  const cheerToken = text.match(/\S+/)?.[0] ?? "Cheer300"
  const cheerEnd = cheerToken.length - 1

  return {
    id: nextFakeId("cheer"),
    channel,
    roomId: options.roomId ?? null,
    userId: `dev-${userName}`,
    userName,
    displayName,
    text,
    color: options.color ?? "#ff7f50",
    receivedAt: new Date().toISOString(),
    badges,
    badgeInfo: [],
    emotes: [
      {
        id: "100",
        code: cheerToken,
        provider: "twitch",
        imageUrl: buildTwitchEmoteCdnUrl("100"),
        start: 0,
        end: cheerEnd,
      },
    ],
    reply: null,
    bits: 300,
    deletedAt: null,
    flags,
  }
}

function buildChatMessage(
  kind: Extract<
    FakeMessageKind,
    "chat" | "action" | "first_message" | "reply" | "deleted"
  >,
  options: FakeMessageOptions
): TwitchChatMessage {
  const channel = normalizeChannelLogin(options.channelLogin)
  const { displayName, userName } = normalizeActorName(
    options.displayName ?? "FakeUser",
    options.userName ?? ""
  )
  const role = options.role ?? "none"
  const { badges, flags } = badgesForRole(role)
  const baseText = options.text?.trim() || defaultTextForKind(kind)
  const withEmotes = options.includeEmotes
    ? appendSampleEmotes(baseText)
    : { text: baseText, emotes: [] as TwitchEmote[] }

  flags.isAction = kind === "action"
  flags.isFirst = kind === "first_message"

  return {
    id: nextFakeId(kind),
    channel,
    roomId: options.roomId ?? null,
    userId: `dev-${userName}`,
    userName,
    displayName,
    text: withEmotes.text,
    color: options.color ?? "#ff7f50",
    receivedAt: new Date().toISOString(),
    badges,
    badgeInfo: [],
    emotes: withEmotes.emotes,
    reply:
      kind === "reply"
        ? {
            parentMessageId: nextFakeId("parent"),
            parentDisplayName: "OtherUser",
            parentUserName: "otheruser",
            parentBody: "What do you all think about this?",
            parentColor: "#9146ff",
          }
        : null,
    bits: null,
    deletedAt: kind === "deleted" ? new Date().toISOString() : null,
    flags,
  }
}

function buildSystemMessage(
  kind: Extract<
    FakeMessageKind,
    | "subscription"
    | "gift_sub"
    | "raid"
    | "announcement"
    | "mod_timeout"
    | "mod_ban"
    | "mod_unban"
    | "notice"
    | "status"
  >,
  options: FakeMessageOptions
): TwitchSystemMessage {
  const channel = normalizeChannelLogin(options.channelLogin)
  const roomId = options.roomId ?? null
  const { displayName, userName } = normalizeActorName(
    options.displayName ?? "FakeUser",
    options.userName ?? ""
  )
  const actor = {
    userId: `dev-${userName}`,
    userName,
    displayName,
    color: options.color ?? "#9146ff",
  }
  const receivedAt = new Date().toISOString()
  const textOverride = options.text?.trim()

  if (kind === "mod_timeout" || kind === "mod_ban" || kind === "mod_unban") {
    const targetName = textOverride || defaultTextForKind(kind)
    const action =
      kind === "mod_timeout" ? "timeout" : kind === "mod_ban" ? "ban" : "unban"
    const message = createModerateActionMessage({
      channelLogin: channel,
      roomId,
      action,
      moderatorUserId: "dev-fakemod",
      moderatorUserName: "fakemod",
      moderatorDisplayName: "FakeMod",
      targetUserId: `dev-${targetName.toLowerCase().replace(/[^a-z0-9_]/g, "")}`,
      targetUserName: targetName.toLowerCase().replace(/[^a-z0-9_]/g, ""),
      targetDisplayName: targetName,
      banDurationSeconds:
        kind === "mod_timeout" ? (options.banDurationSeconds ?? 600) : null,
      messageId: nextFakeId(kind),
      receivedAt,
    })

    if (!message) {
      return {
        id: nextFakeId(kind),
        channel,
        roomId,
        text: `${displayName} moderated ${targetName}.`,
        headline: `${displayName} moderated ${targetName}.`,
        details: null,
        receivedAt,
        event: "mod_action",
        level: "info",
        accentColor: null,
        ...EMPTY_SYSTEM_MESSAGE_META,
        actor,
      }
    }

    return message
  }

  if (kind === "subscription") {
    const months = options.cumulativeMonths ?? 3
    const detailsBase = textOverride || defaultTextForKind(kind)
    const detailsPayload = options.includeEmotes
      ? appendSampleEmotes(detailsBase)
      : { text: detailsBase, emotes: [] as TwitchEmote[] }
    const headline = `${displayName} subscribed at Tier 1. They've subscribed for ${months} months!`

    return {
      id: nextFakeId(kind),
      channel,
      roomId,
      text: [headline, detailsPayload.text].filter(Boolean).join(" "),
      headline,
      details: detailsPayload.text || null,
      detailsEmotes: detailsPayload.emotes,
      receivedAt,
      event: "subscription",
      level: "success",
      accentColor: null,
      ...EMPTY_SYSTEM_MESSAGE_META,
      msgId: "resub",
      actor,
      cumulativeMonths: months,
      streakMonths: months,
      subPlan: "1000",
    }
  }

  if (kind === "gift_sub") {
    const giftCount = options.giftCount ?? 5
    const headline =
      textOverride ||
      `${displayName} is gifting ${giftCount} Tier 1 Subs to the community!`

    return {
      id: nextFakeId(kind),
      channel,
      roomId,
      text: headline,
      headline,
      details: null,
      receivedAt,
      event: "subscription",
      level: "success",
      accentColor: null,
      ...EMPTY_SYSTEM_MESSAGE_META,
      msgId: "submysterygift",
      actor,
      giftCount,
      subPlan: "1000",
    }
  }

  if (kind === "raid") {
    const viewerCount = options.viewerCount ?? 42
    const headline = "Raid"
    const text =
      textOverride ||
      `${displayName} is raiding with ${viewerCount} ${viewerCount === 1 ? "viewer" : "viewers"}!`

    return {
      id: nextFakeId(kind),
      channel,
      roomId,
      text,
      headline,
      details: null,
      receivedAt,
      event: "raid",
      level: "success",
      accentColor: null,
      ...EMPTY_SYSTEM_MESSAGE_META,
      msgId: "raid",
      actor,
      viewerCount,
    }
  }

  if (kind === "announcement") {
    const theme = options.announcementTheme ?? "primary"
    const detailsBase = textOverride || defaultTextForKind(kind)
    const detailsPayload = options.includeEmotes
      ? appendSampleEmotes(detailsBase)
      : { text: detailsBase, emotes: [] as TwitchEmote[] }

    return {
      id: nextFakeId(kind),
      channel,
      roomId,
      text: detailsPayload.text,
      headline: "Announcement",
      details: detailsPayload.text,
      detailsEmotes: detailsPayload.emotes,
      receivedAt,
      event: "announcement",
      level: "info",
      accentColor: ANNOUNCEMENT_ACCENTS[theme],
      ...EMPTY_SYSTEM_MESSAGE_META,
      msgId: "announcement",
      actor,
      badges: [
        { set: "moderator", version: "1" },
        { set: "subscriber", version: "0" },
      ],
      announcementTheme: theme,
    }
  }

  if (kind === "notice") {
    const text = textOverride || defaultTextForKind(kind)
    return {
      id: nextFakeId(kind),
      channel,
      roomId,
      text,
      headline: text,
      details: null,
      receivedAt,
      event: "notice",
      level: "warning",
      accentColor: null,
      ...EMPTY_SYSTEM_MESSAGE_META,
      msgId: "followers_on",
    }
  }

  const text = textOverride || `${displayName} is new here! Say hello!`
  return {
    id: nextFakeId(kind),
    channel,
    roomId,
    text,
    headline: text,
    details: null,
    receivedAt,
    event: "status",
    level: "info",
    accentColor: null,
    ...EMPTY_SYSTEM_MESSAGE_META,
    msgId: "ritual",
    actor,
  }
}

function buildAutomodMessage(
  options: FakeMessageOptions
): TwitchAutomodHeldMessage {
  const channel = normalizeChannelLogin(options.channelLogin)
  const { displayName, userName } = normalizeActorName(
    options.displayName ?? "FakeUser",
    options.userName ?? ""
  )
  const baseText = options.text?.trim() || defaultTextForKind("automod")
  const withEmotes = options.includeEmotes
    ? appendSampleEmotes(baseText)
    : { text: baseText, emotes: [] as TwitchEmote[] }
  const heldAt = new Date().toISOString()
  const id = nextFakeId("automod")

  return {
    id,
    messageId: id,
    channel,
    roomId: options.roomId ?? null,
    userId: `dev-${userName}`,
    userName,
    displayName,
    text: withEmotes.text,
    emotes: withEmotes.emotes,
    badges: [
      { set: "subscriber", version: "0" },
      { set: "premium", version: "1" },
    ],
    color: options.color ?? "#ff7f50",
    receivedAt: heldAt,
    heldAt,
    status: "pending",
  }
}

export function buildFakeTimelineItem(
  kind: FakeMessageKind,
  options: FakeMessageOptions
): FakeTimelinePayload {
  switch (kind) {
    case "chat":
    case "action":
    case "first_message":
    case "reply":
    case "deleted":
      return { kind: "chat", message: buildChatMessage(kind, options) }
    case "cheer":
      return { kind: "chat", message: buildCheerMessage(options) }
    case "automod":
      return {
        kind: "automod",
        channelLogin: normalizeChannelLogin(options.channelLogin),
        message: buildAutomodMessage(options),
      }
    default:
      return { kind: "system", message: buildSystemMessage(kind, options) }
  }
}

export function defaultFakeMessageText(kind: FakeMessageKind) {
  return defaultTextForKind(kind)
}

export function fakeMessageTextLabel(kind: FakeMessageKind) {
  switch (kind) {
    case "subscription":
    case "announcement":
      return "Details"
    case "gift_sub":
    case "raid":
    case "notice":
    case "status":
      return "Headline"
    case "mod_timeout":
    case "mod_ban":
    case "mod_unban":
      return "Target username"
    default:
      return "Message text"
  }
}

export function supportsFakeChatRole(kind: FakeMessageKind) {
  return (
    kind === "chat" ||
    kind === "action" ||
    kind === "first_message" ||
    kind === "reply" ||
    kind === "deleted" ||
    kind === "cheer"
  )
}

export function supportsFakeAnnouncementTheme(kind: FakeMessageKind) {
  return kind === "announcement"
}

export function supportsFakeViewerCount(kind: FakeMessageKind) {
  return kind === "raid"
}

export function supportsFakeEmotes(kind: FakeMessageKind) {
  return (
    kind === "chat" ||
    kind === "action" ||
    kind === "first_message" ||
    kind === "reply" ||
    kind === "deleted" ||
    kind === "subscription" ||
    kind === "announcement" ||
    kind === "automod"
  )
}
