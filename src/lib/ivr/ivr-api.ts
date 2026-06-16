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
    throw new IvrApiError("Could not load Twitch user profile from IVR.", response.status)
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

function readString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string") {
      return value
    }
  }
  return null
}
