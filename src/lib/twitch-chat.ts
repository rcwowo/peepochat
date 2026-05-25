/**
 * Browser-native Twitch IRC client over WebSocket.
 *
 * Connects anonymously (read-only) to `wss://irc-ws.chat.twitch.tv:443`
 * using the `justinfan` convention. Requests `twitch.tv/tags` and
 * `twitch.tv/commands` capabilities so every PRIVMSG carries full TMI tags
 * (display-name, color, badges, etc.).
 *
 * Zero external dependencies - uses the native browser WebSocket API.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type TwitchBadge = {
  set: string
  version: string
}

export type TwitchEmoteProvider = "twitch" | "bttv" | "ffz" | "7tv"

export type TwitchEmote = {
  id: string
  code: string
  provider: TwitchEmoteProvider
  imageUrl: string
  start: number
  end: number
}

export type TwitchChatReply = {
  parentMessageId: string
  parentDisplayName: string
  parentUserName: string
  parentBody: string
  parentColor: string | null
}

export type TwitchNoticeActor = {
  userName: string
  displayName: string
  color: string | null
}

export type TwitchChatMessage = {
  id: string
  channel: string
  roomId: string | null
  userName: string
  displayName: string
  text: string
  color: string | null
  receivedAt: string
  badges: TwitchBadge[]
  emotes: TwitchEmote[]
  reply: TwitchChatReply | null
  flags: {
    isBroadcaster: boolean
    isModerator: boolean
    isSubscriber: boolean
    isVip: boolean
    isFirst: boolean
    isAction: boolean
  }
}

export type TwitchSystemMessage = {
  id: string
  channel: string | null
  roomId: string | null
  text: string
  headline: string
  details: string | null
  receivedAt: string
  event: "subscription" | "raid" | "announcement" | "connection" | "notice" | "status"
  level: "info" | "success" | "warning" | "error"
  accentColor: string | null
  msgId: string | null
  actor: TwitchNoticeActor | null
  viewerCount: number | null
  cumulativeMonths: number | null
  streakMonths: number | null
  giftCount: number | null
  subPlan: string | null
  announcementTheme: string | null
}

export const EMPTY_SYSTEM_MESSAGE_META = {
  msgId: null,
  actor: null,
  viewerCount: null,
  cumulativeMonths: null,
  streakMonths: null,
  giftCount: null,
  subPlan: null,
  announcementTheme: null,
} as const satisfies Pick<
  TwitchSystemMessage,
  | "msgId"
  | "actor"
  | "viewerCount"
  | "cumulativeMonths"
  | "streakMonths"
  | "giftCount"
  | "subPlan"
  | "announcementTheme"
>

export type TwitchConnectionState = {
  connected: boolean
  connecting: boolean
  lastError: string | null
}

export type TwitchChannelJoinState = {
  joined: boolean
  joining: boolean
}

export type TwitchRoomState = {
  channel: string
  roomId: string | null
}

/** Tags from USERSTATE after the local user sends a message or joins a channel. */
export type TwitchSelfUserState = {
  channel: string
  roomId: string | null
  displayName: string
  color: string | null
  badges: TwitchBadge[]
  isModerator: boolean
  isSubscriber: boolean
}

export type TwitchChatEvent =
  | { type: "connected" }
  | { type: "disconnected"; reason: string | null }
  | { type: "channel-joined"; channel: string }
  | { type: "channel-parted"; channel: string }
  | { type: "room-state"; state: TwitchRoomState }
  | { type: "self-state"; state: TwitchSelfUserState }
  | { type: "message"; message: TwitchChatMessage }
  | { type: "system"; message: TwitchSystemMessage }
  | { type: "log"; text: string }
  | { type: "error"; text: string }

export type TwitchChatEventHandler = (event: TwitchChatEvent) => void

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TWITCH_WS_URL = "wss://irc-ws.chat.twitch.tv:443"
const ANONYMOUS_NICK = `justinfan${Math.floor(10000 + Math.random() * 90000)}`
const PING_TIMEOUT_MS = 320_000 // expect a PING within ~5 min
const RECONNECT_DELAY_MS = 3_000

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export type TwitchChatConnectOptions = {
  accessToken?: string
  nick?: string
}

