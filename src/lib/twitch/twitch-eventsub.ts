import {
  TwitchApiError,
  createTwitchEventSubSubscription,
  deleteTwitchEventSubSubscription,
} from "@/lib/twitch/twitch-api"

const EVENTSUB_WS_URL = "wss://eventsub.wss.twitch.tv/ws"
const RECONNECT_MIN_MS = 1_000
const RECONNECT_MAX_MS = 60_000
const SEEN_MESSAGE_IDS_LIMIT = 500
const SUBSCRIBE_TIMEOUT_MS = 10_000

export type TwitchEventSubAuth = {
  accessToken: string
  clientId: string
  userId: string
  onAuthFailure?: (reason: "expired" | "scopes") => void
}

export type TwitchEventSubDesiredSubscription = {
  type: string
  version: string
  condition: Record<string, string>
  channelLogin?: string
}

export type TwitchEventSubNotification = {
  messageId: string
  messageTimestamp: string
  subscriptionType: string
  subscriptionVersion: string
  subscriptionId: string
  condition: Record<string, string>
  event: Record<string, unknown>
  channelLogin: string | null
}

export type TwitchEventSubHandlers = {
  onNotification?: (notification: TwitchEventSubNotification) => void
}

type ActiveSubscription = {
  key: string
  type: string
  version: string
  condition: Record<string, string>
  channelLogin: string | null
  helixId: string | null
  status: "pending" | "enabled" | "failed"
}

type SessionWelcomePayload = {
  session?: {
    id?: string
    keepalive_timeout_seconds?: number
    reconnect_url?: string | null
  }
}

type SessionReconnectPayload = {
  session?: {
    id?: string
    reconnect_url?: string | null
  }
}

type NotificationPayload = {
  subscription?: {
    id?: string
    type?: string
    version?: string
    condition?: Record<string, string>
  }
  event?: Record<string, unknown>
}

type RevocationPayload = {
  subscription?: {
    id?: string
    type?: string
    status?: string
    condition?: Record<string, string>
  }
}

