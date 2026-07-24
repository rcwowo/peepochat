/**
 * 7TV's websocket server is badly documented, so this is based on how their
 * official extension worker implements the EventAPI.
 * https://github.com/SevenTV/Extension/blob/master/src/worker/worker.events.ts
 */

const SEVENTV_EVENT_API_URL = "wss://events.7tv.io/v3"

const Opcode = {
  Dispatch: 0,
  Hello: 1,
  Heartbeat: 2,
  Reconnect: 4,
  Ack: 5,
  Error: 6,
  EndOfStream: 7,
  Resume: 34,
  Subscribe: 35,
  Unsubscribe: 36,
} as const

const DEFAULT_HEARTBEAT_INTERVAL_MS = 25_000
const HEARTBEAT_TIMEOUT_MULTIPLIER = 3
const RECONNECT_MIN_MS = 1_000
const RECONNECT_MAX_MS = 120_000

export type SevenTvActiveEmote = {
  id: string
  name: string
  data?: {
    host?: {
      url: string
      files?: Array<{ name: string }>
    }
    alias?: string[]
    flags?: number
    listed?: boolean
    owner?: {
      display_name?: string
      username?: string
      connections?: Array<{
        platform?: string
        username?: string
        display_name?: string
      }>
    }
  }
}

export type SevenTvEmoteSetUpdateEvent = {
  emoteSetId: string
  actorName: string
  added: SevenTvActiveEmote[]
  removed: Array<{ id: string; name: string }>
  renamed: Array<{ id: string; oldName: string; newName: string }>
}

export type SevenTvUserEmoteSetChangeEvent = {
  userId: string
  actorName: string
  oldEmoteSetId: string
  emoteSetId: string
  connectionIndex: number
}

export type SevenTvEventApiHandlers = {
  onEmoteSetUpdate?: (event: SevenTvEmoteSetUpdateEvent) => void
  onUserEmoteSetChange?: (event: SevenTvUserEmoteSetChangeEvent) => void
}

/** Matches the official extension: wildcards + channel-context conditions. */
type SubscriptionType = "emote_set.*" | "user.*"

type SubscriptionCondition =
  | { object_id: string }
  | { ctx: "channel"; platform: "TWITCH"; id: string }

type DesiredSubscription = {
  type: SubscriptionType
  condition: SubscriptionCondition
  refCount: number
  /** True once the current session has an ACK for this subscription. */
  confirmed: boolean
}

type EventApiMessage = {
  op: number
  d?: unknown
}

function conditionKey(condition: SubscriptionCondition): string {
  if ("object_id" in condition) {
    return `object_id=${condition.object_id}`
  }
  return `channel:TWITCH:${condition.id}`
}

