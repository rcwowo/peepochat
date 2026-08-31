import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import type { TwitchChatMessage } from "@/lib/twitch/twitch-chat"
import type { TwitchTimelineItem } from "@/lib/twitch/twitch-chat-types"

export const CHATTER_STORE_CAP = 4096
export const CHATTER_COMPLETION_MAX = 25

const EMPTY_CHATTERS: ChannelChatter[] = []
const CHATTER_NOTIFY_INTERVAL_MS = 100
const EMPTY_FLAGS: TwitchChatMessage["flags"] = {
  isBroadcaster: false,
  isModerator: false,
  isSubscriber: false,
  isVip: false,
  isFirst: false,
  isAction: false,
}

export type ChannelChatter = {
  userId: string | null
  login: string
  displayName: string
  color: string | null
  lastSeenAt: number
  flags: TwitchChatMessage["flags"]
}

export type ChatterObservation = {
  userId: string | null
  login: string
  displayName: string
  color: string | null
  lastSeenAt: number
  flags?: TwitchChatMessage["flags"]
  flagsAuthoritative?: boolean
}

export type ChatterSearchOptions = {
  limit?: number
  isBlocked?: (userId?: string | null, login?: string | null) => boolean
}

export type ObserveTimelineItemsOptions = {
  flush?: boolean
}

type ChannelChatterIndex = {
  byLogin: Map<string, ChannelChatter>
  byUserId: Map<string, string>
  list: ChannelChatter[]
  listDirty: boolean
  oldestHeap: ChatterHeapEntry[]
}

type ChatterHeapEntry = {
  login: string
  lastSeenAt: number
}

function timestampMs(value: string | undefined): number {
  if (!value) {
    return Date.now()
  }

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Date.now()
}

function normalizeLogin(login: string): string {
  return login.trim().replace(/^@/, "").toLowerCase()
}

function chatterFromChatMessage(
  message: TwitchChatMessage
): ChatterObservation {
  return {
    userId: message.userId,
    login: message.userName,
    displayName: message.displayName,
    color: message.color,
    lastSeenAt: timestampMs(message.receivedAt),
    flags: message.flags,
    flagsAuthoritative: true,
  }
}

function chatterFromActor(
  actor: {
    userId: string | null
    userName: string
    displayName: string
    color: string | null
  },
  receivedAt: string
): ChatterObservation {
  return {
    userId: actor.userId,
    login: actor.userName,
    displayName: actor.displayName,
    color: actor.color,
    lastSeenAt: timestampMs(receivedAt),
    flagsAuthoritative: false,
  }
}

export function observationsFromTimelineItem(
  item: TwitchTimelineItem
): ChatterObservation[] {
  switch (item.kind) {
    case "chat": {
      const observations = [chatterFromChatMessage(item.message)]
      const reply = item.message.reply
      if (reply?.parentUserName) {
        observations.push({
          userId: null,
          login: reply.parentUserName,
          displayName: reply.parentDisplayName,
          color: reply.parentColor,
          lastSeenAt: timestampMs(item.message.receivedAt),
          flagsAuthoritative: false,
        })
      }
      return observations
    }
    case "suspicious":
      return [
        {
          userId: item.message.userId,
          login: item.message.userName,
          displayName: item.message.displayName,
          color: item.message.color,
          lastSeenAt: timestampMs(item.message.receivedAt),
          flagsAuthoritative: false,
        },
      ]
    case "automod":
      return [
        {
          userId: item.message.userId,
          login: item.message.userName,
          displayName: item.message.displayName,
          color: item.message.color,
          lastSeenAt: timestampMs(item.message.receivedAt),
          flagsAuthoritative: false,
        },
      ]
    case "system": {
      const observations: ChatterObservation[] = []
      if (item.message.actor?.userName) {
        observations.push(
          chatterFromActor(item.message.actor, item.message.receivedAt)
        )
      }
      if (item.message.target?.userName) {
        observations.push(
          chatterFromActor(item.message.target, item.message.receivedAt)
        )
      }
      return observations
    }
  }
}

