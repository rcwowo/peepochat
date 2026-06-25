import { devLoggedFetch } from "@/lib/dev-logger"

const RCW_MEMBERS_BASE_URL = "https://api.rcw.lol/members"

const BADGE_DEFINITIONS_CACHE_KEY = "peepochat::rcw::member-badges"
const MEMBER_ASSIGNMENTS_CACHE_KEY = "peepochat::rcw::member-list"
const BADGE_DEFINITIONS_TTL_MS = 24 * 60 * 60 * 1000
const MEMBER_ASSIGNMENTS_TTL_MS = 15 * 60 * 1000

export type RcwMemberBadgeDefinition = {
  id: number
  name: string
  description: string
  image: string
}

export type RcwMemberAssignment = {
  userId: string
  badge: string | null
}

type CachedPayload<T> = {
  cachedAt: string
  data: T
}

export class RcwMembersApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "RcwMembersApiError"
    this.status = status
  }
}

export async function fetchRcwMemberBadgeDefinitions(
  force = false
): Promise<RcwMemberBadgeDefinition[]> {
  if (!force) {
    const cached = readCachedPayload<RcwMemberBadgeDefinition[]>(
      BADGE_DEFINITIONS_CACHE_KEY,
      BADGE_DEFINITIONS_TTL_MS
    )
    if (cached) {
      return cached
    }
  }

  const response = await devLoggedFetch(`${RCW_MEMBERS_BASE_URL}/badges`)
  if (!response.ok) {
    throw new RcwMembersApiError(
      "Could not load member badges.",
      response.status
    )
  }

  const data = (await response.json()) as RcwMemberBadgeDefinition[]
  writeCachedPayload(BADGE_DEFINITIONS_CACHE_KEY, data)
  return data
}

export async function fetchRcwMemberAssignments(
  force = false
): Promise<RcwMemberAssignment[]> {
  if (!force) {
    const cached = readCachedPayload<RcwMemberAssignment[]>(
      MEMBER_ASSIGNMENTS_CACHE_KEY,
      MEMBER_ASSIGNMENTS_TTL_MS
    )
    if (cached) {
      return cached
    }
  }

  const response = await devLoggedFetch(`${RCW_MEMBERS_BASE_URL}/list`)
  if (!response.ok) {
    throw new RcwMembersApiError("Could not load member list.", response.status)
  }

  const data = (await response.json()) as RcwMemberAssignment[]
  writeCachedPayload(MEMBER_ASSIGNMENTS_CACHE_KEY, data)
  return data
}

function readCachedPayload<T>(key: string, ttlMs: number): T | null {
  if (typeof window === "undefined") {
    return null
  }

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as CachedPayload<T>
    const cachedAt = Date.parse(parsed.cachedAt)
    if (Number.isNaN(cachedAt) || Date.now() - cachedAt > ttlMs) {
      window.localStorage.removeItem(key)
      return null
    }

    return parsed.data
  } catch {
    return null
  }
}

function writeCachedPayload<T>(key: string, data: T) {
  if (typeof window === "undefined") {
    return
  }

  const payload: CachedPayload<T> = {
    cachedAt: new Date().toISOString(),
    data,
  }

  window.localStorage.setItem(key, JSON.stringify(payload))
}