type EventSubFrame = {
  metadata?: {
    message_id?: string
    message_type?: string
    message_timestamp?: string
    subscription_type?: string
    subscription_version?: string
  }
  payload?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function conditionKey(condition: Record<string, string>): string {
  return Object.keys(condition)
    .sort()
    .map((key) => `${key}=${condition[key]}`)
    .join("&")
}

function eventSubSubscriptionKey(
  type: string,
  version: string,
  condition: Record<string, string>
): string {
  return `${type}|${version}|${conditionKey(condition)}`
}

function desiredSignature(
  subscriptions: Iterable<TwitchEventSubDesiredSubscription>
): string {
  return [...subscriptions]
    .map((subscription) =>
      eventSubSubscriptionKey(
        subscription.type,
        subscription.version,
        subscription.condition
      )
    )
    .sort()
    .join("\n")
}

export class TwitchEventSubClient {
  private auth: TwitchEventSubAuth | null = null
  private handlers: TwitchEventSubHandlers = {}
  private desired = new Map<string, TwitchEventSubDesiredSubscription>()
  private desiredSignature = ""
  private active = new Map<string, ActiveSubscription>()
  private socket: WebSocket | null = null
  private sessionId: string | null = null
  private keepaliveTimeoutSeconds = 10
  private lastMessageAt = 0
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempt = 0
  private shouldReconnect = false
  private connectGeneration = 0
  private syncGeneration = 0
  private syncInFlight: Promise<void> | null = null
  private syncQueued = false
  private seenMessageIds = new Set<string>()
  private seenMessageIdOrder: string[] = []
  private migratingFromSocket: WebSocket | null = null
  private permissionDeniedKeys = new Set<string>()

  setHandlers(handlers: TwitchEventSubHandlers) {
    this.handlers = handlers
  }

  setAuth(auth: TwitchEventSubAuth | null) {
    const previousUserId = this.auth?.userId ?? null
    const previousToken = this.auth?.accessToken ?? null
    this.auth = auth

    if (!auth) {
      this.disconnect()
      return
    }

    if (previousUserId && previousUserId !== auth.userId) {
      this.disconnect()
      if (this.desired.size > 0) {
        this.ensureConnected()
      }
      return
    }

    if (previousToken && previousToken !== auth.accessToken) {
      this.disconnect()
      if (this.desired.size > 0) {
        this.ensureConnected()
      }
      return
    }

    if (this.desired.size > 0) {
      this.ensureConnected()
    }
  }

  setDesiredSubscriptions(subscriptions: TwitchEventSubDesiredSubscription[]) {
    const next = new Map<string, TwitchEventSubDesiredSubscription>()
    for (const subscription of subscriptions) {
      const key = eventSubSubscriptionKey(
        subscription.type,
        subscription.version,
        subscription.condition
      )
      next.set(key, subscription)
    }

    const nextSignature = desiredSignature(next.values())
    const signatureChanged = nextSignature !== this.desiredSignature
    if (signatureChanged) {
      this.permissionDeniedKeys.clear()
    }

    for (const [key, desired] of next) {
      const existing = this.active.get(key)
      if (existing) {
        existing.channelLogin = desired.channelLogin ?? null
      }
    }

    this.desired = next
    this.desiredSignature = nextSignature

    if (this.desired.size === 0) {
      this.disconnect()
      return
    }

    this.ensureConnected()
    if (signatureChanged || this.needsSubscriptionSync()) {
      this.queueSyncSubscriptions()
    }
  }

  disconnect() {
    this.shouldReconnect = false
    this.connectGeneration += 1
    this.syncGeneration += 1
    this.syncQueued = false
    this.clearReconnectTimer()
    this.clearKeepaliveTimer()
    this.sessionId = null
    this.closeSocket(this.migratingFromSocket)
    this.migratingFromSocket = null
    this.closeSocket(this.socket)
    this.socket = null
    this.active.clear()
    this.permissionDeniedKeys.clear()
  }

  private needsSubscriptionSync(): boolean {
    if (!this.sessionId) return false
    for (const key of this.desired.keys()) {
      if (this.permissionDeniedKeys.has(key)) continue
      const active = this.active.get(key)
      if (!active) return true
      if (active.status === "failed") return true
      if (active.status === "pending" && !active.helixId) {
        // Create already in flight or waiting; don't force another wave.
        continue
      }
      if (active.status !== "enabled") return true
    }
    for (const key of this.active.keys()) {
      if (!this.desired.has(key)) return true
    }
    return false
  }

  private ensureConnected() {
    if (!this.auth) return
    this.shouldReconnect = true
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return
    }
    this.openSocket(EVENTSUB_WS_URL)
  }

  private isLiveSocket(socket: WebSocket, generation: number) {
    if (this.migratingFromSocket === socket) {
      return true
    }
    return generation === this.connectGeneration && this.socket === socket
  }

  private openSocket(
    url: string,
    options?: { isReconnectMigration?: boolean }
  ) {
    this.clearReconnectTimer()
    this.clearKeepaliveTimer()

    if (!options?.isReconnectMigration) {
      this.closeSocket(this.migratingFromSocket)
      this.migratingFromSocket = null
      this.closeSocket(this.socket)
      this.socket = null
      this.sessionId = null
      this.active.clear()
    }

    const generation = ++this.connectGeneration
    const socket = new WebSocket(url)
    this.socket = socket
    this.lastMessageAt = Date.now()

    socket.onopen = () => {
      if (!this.isLiveSocket(socket, generation)) {
        return
      }
      this.reconnectAttempt = 0
      this.lastMessageAt = Date.now()
    }

    socket.onmessage = (event) => {
      if (!this.isLiveSocket(socket, generation)) {
        return
      }
      this.handleMessage(event.data)
    }

    socket.onclose = () => {
      if (this.migratingFromSocket === socket) {
        this.migratingFromSocket = null
      }

      if (generation !== this.connectGeneration) {
        return
      }

      if (this.socket === socket) {
        this.socket = null
      }
      this.clearKeepaliveTimer()

      if (this.migratingFromSocket) {
        this.closeSocket(this.migratingFromSocket)
        this.migratingFromSocket = null
      }

      if (this.shouldReconnect && this.desired.size > 0 && this.auth) {
        this.sessionId = null
        this.active.clear()
        this.scheduleReconnect()
      }
    }

    socket.onerror = () => {
      if (!this.isLiveSocket(socket, generation)) {
        return
      }
      socket.close()
    }
  }

  private handleMessage(raw: unknown) {
    if (typeof raw !== "string") return

    let frame: EventSubFrame
    try {
      frame = JSON.parse(raw) as EventSubFrame
    } catch {
      return
    }

    const messageId = asString(frame.metadata?.message_id)
    const messageType = asString(frame.metadata?.message_type)
    if (!messageType) return

    if (messageId) {
      if (this.seenMessageIds.has(messageId)) {
        return
      }
      this.rememberMessageId(messageId)
    }

    this.lastMessageAt = Date.now()

    switch (messageType) {
      case "session_welcome":
        this.handleWelcome(frame.payload)
        break
      case "session_keepalive":
        break
      case "session_reconnect":
        this.handleReconnect(frame.payload)
        break
      case "notification":
        this.handleNotification(frame)
        break
      case "revocation":
        this.handleRevocation(frame.payload)
        break
      default:
        break
    }
  }

  private handleWelcome(payload: unknown) {
    if (!isRecord(payload)) return
    const session = (payload as SessionWelcomePayload).session
    const sessionId = asString(session?.id)
    if (!sessionId) return

    const keepalive = session?.keepalive_timeout_seconds
    if (
      typeof keepalive === "number" &&
      Number.isFinite(keepalive) &&
      keepalive > 0
    ) {
      this.keepaliveTimeoutSeconds = keepalive
    }

    this.sessionId = sessionId
    this.armKeepaliveWatch()

    if (this.migratingFromSocket) {
      this.closeSocket(this.migratingFromSocket)
      this.migratingFromSocket = null
    } else {
      this.active.clear()
      this.permissionDeniedKeys.clear()
    }

    this.queueSyncSubscriptions()
  }

  private handleReconnect(payload: unknown) {
    if (!isRecord(payload)) return
    const reconnectUrl = asString(
      (payload as SessionReconnectPayload).session?.reconnect_url
    )
    if (!reconnectUrl) {
      this.closeSocket(this.socket)
      this.socket = null
      this.scheduleReconnect()
      return
    }

    const oldSocket = this.socket
    this.migratingFromSocket = oldSocket
    this.openSocket(reconnectUrl, { isReconnectMigration: true })
  }

  private handleNotification(frame: EventSubFrame) {
    if (!isRecord(frame.payload)) return
    const payload = frame.payload as NotificationPayload
    const subscription = payload.subscription
    const event = payload.event
    if (!subscription || !isRecord(event)) return

    const type = asString(subscription.type)
    const version = asString(subscription.version)
    const condition = isRecord(subscription.condition)
      ? Object.fromEntries(
          Object.entries(subscription.condition).map(([key, value]) => [
            key,
            asString(value),
          ])
        )
      : {}
    const key = eventSubSubscriptionKey(type, version, condition)
    const active = this.active.get(key)
    const subscriptionId = asString(subscription.id)
    if (active && !active.helixId && subscriptionId) {
      active.helixId = subscriptionId
      active.status = "enabled"
    }

    this.handlers.onNotification?.({
      messageId: asString(frame.metadata?.message_id),
      messageTimestamp: asString(frame.metadata?.message_timestamp),
      subscriptionType: type,
      subscriptionVersion: version,
      subscriptionId,
      condition,
      event,
      channelLogin: active?.channelLogin ?? null,
    })
  }

  private handleRevocation(payload: unknown) {
    if (!isRecord(payload)) return
    const subscription = (payload as RevocationPayload).subscription
    if (!subscription) return

    const type = asString(subscription.type)
    const condition = isRecord(subscription.condition)
      ? Object.fromEntries(
          Object.entries(subscription.condition).map(([key, value]) => [
            key,
            asString(value),
          ])
        )
      : {}

    let removed = false
    for (const [key, active] of this.active) {
      if (
        active.type === type &&
        conditionKey(active.condition) === conditionKey(condition)
      ) {
        this.active.delete(key)
        removed = true
      }
    }

    if (removed && this.desired.size > 0) {
      this.queueSyncSubscriptions()
    }
  }

  private queueSyncSubscriptions() {
    if (this.syncInFlight) {
      this.syncQueued = true
      return
    }
    this.syncInFlight = this.syncSubscriptions().finally(() => {
      this.syncInFlight = null
      if (this.syncQueued) {
        this.syncQueued = false
        this.queueSyncSubscriptions()
      }
    })
  }

  private async syncSubscriptions() {
    const auth = this.auth
    const sessionId = this.sessionId
    if (!auth || !sessionId) return

    const generation = ++this.syncGeneration

    for (const [key, active] of [...this.active]) {
      if (this.desired.has(key)) continue
      this.active.delete(key)
      if (active.helixId) {
        try {
          await deleteTwitchEventSubSubscription({
            accessToken: auth.accessToken,
            clientId: auth.clientId,
            subscriptionId: active.helixId,
          })
        } catch {
          // Best-effort cleanup; session drop also disables subs.
        }
      }
      if (generation !== this.syncGeneration) return
    }

    const toCreate: TwitchEventSubDesiredSubscription[] = []
    for (const [key, desired] of this.desired) {
      const existing = this.active.get(key)
      if (existing?.status === "enabled") {
        existing.channelLogin = desired.channelLogin ?? null
        continue
      }
      if (existing?.status === "pending") {
        existing.channelLogin = desired.channelLogin ?? null
        continue
      }

      this.active.set(key, {
        key,
        type: desired.type,
        version: desired.version,
        condition: desired.condition,
        channelLogin: desired.channelLogin ?? null,
        helixId: existing?.helixId ?? null,
        status: "pending",
      })
      toCreate.push(desired)
    }

    if (toCreate.length === 0) {
      return
    }

    let authFailureReported = false
    await Promise.all(
      toCreate.map(async (desired) => {
        const key = eventSubSubscriptionKey(
          desired.type,
          desired.version,
          desired.condition
        )
        const pending = this.active.get(key)
        if (!pending || pending.status !== "pending") return

        try {
          const created = await createTwitchEventSubSubscription({
            accessToken: auth.accessToken,
            clientId: auth.clientId,
            subscription: {
              type: desired.type,
              version: desired.version,
              condition: desired.condition,
              transport: {
                method: "websocket",
                session_id: sessionId,
              },
            },
          })
          if (
            generation !== this.syncGeneration ||
            this.sessionId !== sessionId
          ) {
            return
          }
          pending.helixId = created.id
          pending.status = created.status === "enabled" ? "enabled" : "pending"
          if (pending.status === "pending") {
            // Twitch accepted the create; treat as live for websocket transport.
            pending.status = "enabled"
          }
        } catch (error) {
          if (generation !== this.syncGeneration) return
          if (error instanceof TwitchApiError && error.status === 409) {
            // Already bound to this session (or a racing create). Treat as live;
            // helixId is filled in from the next notification when available.
            pending.status = "enabled"
            return
          }
          pending.status = "failed"
          if (!authFailureReported && error instanceof TwitchApiError) {
            if (error.status === 401) {
              authFailureReported = true
              auth.onAuthFailure?.("expired")
            } else if (error.status === 403) {
              authFailureReported = true
              this.permissionDeniedKeys.add(key)
            }
          }
        }
      })
    )
  }

  private armKeepaliveWatch() {
    this.clearKeepaliveTimer()
    const timeoutMs = Math.max(
      this.keepaliveTimeoutSeconds * 1000 + 2_000,
      SUBSCRIBE_TIMEOUT_MS
    )
    this.keepaliveTimer = setInterval(() => {
      if (!this.shouldReconnect) return
      if (Date.now() - this.lastMessageAt > timeoutMs) {
        this.closeSocket(this.socket)
        this.socket = null
        this.sessionId = null
        this.active.clear()
        this.scheduleReconnect()
      }
    }, 1_000)
  }

  private scheduleReconnect() {
    if (!this.shouldReconnect || this.desired.size === 0 || !this.auth) {
      return
    }
    if (this.reconnectTimer) return

    const delay = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_MIN_MS * 2 ** this.reconnectAttempt
    )
    this.reconnectAttempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.openSocket(EVENTSUB_WS_URL)
    }, delay)
  }

  private rememberMessageId(messageId: string) {
    this.seenMessageIds.add(messageId)
    this.seenMessageIdOrder.push(messageId)
    while (this.seenMessageIdOrder.length > SEEN_MESSAGE_IDS_LIMIT) {
      const oldest = this.seenMessageIdOrder.shift()
      if (oldest) {
        this.seenMessageIds.delete(oldest)
      }
    }
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private clearKeepaliveTimer() {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer)
      this.keepaliveTimer = null
    }
  }

  private closeSocket(socket: WebSocket | null) {
    if (!socket) return
    if (socket.readyState < WebSocket.CLOSING) {
      socket.close(1000)
    }
  }
}

let sharedClient: TwitchEventSubClient | null = null

export function getTwitchEventSubClient(): TwitchEventSubClient {
  if (!sharedClient) {
    sharedClient = new TwitchEventSubClient()
  }
  return sharedClient
}