export class TwitchChatClient {
  private ws: WebSocket | null = null
  private desiredChannels = new Set<string>()
  private joinedChannels = new Set<string>()
  private connectOptions: TwitchChatConnectOptions = {}
  private handler: TwitchChatEventHandler
  private pingTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private intentionalClose = false
  private sessionOpen = false
  private welcomeReceived = false

  constructor(handler: TwitchChatEventHandler) {
    this.handler = handler
  }

  /** Open an IRC session (anonymous or authenticated read). */
  open(options: TwitchChatConnectOptions = {}) {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
      this.connectOptions = options
      return
    }

    this.intentionalClose = false
    this.sessionOpen = true
    this.welcomeReceived = false
    this.connectOptions = options
    this.joinedChannels.clear()

    const ws = new WebSocket(TWITCH_WS_URL)
    this.ws = ws

    ws.addEventListener("open", () => {
      const token = options.accessToken?.trim()
      const nick = options.nick?.trim().toLowerCase()
      const pass = token ? `oauth:${token}` : "oauth:anonymous"
      const resolvedNick = nick || ANONYMOUS_NICK

      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands")
      ws.send(`PASS ${pass}`)
      ws.send(`NICK ${resolvedNick}`)
      this.resetPingTimer()
    })

    ws.addEventListener("message", (event) => {
      const raw = event.data as string
      for (const line of raw.split("\r\n")) {
        if (line.length > 0) {
          this.handleLine(line)
        }
      }
    })

    ws.addEventListener("close", (event) => {
      if (ws !== this.ws) {
        return
      }

      this.clearTimers()
      this.welcomeReceived = false
      const parted = [...this.joinedChannels]
      this.joinedChannels.clear()
      for (const channel of parted) {
        this.handler({ type: "channel-parted", channel })
      }

      if (!this.intentionalClose && this.sessionOpen) {
        this.handler({
          type: "disconnected",
          reason: event.reason || "Connection lost",
        })
        this.scheduleReconnect()
      } else {
        this.handler({ type: "disconnected", reason: null })
      }
    })

