import { devChatLogger, isDevIrcLoggingEnabled } from "@/lib/dev-logger"
import type { TwitchChatModesPatch } from "@/lib/chat/chat-modes"
import {
  type IrcTaggedLine,
  isIrcJoinLine,
  isIrcClearChatLine,
  isIrcClearMsgLine,
  isIrcNoticeLine,
  isIrcPongLine,
  isIrcPrivmsgLine,
  isIrcRoomStateLine,
  isIrcUsernoticeLine,
  isIrcUserStateLine,
  isIrcWelcomeLine,
  parseIrcJoinChannel,
  splitTaggedLine,
} from "@/lib/twitch/irc-line"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import { buildTwitchEmoteCdnUrl } from "@/lib/twitch/twitch-api"
import { codePointRangeToUtf16Indices } from "@/lib/twitch/twitch-emote-positions"

/**
 * Browser-native Twitch IRC client over WebSocket.
 *
 * Supports two modes:
 * - `read`: joins channels anonymously and receives chat (including the local
 *   user's messages sent through a separate send connection).
 * - `send`: authenticated, joins channels only for send-status probes, sends PRIVMSG.
 *
 * Connects to `wss://irc-ws.chat.twitch.tv:443`. Requests `twitch.tv/tags`
 * and `twitch.tv/commands` capabilities so every PRIVMSG carries full TMI tags.
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
  /** 7TV zero-width emotes rendered on top of this emote. */
  overlays?: TwitchEmote[]
}

/** Index after the last character consumed by an emote and its zero-width overlays. */
export function getEmoteConsumedEnd(emote: TwitchEmote): number {
  let end = emote.end
  for (const overlay of emote.overlays ?? []) {
    end = Math.max(end, overlay.end)
  }
  return end + 1
}

export type TwitchChatReply = {
  parentMessageId: string
  parentDisplayName: string
  parentUserName: string
  parentBody: string
  parentColor: string | null
}

export type TwitchNoticeActor = {
  userId: string | null
  userName: string
  displayName: string
  color: string | null
}

export type TwitchSystemModActionKind =
  | "timeout"
  | "ban"
  | "untimeout"
  | "unban"
  | "anonymous_timeout"
  | "anonymous_ban"
  | "suspicious_monitored"
  | "suspicious_restricted"
  | "suspicious_removed"

export type TwitchChatMessage = {
  id: string
  channel: string
  roomId: string | null
  userId: string | null
  userName: string
  displayName: string
  text: string
  color: string | null
  receivedAt: string
  badges: TwitchBadge[]
  badgeInfo: TwitchBadge[]
  emotes: TwitchEmote[]
  reply: TwitchChatReply | null
  /** ISO timestamp when the message was deleted; null while still visible. */
  deletedAt: string | null
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
  detailsEmotes?: TwitchEmote[]
  receivedAt: string
  event:
    | "subscription"
    | "raid"
    | "announcement"
    | "mod_action"
    | "connection"
    | "notice"
    | "status"
  level: "info" | "success" | "warning" | "error"
  accentColor: string | null
  msgId: string | null
  banDurationSeconds: number | null
  actor: TwitchNoticeActor | null
  target: TwitchNoticeActor | null
  badges: TwitchBadge[]
  modActionKind: TwitchSystemModActionKind | null
  viewerCount: number | null
  cumulativeMonths: number | null
  streakMonths: number | null
  giftCount: number | null
  subPlan: string | null
  announcementTheme: string | null
}

export const EMPTY_SYSTEM_MESSAGE_META = {
  msgId: null,
  banDurationSeconds: null,
  actor: null,
  target: null,
  badges: [],
  modActionKind: null,
  viewerCount: null,
  cumulativeMonths: null,
  streakMonths: null,
  giftCount: null,
  subPlan: null,
  announcementTheme: null,
} as const satisfies Pick<
  TwitchSystemMessage,
  | "msgId"
  | "banDurationSeconds"
  | "actor"
  | "target"
  | "badges"
  | "modActionKind"
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
  modes: TwitchChatModesPatch
  isComplete: boolean
}