function subscriptionKey(
  type: SubscriptionType,
  condition: SubscriptionCondition
) {
  return `${type}|${conditionKey(condition)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function conditionsEqual(
  left: SubscriptionCondition,
  right: SubscriptionCondition
): boolean {
  return conditionKey(left) === conditionKey(right)
}

function parseActiveEmote(value: unknown): SevenTvActiveEmote | null {
  if (!isRecord(value)) return null
  const id = asString(value.id)
  const name = asString(value.name)
  if (!id || !name) return null
  return value as SevenTvActiveEmote
}

export class SevenTvEventApi {
  private socket: WebSocket | null = null
  private readonly desired = new Map<string, DesiredSubscription>()
  private handlers: SevenTvEventApiHandlers = {}
  private heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS
  private lastHeartbeatAt = 0
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempt = 0
  private shouldReconnect = false
  private connectGeneration = 0
  private sessionReady = false
  private sessionId = ""

  setHandlers(handlers: SevenTvEventApiHandlers) {
    this.handlers = handlers
  }

  /** Subscribe to emote set changes by 7TV emote-set id (extension: emote_set.*). */
  subscribeEmoteSet(emoteSetId: string) {
    const id = emoteSetId.trim()
    if (!id) return
    this.retain("emote_set.*", { object_id: id })
  }

  unsubscribeEmoteSet(emoteSetId: string) {
    const id = emoteSetId.trim()
    if (!id) return
    this.release("emote_set.*", { object_id: id })
  }

  /** Subscribe to user connection / active-set changes (extension: user.*). */
  subscribeUser(userId: string) {
    const id = userId.trim()
    if (!id) return
    this.retain("user.*", { object_id: id })
  }

  unsubscribeUser(userId: string) {
    const id = userId.trim()
    if (!id) return
    this.release("user.*", { object_id: id })
  }

  /**
   * Channel-scoped emote_set subscription used by the official extension for
   * personal / contextual emote sets in a Twitch room.
   */
  subscribeTwitchChannel(twitchRoomId: string) {
    const id = twitchRoomId.trim()
    if (!id) return
    this.retain("emote_set.*", {
      ctx: "channel",
      platform: "TWITCH",
      id,
    })
  }

  unsubscribeTwitchChannel(twitchRoomId: string) {
    const id = twitchRoomId.trim()
    if (!id) return
    this.release("emote_set.*", {
      ctx: "channel",
      platform: "TWITCH",
      id,
    })
  }

  disconnect() {
    this.shouldReconnect = false
    this.connectGeneration += 1
    this.sessionReady = false
    this.sessionId = ""
    this.clearReconnectTimer()
    this.clearHeartbeatTimer()
    this.desired.clear()

    const socket = this.socket
    this.socket = null
    if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close(1000)
    }
  }

  private retain(type: SubscriptionType, condition: SubscriptionCondition) {
    const key = subscriptionKey(type, condition)
    const existing = this.desired.get(key)
    if (existing) {
      existing.refCount += 1
      return
    }

    this.desired.set(key, {
      type,
      condition,
      refCount: 1,
      confirmed: false,
    })
    this.ensureConnected()
    this.sendSubscribe(type, condition)
  }

  private release(type: SubscriptionType, condition: SubscriptionCondition) {
    const key = subscriptionKey(type, condition)
    const existing = this.desired.get(key)
    if (!existing) return

    existing.refCount -= 1
    if (existing.refCount > 0) return

    this.desired.delete(key)
    if (existing.confirmed || this.sessionReady) {
      this.sendUnsubscribe(type, condition)
    }

    if (this.desired.size === 0) {
      this.disconnect()
    }
  }

  private ensureConnected() {
    this.shouldReconnect = true
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      return
    }
    this.openSocket()
  }

  private openSocket() {
    this.clearReconnectTimer()
    this.clearHeartbeatTimer()
    this.sessionReady = false

    if (this.socket) {
      const previous = this.socket
      this.socket = null
      if (previous.readyState < WebSocket.CLOSING) {
        previous.close(1000)
      }
    }

    for (const subscription of this.desired.values()) {
      subscription.confirmed = false
    }

    const generation = ++this.connectGeneration
    const socket = new WebSocket(SEVENTV_EVENT_API_URL)
    this.socket = socket
    this.lastHeartbeatAt = Date.now()

    socket.onopen = () => {
      if (generation !== this.connectGeneration || this.socket !== socket) {
        return
      }
      this.reconnectAttempt = 0
      this.lastHeartbeatAt = Date.now()
    }

    socket.onmessage = (event) => {
      if (generation !== this.connectGeneration || this.socket !== socket) {
        return
      }
      this.handleMessage(event.data)
    }

    socket.onclose = (event) => {
      if (generation !== this.connectGeneration) {
        return
      }
      if (this.socket === socket) {
        this.socket = null
      }
      this.sessionReady = false
      this.clearHeartbeatTimer()

      // 4009 Already Subscribed = client bug; do not tight-loop reconnect.
      if (event.code === 4009) {
        this.shouldReconnect = false
        return
      }

      if (this.shouldReconnect && this.desired.size > 0) {
        this.scheduleReconnect()
      }
    }

    socket.onerror = () => {
      if (generation !== this.connectGeneration || this.socket !== socket) {
        return
      }
      socket.close()
    }
  }

  private syncSubscriptions() {
    for (const subscription of this.desired.values()) {
      if (subscription.confirmed) continue
      this.sendSubscribe(subscription.type, subscription.condition)
    }
  }

  private sendSubscribe(
    type: SubscriptionType,
    condition: SubscriptionCondition
  ) {
    this.send({
      op: Opcode.Subscribe,
      d: { type, condition },
    })
  }

  private sendUnsubscribe(
    type: SubscriptionType,
    condition: SubscriptionCondition
  ) {
    this.send({
      op: Opcode.Unsubscribe,
      d: { type, condition },
    })
  }

  private send(message: EventApiMessage) {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN || !this.sessionReady) {
      return
    }
    socket.send(JSON.stringify(message))
  }

  private handleMessage(raw: unknown) {
    if (typeof raw !== "string") return

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }

    if (!isRecord(parsed) || typeof parsed.op !== "number") {
      return
    }

    switch (parsed.op) {
      case Opcode.Hello: {
        this.onHello(parsed.d)
        break
      }
      case Opcode.Heartbeat: {
        this.lastHeartbeatAt = Date.now()
        break
      }
      case Opcode.Dispatch: {
        this.handleDispatch(parsed.d)
        break
      }
      case Opcode.Ack: {
        this.onAck(parsed.d)
        break
      }
      case Opcode.Error:
      case Opcode.EndOfStream: {
        break
      }
      case Opcode.Reconnect: {
        this.socket?.close()
        break
      }
      default:
        break
    }
  }

  private onHello(data: unknown) {
    const previousSessionId = this.sessionId
    if (isRecord(data)) {
      const interval = data.heartbeat_interval
      if (typeof interval === "number" && interval > 0) {
        this.heartbeatIntervalMs = interval
      }
      this.sessionId = asString(data.session_id)
    }

    this.sessionReady = true
    this.lastHeartbeatAt = Date.now()
    this.startHeartbeatMonitor()

    // Fresh session: mark unconfirmed and (re)subscribe. On resume success the
    // server restores subs; we only sync when this is a new session id.
    if (!previousSessionId || previousSessionId !== this.sessionId) {
      for (const subscription of this.desired.values()) {
        subscription.confirmed = false
      }
      this.syncSubscriptions()
    }
  }

  private onAck(data: unknown) {
    if (!isRecord(data)) return
    if (asString(data.command) !== "SUBSCRIBE") return
    if (!isRecord(data.data)) return

    const type = asString(data.data.type) as SubscriptionType
    if (type !== "emote_set.*" && type !== "user.*") return
    if (!isRecord(data.data.condition)) return

    const condition = data.data.condition as SubscriptionCondition
    for (const subscription of this.desired.values()) {
      if (
        subscription.type === type &&
        conditionsEqual(subscription.condition, condition)
      ) {
        subscription.confirmed = true
      }
    }
  }

  private handleDispatch(data: unknown) {
    if (!isRecord(data)) return

    const type = asString(data.type)
    const body = data.body
    if (!isRecord(body)) return

    if (type === "emote_set.update") {
      this.handleEmoteSetUpdate(body)
      return
    }

    if (type === "user.update") {
      this.handleUserUpdate(body)
    }
  }

  private handleEmoteSetUpdate(body: Record<string, unknown>) {
    const emoteSetId = asString(body.id)
    if (!emoteSetId) return

    const actorName = isRecord(body.actor)
      ? asString(body.actor.display_name) || asString(body.actor.username)
      : ""

    const added: SevenTvActiveEmote[] = []
    const removed: Array<{ id: string; name: string }> = []
    const renamed: Array<{ id: string; oldName: string; newName: string }> = []

    for (const entry of [
      ...asArray(body.pushed),
      ...asArray(body.added),
    ]) {
      if (!isRecord(entry)) continue
      const key = asString(entry.key)
      if (key && key !== "emotes") continue
      const emote = parseActiveEmote(entry.value)
      if (emote) added.push(emote)
    }

    for (const entry of [
      ...asArray(body.pulled),
      ...asArray(body.removed),
    ]) {
      if (!isRecord(entry)) continue
      const key = asString(entry.key)
      if (key && key !== "emotes") continue
      if (!isRecord(entry.old_value)) continue
      const id = asString(entry.old_value.id)
      const name = asString(entry.old_value.name)
      if (id && name) removed.push({ id, name })
    }

    for (const entry of asArray(body.updated)) {
      if (!isRecord(entry)) continue
      const key = asString(entry.key)
      if (key && key !== "emotes") continue
      if (!isRecord(entry.old_value) || !isRecord(entry.value)) continue
      const id = asString(entry.value.id) || asString(entry.old_value.id)
      const oldName = asString(entry.old_value.name)
      const newName = asString(entry.value.name)
      if (!id || !oldName || !newName || oldName === newName) continue
      renamed.push({ id, oldName, newName })
    }

    if (added.length === 0 && removed.length === 0 && renamed.length === 0) {
      return
    }

    this.handlers.onEmoteSetUpdate?.({
      emoteSetId,
      actorName,
      added,
      removed,
      renamed,
    })
  }

  private handleUserUpdate(body: Record<string, unknown>) {
    const userId = asString(body.id)
    if (!userId) return

    const actorName = isRecord(body.actor)
      ? asString(body.actor.display_name) || asString(body.actor.username)
      : ""

    for (const updated of asArray(body.updated)) {
      if (!isRecord(updated) || asString(updated.key) !== "connections") {
        continue
      }

      const connectionIndex =
        typeof updated.index === "number" && Number.isFinite(updated.index)
          ? updated.index
          : -1

      const fields = asArray(updated.value)

      for (const field of fields) {
        if (!isRecord(field) || asString(field.key) !== "emote_set") {
          continue
        }
        this.emitUserEmoteSetChange(userId, actorName, connectionIndex, field)
      }
    }
  }

  private emitUserEmoteSetChange(
    userId: string,
    actorName: string,
    connectionIndex: number,
    field: Record<string, unknown>
  ) {
    const oldEmoteSetId = isRecord(field.old_value)
      ? asString(field.old_value.id)
      : ""
    const emoteSetId = isRecord(field.value) ? asString(field.value.id) : ""

    if (!oldEmoteSetId || !emoteSetId || oldEmoteSetId === emoteSetId) {
      return
    }

    this.handlers.onUserEmoteSetChange?.({
      userId,
      actorName,
      oldEmoteSetId,
      emoteSetId,
      connectionIndex,
    })
  }

  private startHeartbeatMonitor() {
    this.clearHeartbeatTimer()
    this.heartbeatTimer = setInterval(() => {
      const elapsed = Date.now() - this.lastHeartbeatAt
      if (elapsed > this.heartbeatIntervalMs * HEARTBEAT_TIMEOUT_MULTIPLIER) {
        this.socket?.close()
      }
    }, this.heartbeatIntervalMs)
  }

  private scheduleReconnect() {
    this.clearReconnectTimer()
    const attempt = this.reconnectAttempt
    this.reconnectAttempt += 1
    const base = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_MIN_MS * 2 ** Math.min(attempt, 6)
    )
    const jitter = Math.floor(Math.random() * 500)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.shouldReconnect || this.desired.size === 0) {
        return
      }
      this.openSocket()
    }, base + jitter)
  }

  private clearHeartbeatTimer() {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}

let sharedSevenTvEventApi: SevenTvEventApi | null = null

export function getSevenTvEventApi(): SevenTvEventApi {
  if (!sharedSevenTvEventApi) {
    sharedSevenTvEventApi = new SevenTvEventApi()
  }
  return sharedSevenTvEventApi
}