    ws.addEventListener("error", () => {
      if (ws !== this.ws) {
        return
      }

      this.handler({ type: "error", text: "WebSocket error" })
    })
  }

  /**
   * Sync joined channels to the desired set. Opens the session when needed.
   */
  setChannels(channels: string[], options: TwitchChatConnectOptions = {}) {
    const normalized = [
      ...new Set(
        channels.map((channel) => normalizeChannel(channel)).filter(Boolean)
      ),
    ]

    this.desiredChannels = new Set(normalized)
    this.connectOptions = options

    if (!this.sessionOpen) {
      if (normalized.length === 0) {
        return
      }
      this.open(options)
      return
    }

    if (!this.isConnected || !this.welcomeReceived) {
      return
    }

    this.syncJoins()
  }

  /** Cleanly disconnect and clear all channels. */
  close() {
    this.intentionalClose = true
    this.sessionOpen = false
    this.desiredChannels.clear()
    this.clearTimers()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  /** @deprecated Use open/setChannels/close instead. */
  connect(channel: string, options: TwitchChatConnectOptions = {}) {
    this.setChannels([channel], options)
  }

  /** @deprecated Use close instead. */
  disconnect() {
    this.close()
  }

  /** Whether there is an active WebSocket connection. */
  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN
  }

  /**
   * Send a chat message to a joined channel. Requires an authenticated session
   * (non-anonymous nick) and `chat:edit` on the OAuth token.
   */
  sendMessage(channel: string, message: string): boolean {
    const normalized = normalizeChannel(channel)
    const text = message.replace(/\r?\n/g, " ").trim()

    if (!text || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false
    }

    if (!this.joinedChannels.has(normalized)) {
      return false
    }

    this.ws.send(`PRIVMSG #${normalized} :${text}`)
    return true
  }

  private syncJoins() {
    const desired = this.desiredChannels
    const joined = this.joinedChannels

    for (const channel of joined) {
      if (!desired.has(channel)) {
        this.partChannel(channel)
      }
    }

    for (const channel of desired) {
      if (!joined.has(channel)) {
        this.joinChannel(channel)
      }
    }
  }

  private joinChannel(channel: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    this.ws.send(`JOIN #${channel}`)
    this.handler({ type: "log", text: `Joining #${channel}…` })
  }

  private partChannel(channel: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.joinedChannels.delete(channel)
      this.handler({ type: "channel-parted", channel })
      return
    }

    this.ws.send(`PART #${channel}`)
    this.joinedChannels.delete(channel)
    this.handler({ type: "channel-parted", channel })
    this.handler({ type: "log", text: `Left #${channel}` })
  }

  private markChannelJoined(channel: string) {
    if (this.joinedChannels.has(channel)) {
      return
    }

    this.joinedChannels.add(channel)
    this.handler({ type: "channel-joined", channel })
    this.handler({ type: "log", text: `Joined #${channel}` })
  }

  // -----------------------------------------------------------------------
  // IRC line handling
  // -----------------------------------------------------------------------

  private handleLine(raw: string) {
    // PING keep-alive
    if (raw.startsWith("PING")) {
      this.ws?.send(raw.replace("PING", "PONG"))
      this.resetPingTimer()
      return
    }

    // Successful welcome — join all desired channels
    if (raw.includes("001")) {
      this.welcomeReceived = true
      this.handler({ type: "connected" })
      this.syncJoins()
      return
    }

    // JOIN confirmation for our nick
    if (raw.includes(" JOIN #")) {
      const joinMatch = raw.match(/ JOIN #(\S+)/)
      if (joinMatch) {
        this.markChannelJoined(normalizeChannel(joinMatch[1]))
      }
      return
    }

    // ROOMSTATE - channel metadata including room-id, sent on join and updates
    if (raw.includes(" ROOMSTATE ")) {
      const state = parseRoomState(raw)
      if (state) {
        this.handler({ type: "room-state", state })
      }
      return
    }

    // USERSTATE - local user state after join or sending a message (no PRIVMSG echo)
    if (raw.includes(" USERSTATE ")) {
      const state = parseUserState(raw)
      if (state) {
        this.handler({ type: "self-state", state })
      }
      return
    }

    // PRIVMSG - chat message
    if (raw.includes("PRIVMSG")) {
      const message = parsePrivmsg(raw)
      if (message) {
        this.handler({ type: "message", message })
      }
      return
    }

    // USERNOTICE - subscriptions, gift subs, raids, etc.
    if (raw.includes(" USERNOTICE ")) {
      const message = parseUserNotice(raw)
      if (message) {
        this.handler({ type: "system", message })
      }
      return
    }

    // NOTICE - e.g. "No such channel"
    if (raw.includes("NOTICE")) {
      const noticeMessage = parseNotice(raw)
      if (noticeMessage) {
        this.handler({ type: "system", message: noticeMessage })
        this.handler({ type: "log", text: noticeMessage.text })
      } else {
        const noticeText = raw.split(" :").pop() ?? raw
        this.handler({ type: "log", text: noticeText })
      }
    }
  }

  // -----------------------------------------------------------------------
  // Timers
  // -----------------------------------------------------------------------

  private resetPingTimer() {
    if (this.pingTimer) clearTimeout(this.pingTimer)
    this.pingTimer = setTimeout(() => {
      this.handler({
        type: "error",
        text: "No PING from Twitch - reconnecting",
      })
      this.ws?.close()
    }, PING_TIMEOUT_MS)
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (!this.sessionOpen || this.intentionalClose) return
    if (this.desiredChannels.size === 0) return

    this.handler({
      type: "log",
      text: `Reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`,
    })
    this.reconnectTimer = setTimeout(() => {
      this.welcomeReceived = false
      this.joinedChannels.clear()
      this.open(this.connectOptions)
    }, RECONNECT_DELAY_MS)
  }

  private clearTimers() {
    if (this.pingTimer) {
      clearTimeout(this.pingTimer)
      this.pingTimer = null
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}

// ---------------------------------------------------------------------------
// IRC message parser
// ---------------------------------------------------------------------------

/**
 * Parse a raw Twitch IRC PRIVMSG line (with tags) into a TwitchChatMessage.
 *
 * Expected format:
 *   @badge-info=...;badges=...;color=#FF4500;display-name=Foo;... :foo!foo@foo.tmi.twitch.tv PRIVMSG #channel :Hello world
 */
function parsePrivmsg(raw: string): TwitchChatMessage | null {
  // Split tags from the rest
  if (!raw.startsWith("@")) return null

  const parsed = splitTaggedLine(raw)
  if (!parsed) return null

  const { tags, rest } = parsed

  // Parse prefix to get userName
  // :foo!foo@foo.tmi.twitch.tv PRIVMSG #channel :message
  const prefixMatch = rest.match(/^:(\w+)!\S+ PRIVMSG #(\S+) :(.*)$/)
  if (!prefixMatch) return null

  const userName = prefixMatch[1]
  const channel = prefixMatch[2]
  let messageText = prefixMatch[3]

  // Detect /me (ACTION) messages
  const isAction =
    messageText.startsWith("\x01ACTION ") && messageText.endsWith("\x01")
  if (isAction) {
    messageText = messageText.slice(8, -1)
  }

  // Extract badge info
  const badges = tags.get("badges") ?? ""
  const parsedBadges = parseBadgesTag(badges)
  const parsedEmotes = parseEmotesTag(tags.get("emotes") ?? "", messageText)

  const displayName = tags.get("display-name") || userName
  const color = tags.get("color") || null
  const id = tags.get("id") || stableMessageId(channel, userName, messageText)
  const roomId = tags.get("room-id") || null
  const reply = parseReplyTag(tags)

  // Timestamp: tmi-sent-ts is in milliseconds
  const tmiTs = tags.get("tmi-sent-ts")
  const receivedAt = tmiTs
    ? new Date(Number(tmiTs)).toISOString()
    : new Date().toISOString()

  return {
    id,
    channel,
    roomId,
    userName,
    displayName,
    text: messageText,
    color,
    receivedAt,
    badges: parsedBadges,
    emotes: parsedEmotes,
    reply,
    flags: {
      isBroadcaster: badges.includes("broadcaster/"),
      isModerator: tags.get("mod") === "1",
      isSubscriber: tags.get("subscriber") === "1",
      isVip: tags.has("vip"),
      isFirst: tags.get("first-msg") === "1",
      isAction,
    },
  }
}

function parseRoomState(raw: string): TwitchRoomState | null {
  const parsed = splitTaggedLine(raw)
  if (!parsed) return null

  const match = parsed.rest.match(/^:tmi\.twitch\.tv ROOMSTATE #(\S+)$/)
  if (!match) return null

  return {
    channel: match[1],
    roomId: parsed.tags.get("room-id") || null,
  }
}

function parseUserState(raw: string): TwitchSelfUserState | null {
  const parsed = splitTaggedLine(raw)
  if (!parsed) return null

  const match = parsed.rest.match(/^:tmi\.twitch\.tv USERSTATE #(\S+)$/)
  if (!match) return null

  const badges = parseBadgesTag(parsed.tags.get("badges") ?? "")

  return {
    channel: match[1],
    roomId: parsed.tags.get("room-id") || null,
    displayName: parsed.tags.get("display-name") || "",
    color: parsed.tags.get("color") || null,
    badges,
    isModerator: parsed.tags.get("mod") === "1",
    isSubscriber: parsed.tags.get("subscriber") === "1",
  }
}

/** Build a timeline entry for a message the local user just sent (Twitch does not echo PRIVMSG). */
export function createLocalChatMessage(params: {
  channel: string
  roomId: string | null
  text: string
  userName: string
  displayName: string
  color: string | null
  badges: TwitchBadge[]
  isModerator?: boolean
  isSubscriber?: boolean
}): TwitchChatMessage {
  const badges = params.badges
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `local:${crypto.randomUUID()}`
      : `local:${Date.now()}-${Math.random().toString(36).slice(2)}`

  return {
    id,
    channel: params.channel,
    roomId: params.roomId,
    userName: params.userName,
    displayName: params.displayName,
    text: params.text,
    color: params.color,
    receivedAt: new Date().toISOString(),
    badges,
    emotes: [],
    reply: null,
    flags: {
      isBroadcaster: badges.some((badge) => badge.set === "broadcaster"),
      isModerator:
        params.isModerator ??
        badges.some((badge) => badge.set === "moderator"),
      isSubscriber:
        params.isSubscriber ??
        badges.some((badge) => badge.set === "subscriber"),
      isVip: badges.some((badge) => badge.set === "vip"),
      isFirst: false,
      isAction: false,
    },
  }
}

function parseUserNotice(raw: string): TwitchSystemMessage | null {
  const parsed = splitTaggedLine(raw)
  if (!parsed) return null

  const match = parsed.rest.match(/^:\S+ USERNOTICE #(\S+)(?: :(.*))?$/)
  if (!match) return null

  const channel = match[1]
  const roomId = parsed.tags.get("room-id") || null
  const trailingText = match[2] ? decodeTagValue(match[2]) : ""
  const systemText = decodeTagValue(parsed.tags.get("system-msg") ?? "")
  const msgId = parsed.tags.get("msg-id") ?? ""
  const event = getUserNoticeEvent(msgId)
  const headline = systemText || getUserNoticeHeadline(msgId)
  const details = trailingText.trim() || null
  const announcementTheme = parsed.tags.get("msg-param-color") ?? null

  const text = [headline, details].filter(Boolean).join(" ").trim() ||
    "Channel event"

  return {
    id:
      parsed.tags.get("id") ||
      stableSystemMessageId(channel, msgId || "usernotice", text),
    channel,
    roomId,
    text,
    headline,
    details,
    receivedAt: parseTmiTimestamp(parsed.tags),
    event,
    level: event === "subscription" || event === "raid" ? "success" : "info",
    accentColor:
      event === "announcement"
        ? resolveAnnouncementColor(announcementTheme)
        : null,
    msgId: msgId || null,
    actor: parseNoticeActor(parsed.tags),
    viewerCount: parseOptionalInt(parsed.tags.get("msg-param-viewerCount")),
    cumulativeMonths: parseOptionalInt(
      parsed.tags.get("msg-param-cumulative-months") ??
        parsed.tags.get("msg-param-months")
    ),
    streakMonths: parseOptionalInt(parsed.tags.get("msg-param-streak-months")),
    giftCount: parseOptionalInt(
      parsed.tags.get("msg-param-mass-gift-count") ??
        parsed.tags.get("msg-param-sender-count")
    ),
    subPlan: parsed.tags.get("msg-param-sub-plan") || null,
    announcementTheme,
  }
}

function parseNotice(raw: string): TwitchSystemMessage | null {
  const parsed = splitTaggedLine(raw)
  if (!parsed) return null

  const match = parsed.rest.match(/^:\S+ NOTICE #(\S+) :(.*)$/)
  if (!match) return null

  const channel = match[1]
  const text = decodeTagValue(match[2]).trim()
  if (!text) return null

  return {
    id: stableSystemMessageId(channel, "notice", text),
    channel,
    roomId: parsed.tags.get("room-id") || null,
    text,
    headline: text,
    details: null,
    receivedAt: parseTmiTimestamp(parsed.tags),
    event: "notice",
    level: "warning",
    accentColor: null,
    msgId: null,
    actor: null,
    viewerCount: null,
    cumulativeMonths: null,
    streakMonths: null,
    giftCount: null,
    subPlan: null,
    announcementTheme: null,
  }
}

function parseBadgesTag(raw: string): TwitchBadge[] {
  if (!raw) return []
  return raw
    .split(",")
    .map((b) => {
      const [set, version] = b.split("/")
      return { set, version: version ?? "1" }
    })
    .filter((b) => b.set)
}

function parseEmotesTag(raw: string, text: string): TwitchEmote[] {
  if (!raw) return []
  const emotes: TwitchEmote[] = []
  for (const group of raw.split("/")) {
    const [id, positions] = group.split(":")
    if (!id || !positions) continue
    for (const pos of positions.split(",")) {
      const [start, end] = pos.split("-")
      const parsedStart = parseInt(start, 10)
      const parsedEnd = parseInt(end, 10)
      const code = text.slice(parsedStart, parsedEnd + 1)
      emotes.push({
        id,
        code,
        provider: "twitch",
        imageUrl: `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/static/dark/1.0`,
        start: parsedStart,
        end: parsedEnd,
      })
    }
  }
  return emotes.sort((a, b) => a.start - b.start)
}

function parseTmiTimestamp(tags: Map<string, string>): string {
  const tmiTs = tags.get("tmi-sent-ts")
  return tmiTs ? new Date(Number(tmiTs)).toISOString() : new Date().toISOString()
}

function decodeTagValue(value: string): string {
  return value
    .replace(/\\s/g, " ")
    .replace(/\\:/g, ";")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\\\/g, "\\")
}

function getUserNoticeEvent(
  msgId: string
): TwitchSystemMessage["event"] {
  if (msgId === "announcement") {
    return "announcement"
  }

  if (msgId === "raid") {
    return "raid"
  }

  return isSubscriptionNotice(msgId) ? "subscription" : "status"
}

function getUserNoticeHeadline(msgId: string): string {
  switch (msgId) {
    case "announcement":
      return "Announcement"
    case "raid":
      return "Raid"
    case "ritual":
      return "Channel event"
    default:
      return "Channel event"
  }
}

function parseReplyTag(tags: Map<string, string>): TwitchChatReply | null {
  const parentMessageId = tags.get("reply-parent-msg-id")
  if (!parentMessageId) {
    return null
  }

  const parentUserName =
    tags.get("reply-parent-user-login") ??
    tags.get("reply-parent-login") ??
    ""

  return {
    parentMessageId,
    parentDisplayName:
      tags.get("reply-parent-display-name") || parentUserName || "User",
    parentUserName,
    parentBody: decodeTagValue(tags.get("reply-parent-msg-body") ?? ""),
    parentColor: tags.get("reply-parent-user-color") || null,
  }
}

function parseNoticeActor(tags: Map<string, string>): TwitchNoticeActor | null {
  const userName = tags.get("login") ?? ""
  const displayName = tags.get("display-name") || userName

  if (!displayName) {
    return null
  }

  return {
    userName,
    displayName,
    color: tags.get("color") || null,
  }
}

function parseOptionalInt(value: string | undefined): number | null {
  if (!value) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function resolveAnnouncementColor(value: string | null): string | null {
  switch (value?.toLowerCase()) {
    case "blue":
      return "#00d6d6"
    case "green":
      return "#00db84"
    case "orange":
      return "#ffb31a"
    case "purple":
      return "#ff75e6"
    case "primary":
      return "#9146ff"
    default:
      return "#9146ff"
  }
}

function isSubscriptionNotice(msgId: string): boolean {
  return /sub|gift|primepaidupgrade|anongiftpaidupgrade/i.test(msgId)
}

function splitTaggedLine(raw: string): {
  tags: Map<string, string>
  rest: string
} | null {
  const spaceAfterTags = raw.indexOf(" ")
  if (spaceAfterTags === -1) return null

  const tagsSection = raw.slice(1, spaceAfterTags)
  const rest = raw.slice(spaceAfterTags + 1)
  const tags = new Map<string, string>()

  for (const pair of tagsSection.split(";")) {
    const eqIdx = pair.indexOf("=")
    if (eqIdx === -1) {
      tags.set(pair, "")
    } else {
      tags.set(pair.slice(0, eqIdx), pair.slice(eqIdx + 1))
    }
  }

  return { tags, rest }
}

function normalizeChannel(channel: string) {
  return channel.trim().replace(/^#/, "").toLowerCase()
}

function stableMessageId(
  channel: string,
  userName: string,
  text: string
): string {
  // Simple hash for deduplication when Twitch doesn't provide an id tag
  return `${channel}:${userName}:${Date.now()}:${text.slice(0, 20)}`
}

function stableSystemMessageId(
  channel: string,
  eventType: string,
  text: string
): string {
  return `${channel}:system:${eventType}:${Date.now()}:${text.slice(0, 24)}`
}