/** Tags from USERSTATE after the local user sends a message or joins a channel. */
export type TwitchSelfUserState = {
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

export type TwitchClearMsgEvent = {
  channel: string
  messageId: string
  login: string | null
  text: string | null
}

export type TwitchClearChatEvent = {
  channel: string
  targetUserName: string | null
  targetUserId: string | null
  banDurationSeconds: number | null
}

export type TwitchChatEvent =
  | { type: "connected" }
  | { type: "connection-lost"; reason: string }
  | { type: "disconnected"; reason: string | null }
  | { type: "channel-joined"; channel: string }
  | { type: "channel-parted"; channel: string }
  | { type: "room-state"; state: TwitchRoomState }
  | { type: "self-state"; state: TwitchSelfUserState }
  | { type: "message"; message: TwitchChatMessage }
  | { type: "clear-msg"; event: TwitchClearMsgEvent }
  | { type: "clear-chat"; event: TwitchClearChatEvent }
  | { type: "system"; message: TwitchSystemMessage }
  | { type: "log"; text: string }
  | { type: "error"; text: string }

export type TwitchChatEventHandler = (event: TwitchChatEvent) => void

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TWITCH_WS_URL = "wss://irc-ws.chat.twitch.tv:443"
const ANONYMOUS_NICK = `justinfan${Math.floor(10000 + Math.random() * 90000)}`
const HEARTBEAT_INTERVAL_MS = 5_000
const HEARTBEAT_PONG_TIMEOUT_MS = 4_000
const RECONNECT_DELAY_MS = 1_000

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export type TwitchChatConnectOptions = {
  accessToken?: string
  nick?: string
}

export type TwitchChatClientMode = "read" | "send"

export class TwitchChatClient {
  private ws: WebSocket | null = null
  private desiredChannels = new Set<string>()
  private joinedChannels = new Set<string>()
  private connectOptions: TwitchChatConnectOptions = {}
  private handler: TwitchChatEventHandler
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private heartbeatPongTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private intentionalClose = false
  private sessionOpen = false
  private welcomeReceived = false
  private mode: TwitchChatClientMode
  private statusProbeChannels = new Set<string>()

  constructor(
    handler: TwitchChatEventHandler,
    mode: TwitchChatClientMode = "read"
  ) {
    this.handler = handler
    this.mode = mode
  }

  private emit(event: TwitchChatEvent) {
    devChatLogger.debugLazy(() => ["event", summarizeChatEvent(event)])
    this.handler(event)
  }

  /** Open an IRC session (anonymous or authenticated read). */
  open(options: TwitchChatConnectOptions = {}) {
    if (this.mode === "send") {
      this.openSendSession(options)
      return
    }

    if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
      this.connectOptions = options
      return
    }

    this.intentionalClose = false
    this.sessionOpen = true
    this.welcomeReceived = false
    this.connectOptions = options
    this.joinedChannels.clear()
    this.openWebSocket(options)
  }

  /**
   * Open an authenticated send-only IRC session. The connection never joins
   * channels but can still send PRIVMSG to any channel.
   */
  openSendSession(options: TwitchChatConnectOptions) {
    if (this.mode !== "send") {
      return
    }

    const token = options.accessToken?.trim()
    const nick = options.nick?.trim().toLowerCase()
    if (!token || !nick) {
      return
    }

    this.connectOptions = options

    if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
      return
    }

    this.intentionalClose = false
    this.sessionOpen = true
    this.welcomeReceived = false
    this.openWebSocket(options)
  }

  /**
   * Sync joined channels to the desired set. Opens the session when needed.
   */
  setChannels(channels: string[], options: TwitchChatConnectOptions = {}) {
    if (this.mode === "send") {
      this.openSendSession(options)
      return
    }

    const normalized = [
      ...new Set(
        channels.flatMap((channel) => {
          const login = normalizeChannelLogin(channel)
          return login ? [login] : []
        })
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
    if (this.mode === "read") {
      this.desiredChannels.clear()
    } else {
      this.statusProbeChannels.clear()
    }
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
   * Join a channel briefly on the send connection to detect ban/timeout status.
   * The client parts again after USERSTATE or a rejection NOTICE.
   */
  probeSendStatus(channels: string[]) {
    if (
      this.mode !== "send" ||
      !this.ws ||
      this.ws.readyState !== WebSocket.OPEN
    ) {
      return
    }

    for (const channel of channels) {
      const normalized = normalizeChannelLogin(channel)
      if (!normalized || this.statusProbeChannels.has(normalized)) {
        continue
      }

      this.statusProbeChannels.add(normalized)
      this.joinChannel(normalized)
    }
  }

  private completeStatusProbe(channel: string) {
    const normalized = normalizeChannelLogin(channel)
    if (!this.statusProbeChannels.delete(normalized)) {
      return
    }

    if (this.joinedChannels.has(normalized)) {
      this.partChannel(normalized)
    }
  }

  /**
   * Send a chat message to a channel. Read clients cannot send. Send clients
   * do not need to join the channel first.
   */
  sendMessage(
    channel: string,
    message: string,
    options: {
      replyParentMessageId?: string | null
      isAction?: boolean
    } = {}
  ): boolean {
    if (this.mode !== "send") {
      return false
    }

    const normalized = normalizeChannelLogin(channel)
    const text = message.replace(/\r?\n/g, " ").trim()

    if (!text || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false
    }

    const replyParentMessageId = options.replyParentMessageId?.trim()
    const replyTag = replyParentMessageId
      ? `@reply-parent-msg-id=${replyParentMessageId} `
      : ""
    const payload = options.isAction ? `\x01ACTION ${text}\x01` : text
    this.ws.send(`${replyTag}PRIVMSG #${normalized} :${payload}`)
    return true
  }

  private openWebSocket(options: TwitchChatConnectOptions) {
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

      if (this.mode === "read") {
        const parted = [...this.joinedChannels]
        this.joinedChannels.clear()
        for (const channel of parted) {
          this.emit({ type: "channel-parted", channel })
        }
      }

      if (!this.intentionalClose && this.sessionOpen) {
        this.emit({
          type: "disconnected",
          reason: event.reason || "Connection lost",
        })
        this.scheduleReconnect()
      } else {
        this.emit({ type: "disconnected", reason: null })
      }
    })

    ws.addEventListener("error", () => {
      if (ws !== this.ws) {
        return
      }

      this.emit({ type: "error", text: "WebSocket error" })
    })
  }

  /**
   * Browser WebSockets do not expose native ping frames. Use this when there is
   * external evidence (for example `offline`) that the socket is stale.
   */
  forceReconnect(reason = "Connection lost") {
    if (!this.sessionOpen || this.intentionalClose) {
      return
    }

    this.emit({ type: "connection-lost", reason })

    if (this.ws) {
      this.ws.close(4000, reason)
      return
    }

    this.emit({ type: "disconnected", reason })
    this.scheduleReconnect()
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
    this.emit({ type: "log", text: `Joining #${channel}…` })
  }

  private partChannel(channel: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.joinedChannels.delete(channel)
      this.emit({ type: "channel-parted", channel })
      return
    }

    this.ws.send(`PART #${channel}`)
    this.joinedChannels.delete(channel)
    this.emit({ type: "channel-parted", channel })
    this.emit({ type: "log", text: `Left #${channel}` })
  }

  private markChannelJoined(channel: string) {
    if (this.joinedChannels.has(channel)) {
      return
    }

    this.joinedChannels.add(channel)
    this.emit({ type: "channel-joined", channel })
    this.emit({ type: "log", text: `Joined #${channel}` })
  }

  // -----------------------------------------------------------------------
  // IRC line handling
  // -----------------------------------------------------------------------

  private handleLine(raw: string) {
    if (isDevIrcLoggingEnabled()) {
      devChatLogger.debug("irc:line", raw)
    }

    // Inbound IRC traffic proves the socket is still live.
    this.clearHeartbeatPongTimer()

    // PING keep-alive
    if (raw.startsWith("PING")) {
      if (isDevIrcLoggingEnabled()) {
        devChatLogger.debug("irc:kind", "ping")
      }
      this.ws?.send(raw.replace("PING", "PONG"))
      return
    }

    const tagged = raw.startsWith("@") ? splitTaggedLine(raw) : null
    const rest = tagged?.rest ?? raw

    if (isIrcPongLine(rest)) {
      if (isDevIrcLoggingEnabled()) {
        devChatLogger.debug("irc:kind", "pong")
      }
      this.clearHeartbeatPongTimer()
      return
    }

    // Successful welcome — join all desired channels (RPL_WELCOME / 001).
    if (isIrcWelcomeLine(rest)) {
      if (isDevIrcLoggingEnabled()) {
        devChatLogger.debug("irc:kind", "welcome")
      }
      this.welcomeReceived = true
      this.startHeartbeat()
      this.emit({ type: "connected" })
      if (this.mode === "read") {
        this.syncJoins()
      }
      return
    }

    // JOIN confirmation for our nick
    if (isIrcJoinLine(rest)) {
      if (isDevIrcLoggingEnabled()) {
        devChatLogger.debug("irc:kind", "join")
      }
      const channel = parseIrcJoinChannel(rest)
      if (channel) {
        this.markChannelJoined(normalizeChannelLogin(channel))
      } else {
        devChatLogger.warn("irc:parse-failed", "JOIN", raw)
      }
      return
    }

    // ROOMSTATE - channel metadata including room-id, sent on join and updates
    if (isIrcRoomStateLine(rest)) {
      if (isDevIrcLoggingEnabled()) {
        devChatLogger.debug("irc:kind", "roomstate")
      }
      const state = tagged ? parseRoomState(tagged) : null
      if (state) {
        this.emit({ type: "room-state", state })
      } else {
        devChatLogger.warn("irc:parse-failed", "ROOMSTATE", raw)
      }
      return
    }

    // USERSTATE - local user state after join or sending a message (no PRIVMSG echo)
    if (isIrcUserStateLine(rest)) {
      if (isDevIrcLoggingEnabled()) {
        devChatLogger.debug("irc:kind", "userstate")
      }
      const state = tagged ? parseUserState(tagged) : null
      if (state) {
        this.emit({ type: "self-state", state })
        if (this.mode === "send") {
          this.completeStatusProbe(state.channel)
        }
      } else {
        devChatLogger.warn("irc:parse-failed", "USERSTATE", raw)
      }
      return
    }

    if (isIrcPrivmsgLine(rest)) {
      if (isDevIrcLoggingEnabled()) {
        devChatLogger.debug("irc:kind", "privmsg")
      }
      const message = tagged ? parsePrivmsg(tagged) : null
      if (message) {
        this.emit({ type: "message", message })
      } else {
        devChatLogger.warn("irc:parse-failed", "PRIVMSG", raw)
      }
      return
    }

    // USERNOTICE - subscriptions, gift subs, raids, announcements, etc.
    if (isIrcUsernoticeLine(rest)) {
      if (isDevIrcLoggingEnabled()) {
        devChatLogger.debug("irc:kind", "usernotice")
      }
      const message = tagged ? parseUserNotice(tagged) : null
      if (message) {
        this.emit({ type: "system", message })
      } else {
        devChatLogger.warn("irc:parse-failed", "USERNOTICE", raw)
      }
      return
    }

    if (isIrcClearMsgLine(rest)) {
      if (isDevIrcLoggingEnabled()) {
        devChatLogger.debug("irc:kind", "clearmsg")
      }
      const clearMsg = tagged ? parseClearMsg(tagged) : null
      if (clearMsg) {
        this.emit({ type: "clear-msg", event: clearMsg })
      } else {
        devChatLogger.warn("irc:parse-failed", "CLEARMSG", raw)
      }
      return
    }

    if (isIrcClearChatLine(rest)) {
      if (isDevIrcLoggingEnabled()) {
        devChatLogger.debug("irc:kind", "clearchat")
      }
      const clearChat = tagged ? parseClearChat(tagged) : null
      if (clearChat) {
        this.emit({ type: "clear-chat", event: clearChat })
      } else {
        devChatLogger.warn("irc:parse-failed", "CLEARCHAT", raw)
      }
      return
    }

    // NOTICE - e.g. "No such channel"
    if (isIrcNoticeLine(rest)) {
      if (isDevIrcLoggingEnabled()) {
        devChatLogger.debug("irc:kind", "notice")
      }
      const noticeMessage = tagged ? parseNotice(tagged) : null
      if (noticeMessage) {
        this.emit({ type: "system", message: noticeMessage })
        if (this.mode === "send" && noticeMessage.channel) {
          this.completeStatusProbe(noticeMessage.channel)
        }
        if (this.mode === "read") {
          this.emit({ type: "log", text: noticeMessage.text })
        }
      } else {
        const noticeText = raw.split(" :").pop() ?? raw
        devChatLogger.warn("irc:parse-failed", "NOTICE", raw)
        this.emit({ type: "log", text: noticeText })
      }
      return
    }

    devChatLogger.warn("irc:unhandled", raw)
  }

  // -----------------------------------------------------------------------
  // Timers
  // -----------------------------------------------------------------------

  private startHeartbeat() {
    this.stopHeartbeat()
    this.sendHeartbeatPing()
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeatPing()
    }, HEARTBEAT_INTERVAL_MS)
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    this.clearHeartbeatPongTimer()
  }

  private clearHeartbeatPongTimer() {
    if (this.heartbeatPongTimer) {
      clearTimeout(this.heartbeatPongTimer)
      this.heartbeatPongTimer = null
    }
  }

  private sendHeartbeatPing() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    if (this.heartbeatPongTimer) {
      return
    }

    this.ws.send("PING :tmi.twitch.tv")
    this.heartbeatPongTimer = setTimeout(() => {
      this.heartbeatPongTimer = null
      this.emit({
        type: "connection-lost",
        reason: "No PONG from Twitch",
      })
      this.emit({
        type: "error",
        text: "No PONG from Twitch - reconnecting",
      })
      this.ws?.close()
    }, HEARTBEAT_PONG_TIMEOUT_MS)
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (!this.sessionOpen || this.intentionalClose) return
    if (this.mode === "read" && this.desiredChannels.size === 0) return

    this.emit({
      type: "log",
      text: `Reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`,
    })
    this.reconnectTimer = setTimeout(() => {
      this.welcomeReceived = false
      if (this.mode === "read") {
        this.joinedChannels.clear()
      }
      if (this.mode === "send") {
        this.openSendSession(this.connectOptions)
        return
      }
      this.open(this.connectOptions)
    }, RECONNECT_DELAY_MS)
  }

  private clearTimers() {
    this.stopHeartbeat()
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
 *
 * The trailing `:` before the message body is optional (RFC 2812); recent-messages
 * may omit it when the body has no leading spaces.
 */
export function parseIrcPrivmsg(raw: string): TwitchChatMessage | null {
  if (!raw.startsWith("@")) return null
  const tagged = splitTaggedLine(raw)
  if (!tagged) return null
  return parsePrivmsg(tagged)
}

function parsePrivmsg(tagged: IrcTaggedLine): TwitchChatMessage | null {
  const { tags, rest } = tagged

  // Parse prefix to get userName
  // :foo!foo@foo.tmi.twitch.tv PRIVMSG #channel [:message]
  const prefixMatch = rest.match(
    /^:([^!\s]+)(?:!\S+)? PRIVMSG #(\S+)(?:\s(.*))?$/
  )
  if (!prefixMatch) return null

  const userName = prefixMatch[1]
  const channel = prefixMatch[2]
  let messageText = prefixMatch[3] ?? ""
  if (messageText.startsWith(":")) {
    messageText = messageText.slice(1)
  }

  // Detect /me (ACTION) messages
  const isAction =
    messageText.startsWith("\x01ACTION ") && messageText.endsWith("\x01")
  if (isAction) {
    messageText = messageText.slice(8, -1)
  }

  // Extract badge info
  const badges = tags.get("badges") ?? ""
  const badgeInfo = tags.get("badge-info") ?? ""
  const parsedBadges = parseBadgesTag(badges)
  const parsedBadgeInfo = parseBadgesTag(badgeInfo)
  const parsedEmotes = parseEmotesTag(tags.get("emotes") ?? "", messageText)

  const displayName = decodeTagValue(tags.get("display-name") || "") || userName
  const color = tags.get("color") || null
  const id = tags.get("id") || stableMessageId(channel, userName, messageText)
  const roomId = tags.get("room-id") || null
  const userId = tags.get("user-id") || null
  const reply = parseReplyTag(tags)

  const receivedAt = parseMessageReceivedAt(tags)

  return {
    id,
    channel,
    roomId,
    userId,
    userName,
    displayName,
    text: messageText,
    color,
    receivedAt,
    badges: parsedBadges,
    badgeInfo: parsedBadgeInfo,
    emotes: parsedEmotes,
    reply,
    deletedAt: null,
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

function parseClearMsg(tagged: IrcTaggedLine): TwitchClearMsgEvent | null {
  const match = tagged.rest.match(/^:\S+ CLEARMSG #(\S+)(?:\s(.*))?$/)
  if (!match) return null

  const messageId = tagged.tags.get("target-msg-id")?.trim()
  if (!messageId) return null

  let text = match[2] ?? ""
  if (text.startsWith(":")) {
    text = text.slice(1)
  }

  return {
    channel: match[1],
    messageId,
    login: tagged.tags.get("login")?.trim() || null,
    text: text || null,
  }
}

function parseClearChat(tagged: IrcTaggedLine): TwitchClearChatEvent | null {
  const match = tagged.rest.match(/^:\S+ CLEARCHAT #(\S+)(?:\s:(\S+))?$/)
  if (!match) return null

  const banDurationRaw = tagged.tags.get("ban-duration")
  const banDurationSeconds =
    banDurationRaw && banDurationRaw.length > 0
      ? Number.parseInt(banDurationRaw, 10)
      : null

  return {
    channel: match[1],
    targetUserName: match[2]?.trim() || null,
    targetUserId: tagged.tags.get("target-user-id")?.trim() || null,
    banDurationSeconds:
      banDurationSeconds !== null && Number.isFinite(banDurationSeconds)
        ? banDurationSeconds
        : null,
  }
}

export function createClearChatModActionMessage(
  event: TwitchClearChatEvent,
  receivedAt = new Date().toISOString()
): TwitchSystemMessage | null {
  const targetUserName = event.targetUserName?.trim()
  if (!targetUserName) {
    return null
  }

  const channel = normalizeChannelLogin(event.channel)
  const durationSeconds = event.banDurationSeconds
  const isTimeout =
    durationSeconds != null &&
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0

  const text = isTimeout
    ? `${targetUserName} was timed out for ${durationSeconds}s.`
    : `${targetUserName} was banned.`

  const targetDisplayName = targetUserName
  const targetLogin = targetUserName.toLowerCase()

  return {
    id: stableSystemMessageId(channel, "mod_action", text),
    channel,
    roomId: null,
    text,
    headline: text,
    details: null,
    receivedAt,
    event: "mod_action",
    level: "info",
    accentColor: null,
    ...EMPTY_SYSTEM_MESSAGE_META,
    banDurationSeconds: isTimeout ? durationSeconds : null,
    modActionKind: isTimeout ? "anonymous_timeout" : "anonymous_ban",
    target: {
      userId: event.targetUserId?.trim() || null,
      userName: targetLogin,
      displayName: targetDisplayName,
      color: null,
    },
  }
}

export type TwitchModerateActionKind = "timeout" | "ban" | "untimeout" | "unban"

export type TwitchModerateActionMessageInput = {
  channelLogin: string
  roomId?: string | null
  action: TwitchModerateActionKind
  moderatorUserId?: string | null
  moderatorUserName: string
  moderatorDisplayName: string
  targetUserId?: string | null
  targetUserName: string
  targetDisplayName: string
  banDurationSeconds?: number | null
  messageId?: string | null
  receivedAt?: string
}

function moderateActionDisplayName(
  displayName: string,
  userName: string
): string {
  const display = displayName.trim()
  if (display) return display
  return userName.trim()
}

export function isAnonymousBanTimeoutSystemMessage(
  message: TwitchSystemMessage,
  targetUserName: string
): boolean {
  if (message.event !== "mod_action" || message.actor) {
    return false
  }

  const target = targetUserName.trim().toLowerCase()
  if (!target) {
    return false
  }

  const text = message.text.trim().toLowerCase()
  if (text === `${target} was banned.`) {
    return true
  }

  const timeoutPrefix = `${target} was timed out for `
  return text.startsWith(timeoutPrefix) && / for \d+s\.$/.test(text)
}

export function createModerateActionMessage(
  input: TwitchModerateActionMessageInput
): TwitchSystemMessage | null {
  const channel = normalizeChannelLogin(input.channelLogin)
  const moderator = moderateActionDisplayName(
    input.moderatorDisplayName,
    input.moderatorUserName
  )
  const target = moderateActionDisplayName(
    input.targetDisplayName,
    input.targetUserName
  )
  if (!channel || !moderator || !target) {
    return null
  }

  let text: string
  let banDurationSeconds: number | null = null

  switch (input.action) {
    case "timeout": {
      const durationSeconds = input.banDurationSeconds
      if (
        durationSeconds != null &&
        Number.isFinite(durationSeconds) &&
        durationSeconds > 0
      ) {
        banDurationSeconds = Math.floor(durationSeconds)
        text = `${moderator} timed out ${target} for ${banDurationSeconds}s.`
      } else {
        text = `${moderator} timed out ${target}.`
      }
      break
    }
    case "ban":
      text = `${moderator} banned ${target}.`
      break
    case "untimeout":
      text = `${moderator} removed ${target}'s timeout.`
      break
    case "unban":
      text = `${moderator} unbanned ${target}.`
      break
    default:
      return null
  }

  const receivedAt = input.receivedAt ?? new Date().toISOString()
  const id = input.messageId?.trim()
    ? `${channel}:eventsub:mod_action:${input.messageId.trim()}`
    : stableSystemMessageId(channel, "mod_action", text)

  return {
    id,
    channel,
    roomId: input.roomId ?? null,
    text,
    headline: text,
    details: null,
    receivedAt,
    event: "mod_action",
    level: "info",
    accentColor: null,
    ...EMPTY_SYSTEM_MESSAGE_META,
    banDurationSeconds,
    modActionKind: input.action,
    actor: {
      userId: input.moderatorUserId?.trim() || null,
      userName: input.moderatorUserName.trim().toLowerCase(),
      displayName: moderator,
      color: null,
    },
    target: {
      userId: input.targetUserId?.trim() || null,
      userName: input.targetUserName.trim().toLowerCase(),
      displayName: target,
      color: null,
    },
  }
}

function parseRoomState(tagged: IrcTaggedLine): TwitchRoomState | null {
  const match = tagged.rest.match(/^:tmi\.twitch\.tv ROOMSTATE #(\S+)$/)
  if (!match) return null

  const tags = tagged.tags
  const hasEmoteOnly = tags.has("emote-only")
  const hasSubsOnly = tags.has("subs-only")
  const hasFollowersOnly = tags.has("followers-only")
  const hasR9k = tags.has("r9k")
  const hasSlow = tags.has("slow")

  const modes: TwitchChatModesPatch = {}

  if (hasEmoteOnly) {
    modes.emoteOnly = tags.get("emote-only") === "1"
  }
  if (hasSubsOnly) {
    modes.subscribersOnly = tags.get("subs-only") === "1"
  }
  if (hasFollowersOnly) {
    const value = Number(tags.get("followers-only"))
    if (Number.isFinite(value)) {
      modes.followersOnly = value >= 0
      modes.followersOnlyMinutes = value > 0 ? value : 0
    }
  }
  if (hasR9k) {
    modes.uniqueMode = tags.get("r9k") === "1"
  }
  if (hasSlow) {
    const value = Number(tags.get("slow"))
    if (Number.isFinite(value)) {
      modes.slowMode = value > 0
      modes.slowModeSeconds = value > 0 ? value : 0
    }
  }

  return {
    channel: match[1],
    roomId: tags.get("room-id") || null,
    modes,
    isComplete:
      hasEmoteOnly && hasSubsOnly && hasFollowersOnly && hasR9k && hasSlow,
  }
}

function parseUserState(tagged: IrcTaggedLine): TwitchSelfUserState | null {
  const match = tagged.rest.match(/^:tmi\.twitch\.tv USERSTATE #(\S+)$/)
  if (!match) return null

  const badges = parseBadgesTag(tagged.tags.get("badges") ?? "")

  return {
    channel: match[1],
    roomId: tagged.tags.get("room-id") || null,
    displayName: tagged.tags.get("display-name") || "",
    color: tagged.tags.get("color") || null,
    badges,
    isBroadcaster: badges.some((badge) => badge.set === "broadcaster"),
    isModerator: tagged.tags.get("mod") === "1",
    isSubscriber: tagged.tags.get("subscriber") === "1",
    isVip: badges.some((badge) => badge.set === "vip"),
  }
}

export function parseIrcUserNotice(raw: string): TwitchSystemMessage | null {
  if (!raw.startsWith("@")) return null
  const tagged = splitTaggedLine(raw)
  if (!tagged) return null
  return parseUserNotice(tagged)
}

function parseUserNotice(tagged: IrcTaggedLine): TwitchSystemMessage | null {
  const match = tagged.rest.match(/^:\S+ USERNOTICE #(\S+)(?: :(.*))?$/)
  if (!match) return null

  const channel = match[1]
  const roomId = tagged.tags.get("room-id") || null
  const trailingText = match[2] ? decodeTagValue(match[2]) : ""
  const systemText = decodeTagValue(tagged.tags.get("system-msg") ?? "")
  const msgId = tagged.tags.get("msg-id") ?? ""
  const event = getUserNoticeEvent(msgId)
  const headline = systemText || getUserNoticeHeadline(msgId)
  const details = trailingText.trim() || null
  const detailsEmotes =
    details && (tagged.tags.get("emotes") ?? "").trim()
      ? parseEmotesTag(tagged.tags.get("emotes") ?? "", details)
      : []
  const announcementTheme = tagged.tags.get("msg-param-color") ?? null

  const text =
    [headline, details].filter(Boolean).join(" ").trim() || "Channel event"

  return {
    id:
      tagged.tags.get("id") ||
      stableSystemMessageId(channel, msgId || "usernotice", text),
    channel,
    roomId,
    text,
    headline,
    details,
    detailsEmotes,
    receivedAt: parseTmiTimestamp(tagged.tags),
    event,
    level: event === "subscription" || event === "raid" ? "success" : "info",
    accentColor:
      event === "announcement"
        ? resolveAnnouncementColor(announcementTheme)
        : null,
    msgId: msgId || null,
    banDurationSeconds: null,
    actor: parseNoticeActor(tagged.tags),
    target: null,
    badges: parseBadgesTag(tagged.tags.get("badges") ?? ""),
    modActionKind: null,
    viewerCount: parseOptionalInt(tagged.tags.get("msg-param-viewerCount")),
    cumulativeMonths: parseOptionalInt(
      tagged.tags.get("msg-param-cumulative-months") ??
        tagged.tags.get("msg-param-months")
    ),
    streakMonths: parseOptionalInt(tagged.tags.get("msg-param-streak-months")),
    giftCount: parseOptionalInt(
      tagged.tags.get("msg-param-mass-gift-count") ??
        tagged.tags.get("msg-param-sender-count")
    ),
    subPlan: tagged.tags.get("msg-param-sub-plan") || null,
    announcementTheme,
  }
}

function parseNotice(tagged: IrcTaggedLine): TwitchSystemMessage | null {
  const match = tagged.rest.match(/^:\S+ NOTICE #(\S+) :(.*)$/)
  if (!match) return null

  const channel = match[1]
  const text = decodeTagValue(match[2]).trim()
  if (!text) return null

  return {
    id: stableSystemMessageId(channel, "notice", text),
    channel,
    roomId: tagged.tags.get("room-id") || null,
    text,
    headline: text,
    details: null,
    receivedAt: parseTmiTimestamp(tagged.tags),
    event: "notice",
    level: "warning",
    accentColor: null,
    msgId: tagged.tags.get("msg-id") || null,
    banDurationSeconds: parseOptionalInt(tagged.tags.get("ban-duration")),
    actor: null,
    target: null,
    badges: [],
    modActionKind: null,
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
      if (!Number.isFinite(parsedStart) || !Number.isFinite(parsedEnd)) {
        continue
      }

      const range = codePointRangeToUtf16Indices(text, parsedStart, parsedEnd)
      if (!range) {
        continue
      }

      const code = text.slice(range.start, range.end + 1)
      emotes.push({
        id,
        code,
        provider: "twitch",
        imageUrl: buildTwitchEmoteCdnUrl(id),
        start: range.start,
        end: range.end,
      })
    }
  }
  return emotes.sort((a, b) => a.start - b.start)
}

function parseMessageReceivedAt(tags: Map<string, string>): string {
  const rmTs = tags.get("rm-received-ts")
  if (rmTs) {
    const parsed = Number(rmTs)
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString()
    }
  }

  return parseTmiTimestamp(tags)
}

function parseTmiTimestamp(tags: Map<string, string>): string {
  const tmiTs = tags.get("tmi-sent-ts")
  return tmiTs
    ? new Date(Number(tmiTs)).toISOString()
    : new Date().toISOString()
}

function decodeTagValue(value: string): string {
  return value
    .replace(/\\s/g, " ")
    .replace(/\\:/g, ";")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\\\/g, "\\")
}

function getUserNoticeEvent(msgId: string): TwitchSystemMessage["event"] {
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
    tags.get("reply-parent-user-login") ?? tags.get("reply-parent-login") ?? ""

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
    userId: tags.get("user-id") || null,
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

function summarizeChatEvent(event: TwitchChatEvent): Record<string, unknown> {
  switch (event.type) {
    case "message":
      return {
        type: event.type,
        channel: event.message.channel,
        id: event.message.id,
        user: event.message.displayName,
        text: event.message.text.slice(0, 120),
        roomId: event.message.roomId,
      }
    case "system":
      return {
        type: event.type,
        channel: event.message.channel,
        event: event.message.event,
        msgId: event.message.msgId,
        text: event.message.text.slice(0, 120),
        roomId: event.message.roomId,
      }
    case "room-state":
      return {
        type: event.type,
        channel: event.state.channel,
        roomId: event.state.roomId,
        isComplete: event.state.isComplete,
        modes: event.state.modes,
      }
    case "self-state":
      return {
        type: event.type,
        channel: event.state.channel,
        roomId: event.state.roomId,
        displayName: event.state.displayName,
      }
    case "clear-msg":
      return {
        type: event.type,
        channel: event.event.channel,
        messageId: event.event.messageId,
        login: event.event.login,
      }
    case "clear-chat":
      return {
        type: event.type,
        channel: event.event.channel,
        targetUserName: event.event.targetUserName,
        targetUserId: event.event.targetUserId,
        banDurationSeconds: event.event.banDurationSeconds,
      }
    case "channel-joined":
    case "channel-parted":
      return { type: event.type, channel: event.channel }
    case "connection-lost":
      return { type: event.type, reason: event.reason }
    case "disconnected":
      return { type: event.type, reason: event.reason }
    case "connected":
      return { type: event.type }
    case "log":
    case "error":
      return { type: event.type, text: event.text }
    default:
      return { type: (event as TwitchChatEvent).type }
  }
}
