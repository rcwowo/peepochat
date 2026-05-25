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

export async function fetchTwitchUsersById(
  ids: string[],
  accessToken: string,
  clientId: string
): Promise<TwitchUser[]> {
  const normalized = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]

  if (normalized.length === 0) {
    return []
  }

  const users: TwitchUser[] = []

  for (let index = 0; index < normalized.length; index += 100) {
    const chunk = normalized.slice(index, index + 100)
    const params = new URLSearchParams()
    for (const id of chunk) {
      params.append("id", id)
    }

    const response = await fetch(
      `https://api.twitch.tv/helix/users?${params.toString()}`,
      { headers: helixHeaders(accessToken, clientId) }
    )

    if (!response.ok) {
      throw new TwitchApiError("Could not load Twitch users.", response.status)
    }

    const payload = (await response.json()) as {
      data?: Array<{
        id: string
        login: string
        display_name: string
        profile_image_url: string
      }>
    }

    users.push(
      ...(payload.data ?? []).map((user) => ({
        id: user.id,
        login: user.login,
        displayName: user.display_name,
        profileImageUrl: user.profile_image_url,
        bannerImageUrl: "",
      }))
    )
  }

  return users
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

export type TwitchEmoteFormat = "static" | "animated"

export type TwitchChatEmote = {
  id: string
  name: string
  imageUrl: string
  formats: TwitchEmoteFormat[]
  tier?: string
  emoteType?: string
  ownerId?: string
}

const TWITCH_SUBSCRIPTION_EMOTE_TYPE = "subscriptions"
const TWITCH_FOLLOWER_EMOTE_TYPE = "follower"

export async function fetchGlobalChatEmotes(
  accessToken: string,
  clientId: string
): Promise<TwitchChatEmote[]> {
  const response = await fetch("https://api.twitch.tv/helix/chat/emotes/global", {
    headers: helixHeaders(accessToken, clientId),
  })

  if (!response.ok) {
    throw new TwitchApiError("Could not load global Twitch emotes.", response.status)
  }

  const payload = (await response.json()) as HelixEmoteListResponse

  return parseHelixChatEmotes(payload.data)
}

export async function fetchChannelChatEmotes(
  broadcasterId: string,
  accessToken: string,
  clientId: string
): Promise<TwitchChatEmote[]> {
  const params = new URLSearchParams({ broadcaster_id: broadcasterId })
  const response = await fetch(
    `https://api.twitch.tv/helix/chat/emotes?${params.toString()}`,
    {
      headers: helixHeaders(accessToken, clientId),
    }
  )

  if (!response.ok) {
    throw new TwitchApiError("Could not load channel Twitch emotes.", response.status)
  }

  const payload = (await response.json()) as HelixEmoteListResponse

  return parseHelixChatEmotes(payload.data)
}

export async function fetchUserChatEmotes(
  userId: string,
  accessToken: string,
  clientId: string,
  broadcasterId?: string
): Promise<TwitchChatEmote[]> {
  const params = new URLSearchParams({ user_id: userId })
  if (broadcasterId) {
    params.set("broadcaster_id", broadcasterId)
  }

  return fetchPaginatedUserEmotes(params, accessToken, clientId)
}

/** All Twitch emotes the user can use in chat (paginated). Requires user:read:emotes. */
export async function fetchAllUserChatEmotes(
  userId: string,
  accessToken: string,
  clientId: string
): Promise<TwitchChatEmote[]> {
  return fetchUserChatEmotes(userId, accessToken, clientId)
}

export function isSubscriptionChannelEmote(emote: TwitchChatEmote): boolean {
  return emote.emoteType === TWITCH_SUBSCRIPTION_EMOTE_TYPE
}

export function isFollowerChannelEmote(emote: TwitchChatEmote): boolean {
  return emote.emoteType === TWITCH_FOLLOWER_EMOTE_TYPE
}

export function filterPublicChannelEmotes(
  emotes: TwitchChatEmote[]
): TwitchChatEmote[] {
  return emotes.filter(
    (emote) =>
      !isSubscriptionChannelEmote(emote) && !isFollowerChannelEmote(emote)
  )
}

type HelixEmotePayload = {
  id: string
  name: string
  images?: { url_1x: string; url_2x: string; url_4x: string }
  format?: TwitchEmoteFormat[]
  scale?: string[]
  theme_mode?: string[]
  tier?: string
  emote_type?: string
  owner_id?: string
}

type HelixEmoteListResponse = {
  data?: HelixEmotePayload[]
  template?: string
  pagination?: { cursor?: string }
}

async function fetchPaginatedUserEmotes(
  baseParams: URLSearchParams,
  accessToken: string,
  clientId: string
): Promise<TwitchChatEmote[]> {
  const emotes: TwitchChatEmote[] = []
  let cursor: string | undefined

  do {
    const params = new URLSearchParams(baseParams)
    if (cursor) {
      params.set("after", cursor)
    }

    const response = await fetch(
      `https://api.twitch.tv/helix/chat/emotes/user?${params.toString()}`,
      { headers: helixHeaders(accessToken, clientId) }
    )

    if (!response.ok) {
      throw new TwitchApiError(
        "Could not load user Twitch emotes.",
        response.status
      )
    }

    const payload = (await response.json()) as HelixEmoteListResponse
    emotes.push(...parseHelixChatEmotes(payload.data, payload.template))
    cursor = payload.pagination?.cursor
  } while (cursor)

  return emotes
}

function parseHelixChatEmotes(
  data: HelixEmotePayload[] | undefined,
  template?: string
): TwitchChatEmote[] {
  return (data ?? []).map((emote) => {
    const formats = normalizeEmoteFormats(emote.format)
    return {
      id: emote.id,
      name: emote.name,
      imageUrl: resolveEmoteImageUrl(emote, template, formats),
      formats,
      tier: emote.tier,
      emoteType: emote.emote_type,
      ownerId: emote.owner_id,
    }
  })
}

function normalizeEmoteFormats(
  formats: TwitchEmoteFormat[] | undefined
): TwitchEmoteFormat[] {
  if (!formats || formats.length === 0) {
    return ["static"]
  }

  return formats
}

export function buildTwitchEmoteCdnUrl(
  emoteId: string,
  format: TwitchEmoteFormat = "static",
  themeMode: "light" | "dark" = "dark",
  scale = "1.0"
): string {
  return `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(emoteId)}/${format}/${themeMode}/${scale}`
}

export function prefersAnimatedTwitchEmote(formats: TwitchEmoteFormat[]): boolean {
  return formats.includes("animated")
}

function resolveEmoteImageUrl(
  emote: HelixEmotePayload,
  template: string | undefined,
  formats: TwitchEmoteFormat[]
): string {
  const format = prefersAnimatedTwitchEmote(formats) ? "animated" : "static"

  if (emote.images?.url_1x) {
    if (format === "animated" && emote.images.url_1x.includes("/static/")) {
      return emote.images.url_1x.replace("/static/", "/animated/")
    }
    return emote.images.url_1x
  }

  if (template) {
    return template
      .replace(/\{\{id\}\}/g, emote.id)
      .replace(/\{\{format\}\}/g, format)
      .replace(/\{\{theme_mode\}\}/g, "dark")
      .replace(/\{\{scale\}\}/g, "1.0")
  }

  return buildTwitchEmoteCdnUrl(emote.id, format)
}

function helixHeaders(accessToken: string, clientId: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Client-Id": clientId,
  }
}
