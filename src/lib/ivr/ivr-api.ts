import { devLoggedFetch } from "@/lib/dev-logger"

const IVR_BASE_URL = "https://api.ivr.fi/v2/twitch"

export type IvrTwitchIdentity = {
  id: string
  login: string
  displayName: string
}

export type IvrTwitchSubagePeriod = {
  elapsedDays: number
  daysRemaining: number
  months: number
  end: string
  start: string
}

export type IvrTwitchSubage = {
  user: IvrTwitchIdentity
  channel: IvrTwitchIdentity
  statusHidden: boolean
  followedAt: string | null
  streak: IvrTwitchSubagePeriod | null
  cumulative: IvrTwitchSubagePeriod | null
  meta: unknown
}

export type IvrTwitchUserProfile = {
  id: string
  login: string
  displayName: string
  bannerImageUrl: string
}

export type IvrTwitchModVipEntry = {
  id: string
  login: string
  displayName: string
  grantedAt: string
}

export type IvrTwitchModVip = {
  mods: IvrTwitchModVipEntry[]
  vips: IvrTwitchModVipEntry[]
  ttl: number | null
}

export class IvrApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "IvrApiError"
    this.status = status
  }
}

export async function fetchIvrTwitchSubage({
  userLogin,
  channelLogin,
}: {
  userLogin: string
  channelLogin: string
}): Promise<IvrTwitchSubage | null> {
  const user = userLogin.trim().replace(/^#|@/g, "").toLowerCase()
  const channel = channelLogin.trim().replace(/^#|@/g, "").toLowerCase()
  if (!user || !channel) {
    return null
  }

  const response = await devLoggedFetch(
    `${IVR_BASE_URL}/subage/${encodeURIComponent(user)}/${encodeURIComponent(channel)}`
  )

  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new IvrApiError("Could not load subage from IVR.", response.status)
  }

  return (await response.json()) as IvrTwitchSubage
}

export async function fetchIvrTwitchUserProfile({
  userLogin,
}: {
  userLogin: string
}): Promise<IvrTwitchUserProfile | null> {
  const login = userLogin.trim().replace(/^#|@/g, "").toLowerCase()
  if (!login) {
    return null
  }

  const url = new URL(`${IVR_BASE_URL}/user`)
  url.searchParams.set("login", login)

  const response = await devLoggedFetch(url)
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new IvrApiError(
      "Could not load Twitch user profile from IVR.",
      response.status
    )
  }

  const payload = (await response.json()) as unknown
  const entry = Array.isArray(payload) ? payload[0] : payload
  if (!entry || typeof entry !== "object") {
    return null
  }

  const record = entry as Record<string, unknown>
  return {
    id: readString(record, ["id"]) ?? "",
    login: readString(record, ["login"]) ?? login,
    displayName: readString(record, ["displayName", "display_name"]) ?? login,
    bannerImageUrl:
      readString(record, [
        "banner",
        "profileBanner",
        "profileBannerUrl",
        "profile_banner",
        "profile_banner_url",
        "bannerImageUrl",
      ]) ?? "",
  }
}

export async function fetchIvrTwitchModVip(
  channelLogin: string
): Promise<IvrTwitchModVip> {
  const channel = channelLogin.trim().replace(/^#|@/g, "").toLowerCase()
  if (!channel) {
    throw new IvrApiError("Channel login is required.", 400)
  }

  const response = await devLoggedFetch(
    `${IVR_BASE_URL}/modvip/${encodeURIComponent(channel)}`
  )

  if (response.status === 404) {
    return { mods: [], vips: [], ttl: null }
  }

  if (!response.ok) {
    throw new IvrApiError(
      "Could not load moderators and VIPs from IVR.",
      response.status
    )
  }

  const payload = (await response.json()) as {
    mods?: unknown
    vips?: unknown
    ttl?: unknown
  }

  return {
    mods: parseIvrModVipEntries(payload.mods),
    vips: parseIvrModVipEntries(payload.vips),
    ttl: typeof payload.ttl === "number" ? payload.ttl : null,
  }
}

function parseIvrModVipEntries(value: unknown): IvrTwitchModVipEntry[] {
  if (!Array.isArray(value)) {
    return []
  }

  const entries: IvrTwitchModVipEntry[] = []

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue
    }

    const record = item as Record<string, unknown>
    const login = readString(record, ["login"])
    if (!login) {
      continue
    }

    entries.push({
      id: readString(record, ["id"]) ?? "",
      login,
      displayName: readString(record, ["displayName", "display_name"]) ?? login,
      grantedAt: readString(record, ["grantedAt", "granted_at"]) ?? "",
    })
  }

  return entries
}

function readString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string") {
      return value
    }
  }
  return null
}