function compareHeapEntries(
  left: ChatterHeapEntry,
  right: ChatterHeapEntry
): number {
  return left.lastSeenAt - right.lastSeenAt
}

function pushHeap(heap: ChatterHeapEntry[], entry: ChatterHeapEntry) {
  heap.push(entry)
  let index = heap.length - 1

  while (index > 0) {
    const parent = Math.floor((index - 1) / 2)
    if (compareHeapEntries(heap[parent]!, entry) <= 0) {
      break
    }
    heap[index] = heap[parent]!
    index = parent
  }

  heap[index] = entry
}

function popHeap(heap: ChatterHeapEntry[]): ChatterHeapEntry | undefined {
  const root = heap[0]
  const last = heap.pop()
  if (!root || !last || heap.length === 0) {
    return root
  }

  let index = 0
  while (true) {
    const left = index * 2 + 1
    if (left >= heap.length) {
      break
    }

    const right = left + 1
    const child =
      right < heap.length && compareHeapEntries(heap[right]!, heap[left]!) < 0
        ? right
        : left
    if (compareHeapEntries(last, heap[child]!) <= 0) {
      break
    }

    heap[index] = heap[child]!
    index = child
  }

  heap[index] = last
  return root
}

function rebuildHeap(index: ChannelChatterIndex) {
  index.oldestHeap = []
  for (const chatter of index.byLogin.values()) {
    pushHeap(index.oldestHeap, {
      login: chatter.login,
      lastSeenAt: chatter.lastSeenAt,
    })
  }
}

function compactHeap(index: ChannelChatterIndex) {
  const threshold = Math.max(index.byLogin.size * 2, 256)
  if (index.oldestHeap.length > threshold) {
    rebuildHeap(index)
  }
}

function evictOldest(index: ChannelChatterIndex) {
  while (index.byLogin.size > CHATTER_STORE_CAP) {
    const oldest = popHeap(index.oldestHeap)
    if (!oldest) {
      break
    }

    const chatter = index.byLogin.get(oldest.login)
    if (!chatter || chatter.lastSeenAt !== oldest.lastSeenAt) {
      continue
    }

    index.byLogin.delete(oldest.login)
    if (chatter.userId && index.byUserId.get(chatter.userId) === oldest.login) {
      index.byUserId.delete(chatter.userId)
    }
  }
}

function getList(index: ChannelChatterIndex): ChannelChatter[] {
  if (!index.listDirty) {
    return index.list
  }

  if (index.byLogin.size === 0) {
    index.list = EMPTY_CHATTERS
  } else {
    index.list = Array.from(index.byLogin.values())
  }

  index.listDirty = false
  return index.list
}

function sortChatters(
  left: ChannelChatter,
  right: ChannelChatter,
  needle: string
): number {
  if (needle) {
    const leftExact = left.login === needle ? 0 : 1
    const rightExact = right.login === needle ? 0 : 1
    if (leftExact !== rightExact) {
      return leftExact - rightExact
    }
  }

  if (left.lastSeenAt !== right.lastSeenAt) {
    return right.lastSeenAt - left.lastSeenAt
  }

  return left.displayName.localeCompare(right.displayName, undefined, {
    sensitivity: "base",
  })
}

function addBestMatch(
  heap: ChannelChatter[],
  chatter: ChannelChatter,
  limit: number,
  needle: string
) {
  if (heap.length < limit) {
    heap.push(chatter)
    let index = heap.length - 1
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (sortChatters(heap[index]!, heap[parent]!, needle) <= 0) {
        break
      }
      ;[heap[index], heap[parent]] = [heap[parent]!, heap[index]!]
      index = parent
    }
    return
  }

  if (sortChatters(chatter, heap[0]!, needle) >= 0) {
    return
  }

  heap[0] = chatter
  let index = 0
  while (true) {
    const left = index * 2 + 1
    if (left >= heap.length) {
      break
    }

    const right = left + 1
    const child =
      right < heap.length && sortChatters(heap[right]!, heap[left]!, needle) > 0
        ? right
        : left
    if (sortChatters(heap[index]!, heap[child]!, needle) >= 0) {
      break
    }

    ;[heap[index], heap[child]] = [heap[child]!, heap[index]!]
    index = child
  }
}

