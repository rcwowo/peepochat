export type TwitchValidatedToken = {
  clientId: string
  login: string
  userId: string
  expiresIn: number
  scopes: string[]
}

export type TwitchUser = {
  id: string
  login: string
  displayName: string
  profileImageUrl: string
  bannerImageUrl: string
}

export class TwitchApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "TwitchApiError"
    this.status = status
  }
}

export async function validateTwitchToken(
  accessToken: string
): Promise<TwitchValidatedToken> {
  const response = await fetch("https://id.twitch.tv/oauth2/validate", {
    headers: {
      Authorization: `OAuth ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new TwitchApiError("Twitch token is invalid or expired.", response.status)
  }

  const payload = (await response.json()) as {
    client_id: string
    login: string
    user_id: string
    expires_in: number
    scopes?: string[]
  }

  return {
    clientId: payload.client_id,
    login: payload.login,
    userId: payload.user_id,
    expiresIn: payload.expires_in,
    scopes: payload.scopes ?? [],
  }
}

export async function fetchTwitchUser(
  accessToken: string,
  clientId: string
): Promise<TwitchUser> {
  const response = await fetch("https://api.twitch.tv/helix/users", {
    headers: helixHeaders(accessToken, clientId),
  })

  if (!response.ok) {
    throw new TwitchApiError("Could not load Twitch user profile.", response.status)
  }

  const payload = (await response.json()) as {
    data?: Array<{
      id: string
      login: string
      display_name: string
      profile_image_url: string
      offline_image_url?: string
    }>
  }

  const user = payload.data?.[0]
  if (!user) {
    throw new TwitchApiError("Twitch user profile was not found.", 404)
  }

  return {
    id: user.id,
    login: user.login,
    displayName: user.display_name,
    profileImageUrl: user.profile_image_url,
    bannerImageUrl: user.offline_image_url ?? "",
  }
}

export async function fetchTwitchUsersByLogin(
  logins: string[],
  accessToken: string,
  clientId: string
): Promise<TwitchUser[]> {
  const normalized = [
    ...new Set(
      logins.map((login) => login.trim().replace(/^#/, "").toLowerCase()).filter(Boolean)
    ),
  ]

  if (normalized.length === 0) {
    return []
  }

  const params = new URLSearchParams()
  for (const login of normalized.slice(0, 100)) {
    params.append("login", login)
  }

  const response = await fetch(
    `https://api.twitch.tv/helix/users?${params.toString()}`,
    {
      headers: helixHeaders(accessToken, clientId),
    }
  )

  if (!response.ok) {
    throw new TwitchApiError("Could not load Twitch channels.", response.status)
  }

  const payload = (await response.json()) as {
    data?: Array<{
      id: string
      login: string
      display_name: string
      profile_image_url: string
    }>
  }

  return (payload.data ?? []).map((user) => ({
    id: user.id,
    login: user.login,
    displayName: user.display_name,
    profileImageUrl: user.profile_image_url,
    bannerImageUrl: "",
  }))
}

export type TwitchChatBadgeVersion = {
  id: string
  title: string
  description: string
  imageUrl: string
  imageUrl2x: string
  imageUrl4x: string
}

export type TwitchChatBadgeSet = {
  setId: string
  versions: TwitchChatBadgeVersion[]
}

export async function fetchGlobalChatBadges(
  accessToken: string,
  clientId: string
): Promise<TwitchChatBadgeSet[]> {
  const response = await fetch("https://api.twitch.tv/helix/chat/badges/global", {
    headers: helixHeaders(accessToken, clientId),
  })

  if (!response.ok) {
    throw new TwitchApiError("Could not load global chat badges.", response.status)
  }

  const payload = (await response.json()) as {
    data?: Array<{
      set_id: string
      versions?: Array<{
        id: string
        title: string
        description: string
        image_url_1x: string
        image_url_2x: string
        image_url_4x: string
      }>
    }>
  }

  return parseChatBadgeSets(payload.data)
}

export async function fetchChannelChatBadges(
  broadcasterId: string,
  accessToken: string,
  clientId: string
): Promise<TwitchChatBadgeSet[]> {
  const params = new URLSearchParams({ broadcaster_id: broadcasterId })
  const response = await fetch(
    `https://api.twitch.tv/helix/chat/badges?${params.toString()}`,
    {
      headers: helixHeaders(accessToken, clientId),
    }
  )

  if (!response.ok) {
    throw new TwitchApiError("Could not load channel chat badges.", response.status)
  }

  const payload = (await response.json()) as {
    data?: Array<{
      set_id: string
      versions?: Array<{
        id: string
        title: string
        description: string
        image_url_1x: string
        image_url_2x: string
        image_url_4x: string
      }>
    }>
  }

  return parseChatBadgeSets(payload.data)
}

function parseChatBadgeSets(
  data:
    | Array<{
        set_id: string
        versions?: Array<{
          id: string
          title: string
          description: string
          image_url_1x: string
          image_url_2x: string
          image_url_4x: string
        }>
      }>
    | undefined
): TwitchChatBadgeSet[] {
  return (data ?? []).map((set) => ({
    setId: set.set_id,
    versions: (set.versions ?? []).map((version) => ({
      id: version.id,
      title: version.title,
      description: version.description,
      imageUrl: version.image_url_1x,
      imageUrl2x: version.image_url_2x,
      imageUrl4x: version.image_url_4x,
    })),
  }))
}

function helixHeaders(accessToken: string, clientId: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Client-Id": clientId,
  }
}