export type ChatterStore = ReturnType<typeof createChatterStore>

export function createChatterStore() {
  const channels = new Map<string, ChannelChatterIndex>()
  const subscribers = new Map<string, Set<() => void>>()
  const pendingNotify = new Set<string>()
  let notifyTimer: ReturnType<typeof setTimeout> | null = null

  const flushNotify = () => {
    if (notifyTimer !== null) {
      clearTimeout(notifyTimer)
      notifyTimer = null
    }
    if (pendingNotify.size === 0) {
      return
    }

    const logins = Array.from(pendingNotify)
    pendingNotify.clear()

    for (const login of logins) {
      const listeners = subscribers.get(login)
      if (!listeners) {
        continue
      }
      for (const listener of listeners) {
        listener()
      }
    }
  }

  const scheduleNotify = (login: string) => {
    if (!subscribers.has(login)) {
      return
    }

    pendingNotify.add(login)
    if (notifyTimer !== null) {
      return
    }

    notifyTimer = setTimeout(flushNotify, CHATTER_NOTIFY_INTERVAL_MS)
  }

  const getIndex = (login: string): ChannelChatterIndex => {
    const existing = channels.get(login)
    if (existing) {
      return existing
    }

    const created: ChannelChatterIndex = {
      byLogin: new Map(),
      byUserId: new Map(),
      list: EMPTY_CHATTERS,
      listDirty: false,
      oldestHeap: [],
    }
    channels.set(login, created)
    return created
  }

  const upsertOne = (channelLogin: string, observation: ChatterObservation) => {
    let login = normalizeLogin(observation.login)
    if (!login) {
      return false
    }

    const index = getIndex(channelLogin)
    const userId = observation.userId?.trim() || null

    let removedPreviousLogin = false
    if (userId) {
      const previousLogin = index.byUserId.get(userId)
      if (previousLogin && previousLogin !== login) {
        const previous = index.byLogin.get(previousLogin)
        if (previous && previous.lastSeenAt > observation.lastSeenAt) {
          login = previousLogin
        } else {
          index.byLogin.delete(previousLogin)
          removedPreviousLogin = true
        }
      }
    }

    const existing = index.byLogin.get(login)
    const isCurrent = !existing || observation.lastSeenAt >= existing.lastSeenAt
    const observedDisplayName = observation.displayName.trim() || login
    const next: ChannelChatter = {
      userId: isCurrent
        ? (userId ?? existing?.userId ?? null)
        : (existing.userId ?? userId),
      login,
      displayName: isCurrent ? observedDisplayName : existing.displayName,
      color: isCurrent
        ? (observation.color ?? existing?.color ?? null)
        : existing.color,
      lastSeenAt: existing
        ? Math.max(existing.lastSeenAt, observation.lastSeenAt)
        : observation.lastSeenAt,
      flags:
        (isCurrent || existing?.flags === EMPTY_FLAGS) &&
        observation.flagsAuthoritative &&
        observation.flags
          ? observation.flags
          : (existing?.flags ?? observation.flags ?? EMPTY_FLAGS),
    }

    if (
      !removedPreviousLogin &&
      existing &&
      existing.userId === next.userId &&
      existing.displayName === next.displayName &&
      existing.color === next.color &&
      existing.lastSeenAt === next.lastSeenAt &&
      existing.flags === next.flags
    ) {
      return false
    }

    const isNew = !existing
    if (
      existing?.userId &&
      existing.userId !== next.userId &&
      index.byUserId.get(existing.userId) === login
    ) {
      index.byUserId.delete(existing.userId)
    }

    index.byLogin.set(login, next)
    if (next.userId) {
      index.byUserId.set(next.userId, login)
    }

    if (!existing || next.lastSeenAt !== existing.lastSeenAt) {
      pushHeap(index.oldestHeap, {
        login,
        lastSeenAt: next.lastSeenAt,
      })
    }

    if (isNew || removedPreviousLogin) {
      evictOldest(index)
    }

    compactHeap(index)
    index.listDirty = true
    return true
  }

  const observeTimelineItems = (
    login: string,
    items: TwitchTimelineItem[],
    options?: ObserveTimelineItemsOptions
  ) => {
    if (items.length === 0) {
      return
    }

    const normalized = normalizeChannelLogin(login)
    let changed = false

    for (const item of items) {
      for (const observation of observationsFromTimelineItem(item)) {
        if (upsertOne(normalized, observation)) {
          changed = true
        }
      }
    }

    if (!changed) {
      return
    }

    if (options?.flush) {
      pendingNotify.delete(normalized)
      const listeners = subscribers.get(normalized)
      if (!listeners) {
        return
      }
      for (const listener of listeners) {
        listener()
      }
      return
    }

    scheduleNotify(normalized)
  }

  const removeChannels = (logins: string[]) => {
    for (const login of logins) {
      const normalized = normalizeChannelLogin(login)
      if (!channels.has(normalized)) {
        continue
      }
      channels.delete(normalized)
      scheduleNotify(normalized)
    }
  }

  const clearAll = () => {
    if (channels.size === 0) {
      return
    }

    const logins = Array.from(channels.keys())
    channels.clear()
    for (const login of logins) {
      scheduleNotify(login)
    }
  }

  const subscribe = (login: string, listener: () => void) => {
    const normalized = normalizeChannelLogin(login)
    let set = subscribers.get(normalized)
    if (!set) {
      set = new Set()
      subscribers.set(normalized, set)
    }
    set.add(listener)
    return () => {
      set.delete(listener)
      if (set.size === 0) {
        subscribers.delete(normalized)
      }
    }
  }

  const getChatters = (login: string): ChannelChatter[] => {
    const index = channels.get(normalizeChannelLogin(login))
    return index ? getList(index) : EMPTY_CHATTERS
  }

  const getChatterByLogin = (
    channelLogin: string,
    chatterLogin: string
  ): ChannelChatter | null => {
    const index = channels.get(normalizeChannelLogin(channelLogin))
    if (!index) {
      return null
    }

    return index.byLogin.get(normalizeLogin(chatterLogin)) ?? null
  }

  const searchChatters = (
    login: string,
    query: string,
    options: ChatterSearchOptions = {}
  ): ChannelChatter[] => {
    const index = channels.get(normalizeChannelLogin(login))
    if (!index || index.byLogin.size === 0) {
      return EMPTY_CHATTERS
    }

    const needle = normalizeLogin(query)
    const requestedLimit = options.limit ?? CHATTER_COMPLETION_MAX
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(CHATTER_STORE_CAP, Math.max(0, Math.floor(requestedLimit)))
      : CHATTER_COMPLETION_MAX
    if (limit === 0) {
      return EMPTY_CHATTERS
    }

    const matches: ChannelChatter[] = []

    for (const chatter of index.byLogin.values()) {
      if (options.isBlocked?.(chatter.userId, chatter.login)) {
        continue
      }

      if (
        !needle ||
        chatter.login.startsWith(needle) ||
        chatter.displayName.toLowerCase().startsWith(needle)
      ) {
        addBestMatch(matches, chatter, limit, needle)
      }
    }

    matches.sort((left, right) => sortChatters(left, right, needle))
    return matches
  }

  const dispose = () => {
    if (notifyTimer !== null) {
      clearTimeout(notifyTimer)
      notifyTimer = null
    }
    pendingNotify.clear()
    channels.clear()
    subscribers.clear()
  }

  return {
    observeTimelineItems,
    removeChannels,
    clearAll,
    subscribe,
    getChatters,
    getChatterByLogin,
    searchChatters,
    dispose,
  }
}

export function mentionTokenForChatter(chatter: ChannelChatter): string {
  if (chatter.displayName.toLowerCase() === chatter.login) {
    return chatter.displayName
  }

  return chatter.login
}
