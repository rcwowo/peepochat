import { devLoggedFetch } from "@/lib/dev-logger"

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
  description: string
  createdAt: string
  broadcasterType: string
  type: string
}

export type TwitchBannedUserStatus = {
  userId: string
  userLogin: string
  userName: string
  expiresAt: string | null
  reason: string | null
  moderatorId: string | null
  moderatorLogin: string | null
  moderatorName: string | null
}

export type TwitchModeratorStatus = {
  userId: string
  userLogin: string
  userName: string
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
  const response = await devLoggedFetch(
    "https://id.twitch.tv/oauth2/validate",
    {
      headers: {
        Authorization: `OAuth ${accessToken}`,
      },
    }
  )

  if (!response.ok) {
    throw new TwitchApiError(
      "Twitch token is invalid or expired.",
      response.status
    )
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
  const response = await devLoggedFetch("https://api.twitch.tv/helix/users", {
    headers: helixHeaders(accessToken, clientId),
  })

  if (!response.ok) {
    throw new TwitchApiError(
      "Could not load Twitch user profile.",
      response.status
    )
  }

  const payload = (await response.json()) as {
    data?: TwitchUserPayload[]
  }

  const user = payload.data?.[0]
  if (!user) {
    throw new TwitchApiError("Twitch user profile was not found.", 404)
  }

  return parseTwitchUser(user)
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

    const response = await devLoggedFetch(
      `https://api.twitch.tv/helix/users?${params.toString()}`,
      { headers: helixHeaders(accessToken, clientId) }
    )

    if (!response.ok) {
      throw new TwitchApiError("Could not load Twitch users.", response.status)
    }

    const payload = (await response.json()) as { data?: TwitchUserPayload[] }

    users.push(...(payload.data ?? []).map(parseTwitchUser))
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
      logins
        .map((login) => login.trim().replace(/^#/, "").toLowerCase())
        .filter(Boolean)
    ),
  ]

  if (normalized.length === 0) {
    return []
  }

  const params = new URLSearchParams()
  for (const login of normalized.slice(0, 100)) {
    params.append("login", login)
  }

  const response = await devLoggedFetch(
    `https://api.twitch.tv/helix/users?${params.toString()}`,
    {
      headers: helixHeaders(accessToken, clientId),
    }
  )

  if (!response.ok) {
    throw new TwitchApiError("Could not load Twitch channels.", response.status)
  }

  const payload = (await response.json()) as { data?: TwitchUserPayload[] }

  return (payload.data ?? []).map(parseTwitchUser)
}

type TwitchUserPayload = {
  id: string
  login: string
  display_name: string
  profile_image_url?: string
  offline_image_url?: string
  description?: string
  created_at?: string
  broadcaster_type?: string
  type?: string
}

function parseTwitchUser(user: TwitchUserPayload): TwitchUser {
  return {
    id: user.id,
    login: user.login,
    displayName: user.display_name,
    profileImageUrl: user.profile_image_url ?? "",
    bannerImageUrl: user.offline_image_url ?? "",
    description: user.description ?? "",
    createdAt: user.created_at ?? "",
    broadcasterType: user.broadcaster_type ?? "",
    type: user.type ?? "",
  }
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
  const response = await devLoggedFetch(
    "https://api.twitch.tv/helix/chat/badges/global",
    {
      headers: helixHeaders(accessToken, clientId),
    }
  )

  if (!response.ok) {
    throw new TwitchApiError(
      "Could not load global chat badges.",
      response.status
    )
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
  const response = await devLoggedFetch(
    `https://api.twitch.tv/helix/chat/badges?${params.toString()}`,
    {
      headers: helixHeaders(accessToken, clientId),
    }
  )

  if (!response.ok) {
    throw new TwitchApiError(
      "Could not load channel chat badges.",
      response.status
    )
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

export async function fetchTwitchBannedUserStatus({
  broadcasterId,
  userId,
  accessToken,
  clientId,
}: {
  broadcasterId: string
  userId: string
  accessToken: string
  clientId: string
}): Promise<TwitchBannedUserStatus | null> {
  const params = new URLSearchParams({ broadcaster_id: broadcasterId })
  params.append("user_id", userId)

  const response = await devLoggedFetch(
    `https://api.twitch.tv/helix/moderation/banned?${params.toString()}`,
    { headers: helixHeaders(accessToken, clientId) }
  )

  if (!response.ok) {
    throw new TwitchApiError("Could not load ban status.", response.status)
  }

  const payload = (await response.json()) as {
    data?: Array<{
      user_id: string
      user_login: string
      user_name: string
      expires_at?: string | null
      reason?: string | null
      moderator_id?: string | null
      moderator_login?: string | null
      moderator_name?: string | null
    }>
  }

  const entry = payload.data?.[0]
  if (!entry) {
    return null
  }

  return {
    userId: entry.user_id,
    userLogin: entry.user_login,
    userName: entry.user_name,
    expiresAt: entry.expires_at || null,
    reason: entry.reason || null,
    moderatorId: entry.moderator_id || null,
    moderatorLogin: entry.moderator_login || null,
    moderatorName: entry.moderator_name || null,
  }
}

export async function fetchTwitchModeratorStatus({
  broadcasterId,
  userId,
  accessToken,
  clientId,
}: {
  broadcasterId: string
  userId: string
  accessToken: string
  clientId: string
}): Promise<TwitchModeratorStatus | null> {
  const params = new URLSearchParams({ broadcaster_id: broadcasterId })
  params.append("user_id", userId)

  const response = await devLoggedFetch(
    `https://api.twitch.tv/helix/moderation/moderators?${params.toString()}`,
    { headers: helixHeaders(accessToken, clientId) }
  )

  if (!response.ok) {
    throw new TwitchApiError(
      "Could not load moderator status.",
      response.status
    )
  }

  const payload = (await response.json()) as {
    data?: Array<{
      user_id: string
      user_login: string
      user_name: string
    }>
  }

  const entry = payload.data?.[0]
  if (!entry) {
    return null
  }

  return {
    userId: entry.user_id,
    userLogin: entry.user_login,
    userName: entry.user_name,
  }
}

export async function banTwitchUser({
  broadcasterId,
  moderatorId,
  userId,
  accessToken,
  clientId,
  reason,
  durationSeconds,
}: {
  broadcasterId: string
  moderatorId: string
  userId: string
  accessToken: string
  clientId: string
  reason?: string
  durationSeconds?: number
}): Promise<void> {
  const params = new URLSearchParams({
    broadcaster_id: broadcasterId,
    moderator_id: moderatorId,
  })
  const body: {
    data: { user_id: string; reason?: string; duration?: number }
  } = {
    data: { user_id: userId },
  }

  if (reason?.trim()) {
    body.data.reason = reason.trim()
  }
  if (durationSeconds && durationSeconds > 0) {
    body.data.duration = Math.floor(durationSeconds)
  }

  const response = await devLoggedFetch(
    `https://api.twitch.tv/helix/moderation/bans?${params.toString()}`,
    {
      method: "POST",
      headers: helixJsonHeaders(accessToken, clientId),
      body: JSON.stringify(body),
    }
  )

  if (!response.ok) {
    throw new TwitchApiError("Could not update ban status.", response.status)
  }
}

export async function unbanTwitchUser({
  broadcasterId,
  moderatorId,
  userId,
  accessToken,
  clientId,
}: {
  broadcasterId: string
  moderatorId: string
  userId: string
  accessToken: string
  clientId: string
}): Promise<void> {
  const params = new URLSearchParams({
    broadcaster_id: broadcasterId,
    moderator_id: moderatorId,
    user_id: userId,
  })

  const response = await devLoggedFetch(
    `https://api.twitch.tv/helix/moderation/bans?${params.toString()}`,
    {
      method: "DELETE",
      headers: helixHeaders(accessToken, clientId),
    }
  )

  if (!response.ok) {
    throw new TwitchApiError(
      "Could not remove ban or timeout.",
      response.status
    )
  }
}

export async function setTwitchModeratorStatus({
  broadcasterId,
  userId,
  accessToken,
  clientId,
  moderated,
}: {
  broadcasterId: string
  userId: string
  accessToken: string
  clientId: string
  moderated: boolean
}): Promise<void> {
  const params = new URLSearchParams({
    broadcaster_id: broadcasterId,
    user_id: userId,
  })

  const response = await devLoggedFetch(
    `https://api.twitch.tv/helix/moderation/moderators?${params.toString()}`,
    {
      method: moderated ? "POST" : "DELETE",
      headers: helixHeaders(accessToken, clientId),
    }
  )

  if (!response.ok) {
    throw new TwitchApiError(
      moderated ? "Could not add moderator." : "Could not remove moderator.",
      response.status
    )
  }
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
  const response = await devLoggedFetch(
    "https://api.twitch.tv/helix/chat/emotes/global",
    {
      headers: helixHeaders(accessToken, clientId),
    }
  )

  if (!response.ok) {
    throw new TwitchApiError(
      "Could not load global Twitch emotes.",
      response.status
    )
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
  const response = await devLoggedFetch(
    `https://api.twitch.tv/helix/chat/emotes?${params.toString()}`,
    {
      headers: helixHeaders(accessToken, clientId),
    }
  )

  if (!response.ok) {
    throw new TwitchApiError(
      "Could not load channel Twitch emotes.",
      response.status
    )
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

    const response = await devLoggedFetch(
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

export function prefersAnimatedTwitchEmote(
  formats: TwitchEmoteFormat[]
): boolean {
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

export type TwitchLiveStream = {
  id: string
  userId: string
  userLogin: string
  userName: string
  title: string
  gameName: string
  viewerCount: number
  startedAt: string
}

export async function fetchLiveStreamsByLogin(
  logins: string[],
  accessToken: string,
  clientId: string
): Promise<TwitchLiveStream[]> {
  const normalized = [
    ...new Set(
      logins
        .map((login) => login.trim().replace(/^#/, "").toLowerCase())
        .filter(Boolean)
    ),
  ]

  if (normalized.length === 0) {
    return []
  }

  const streams: TwitchLiveStream[] = []

  for (let index = 0; index < normalized.length; index += 100) {
    const chunk = normalized.slice(index, index + 100)
    const params = new URLSearchParams()
    for (const login of chunk) {
      params.append("user_login", login)
    }

    const response = await devLoggedFetch(
      `https://api.twitch.tv/helix/streams?${params.toString()}`,
      { headers: helixHeaders(accessToken, clientId) }
    )

    if (!response.ok) {
      throw new TwitchApiError("Could not load live streams.", response.status)
    }

    const payload = (await response.json()) as {
      data?: Array<{
        id: string
        user_id: string
        user_login: string
        user_name: string
        title: string
        game_name: string
        viewer_count: number
        started_at: string
      }>
    }

    streams.push(
      ...(payload.data ?? []).map((stream) => ({
        id: stream.id,
        userId: stream.user_id,
        userLogin: stream.user_login.toLowerCase(),
        userName: stream.user_name,
        title: stream.title,
        gameName: stream.game_name ?? "",
        viewerCount: stream.viewer_count,
        startedAt: stream.started_at,
      }))
    )
  }

  return streams
}

export type TwitchChatSettings = {
  slowMode: boolean
  slowModeWaitTime: number | null
  followerMode: boolean
  followerModeDuration: number | null
  subscriberMode: boolean
  emoteMode: boolean
  uniqueChatMode: boolean
}

export type TwitchCommercialResult = {
  length: number
  message: string
  retryAfter: number
}

export type TwitchStreamMarker = {
  id: string
  createdAt: string
  positionSeconds: number
  description: string
}

async function throwTwitchApiError(
  response: Response,
  fallback: string
): Promise<never> {
  let message = fallback
  try {
    const payload = (await response.json()) as { message?: string }
    if (payload.message?.trim()) {
      message = payload.message.trim()
    }
  } catch {
    // ignore parse errors
  }
  throw new TwitchApiError(message, response.status)
}

export async function clearTwitchChat({
  broadcasterId,
  moderatorId,
  accessToken,
  clientId,
}: {
  broadcasterId: string
  moderatorId: string
  accessToken: string
  clientId: string
}): Promise<void> {
  const params = new URLSearchParams({
    broadcaster_id: broadcasterId,
    moderator_id: moderatorId,
  })

  const response = await devLoggedFetch(
    `https://api.twitch.tv/helix/moderation/chat?${params.toString()}`,
    {
      method: "DELETE",
      headers: helixHeaders(accessToken, clientId),
    }
  )

  if (!response.ok) {
    await throwTwitchApiError(response, "Could not clear chat.")
  }
}

export async function updateTwitchChatSettings({
  broadcasterId,
  moderatorId,
  accessToken,
  clientId,
  settings,
}: {
  broadcasterId: string
  moderatorId: string
  accessToken: string
  clientId: string
  settings: {
    slowMode?: boolean
    slowModeWaitTime?: number
    followerMode?: boolean
    followerModeDuration?: number
    subscriberMode?: boolean
    emoteMode?: boolean
    uniqueChatMode?: boolean
  }
}): Promise<void> {
  const params = new URLSearchParams({
    broadcaster_id: broadcasterId,
    moderator_id: moderatorId,
  })

  const body: Record<string, boolean | number> = {}
  if (settings.slowMode !== undefined) {
    body.slow_mode = settings.slowMode
  }
  if (settings.slowModeWaitTime !== undefined) {
    body.slow_mode_wait_time = settings.slowModeWaitTime
  }
  if (settings.followerMode !== undefined) {
    body.follower_mode = settings.followerMode
  }
  if (settings.followerModeDuration !== undefined) {
    body.follower_mode_duration = settings.followerModeDuration
  }
  if (settings.subscriberMode !== undefined) {
    body.subscriber_mode = settings.subscriberMode
  }
  if (settings.emoteMode !== undefined) {
    body.emote_mode = settings.emoteMode
  }
  if (settings.uniqueChatMode !== undefined) {
    body.unique_chat_mode = settings.uniqueChatMode
  }

  const response = await devLoggedFetch(
    `https://api.twitch.tv/helix/chat/settings?${params.toString()}`,
    {
      method: "PATCH",
      headers: helixJsonHeaders(accessToken, clientId),
      body: JSON.stringify(body),
    }
  )

  if (!response.ok) {
    await throwTwitchApiError(response, "Could not update chat settings.")
  }
}

export async function sendTwitchChatAnnouncement({
  broadcasterId,
  moderatorId,
  message,
  color,
  accessToken,
  clientId,
}: {
  broadcasterId: string
  moderatorId: string
  message: string
  color?: string
  accessToken: string
  clientId: string
}): Promise<void> {
  const params = new URLSearchParams({
    broadcaster_id: broadcasterId,
    moderator_id: moderatorId,
  })
  const body: { message: string; color?: string } = { message }
  if (color) {
    body.color = color
  }

  const response = await devLoggedFetch(
    `https://api.twitch.tv/helix/chat/announcements?${params.toString()}`,
    {
      method: "POST",
      headers: helixJsonHeaders(accessToken, clientId),
      body: JSON.stringify(body),
    }
  )

  if (!response.ok) {
    await throwTwitchApiError(response, "Could not send announcement.")
  }
}

export async function sendTwitchShoutout({
  fromBroadcasterId,
  toBroadcasterId,
  moderatorId,
  accessToken,
  clientId,
}: {
  fromBroadcasterId: string
  toBroadcasterId: string
  moderatorId: string
  accessToken: string
  clientId: string
}): Promise<void> {
  const params = new URLSearchParams({
    from_broadcaster_id: fromBroadcasterId,
    to_broadcaster_id: toBroadcasterId,
    moderator_id: moderatorId,
  })

  const response = await devLoggedFetch(
    `https://api.twitch.tv/helix/chat/shoutouts?${params.toString()}`,
    {
      method: "POST",
      headers: helixHeaders(accessToken, clientId),
    }
  )

  if (!response.ok) {
    await throwTwitchApiError(response, "Could not send shoutout.")
  }
}

export async function startTwitchCommercial({
  broadcasterId,
  length,
  accessToken,
  clientId,
}: {
  broadcasterId: string
  length: number
  accessToken: string
  clientId: string
}): Promise<TwitchCommercialResult> {
  const response = await devLoggedFetch(
    "https://api.twitch.tv/helix/channels/commercial",
    {
      method: "POST",
      headers: helixJsonHeaders(accessToken, clientId),
      body: JSON.stringify({ broadcaster_id: broadcasterId, length }),
    }
  )

  if (!response.ok) {
    await throwTwitchApiError(response, "Could not start commercial.")
  }

  const payload = (await response.json()) as {
    data?: Array<{
      length: number
      message: string
      retry_after: number
    }>
  }
  const entry = payload.data?.[0]
  return {
    length: entry?.length ?? length,
    message: entry?.message ?? "",
    retryAfter: entry?.retry_after ?? 0,
  }
}

export async function createTwitchStreamMarker({
  userId,
  description,
  accessToken,
  clientId,
}: {
  userId: string
  description?: string
  accessToken: string
  clientId: string
}): Promise<TwitchStreamMarker> {
  const body: { user_id: string; description?: string } = { user_id: userId }
  if (description?.trim()) {
    body.description = description.trim().slice(0, 140)
  }

  const response = await devLoggedFetch(
    "https://api.twitch.tv/helix/streams/markers",
    {
      method: "POST",
      headers: helixJsonHeaders(accessToken, clientId),
      body: JSON.stringify(body),
    }
  )

  if (!response.ok) {
    await throwTwitchApiError(response, "Could not create stream marker.")
  }

  const payload = (await response.json()) as {
    data?: Array<{
      id: string
      created_at: string
      position_seconds: number
      description: string
    }>
  }
  const entry = payload.data?.[0]
  if (!entry) {
    throw new TwitchApiError("Stream marker response was empty.", 500)
  }

  return {
    id: String(entry.id),
    createdAt: entry.created_at,
    positionSeconds: entry.position_seconds,
    description: entry.description ?? "",
  }
}

export async function startTwitchRaid({
  fromBroadcasterId,
  toBroadcasterId,
  accessToken,
  clientId,
}: {
  fromBroadcasterId: string
  toBroadcasterId: string
  accessToken: string
  clientId: string
}): Promise<void> {
  const params = new URLSearchParams({
    from_broadcaster_id: fromBroadcasterId,
    to_broadcaster_id: toBroadcasterId,
  })

  const response = await devLoggedFetch(
    `https://api.twitch.tv/helix/raids?${params.toString()}`,
    {
      method: "POST",
      headers: helixHeaders(accessToken, clientId),
    }
  )

  if (!response.ok) {
    await throwTwitchApiError(response, "Could not start raid.")
  }
}

export async function cancelTwitchRaid({
  broadcasterId,
  accessToken,
  clientId,
}: {
  broadcasterId: string
  accessToken: string
  clientId: string
}): Promise<void> {
  const params = new URLSearchParams({ broadcaster_id: broadcasterId })

  const response = await devLoggedFetch(
    `https://api.twitch.tv/helix/raids?${params.toString()}`,
    {
      method: "DELETE",
      headers: helixHeaders(accessToken, clientId),
    }
  )

  if (!response.ok) {
    await throwTwitchApiError(response, "Could not cancel raid.")
  }
}

export async function setTwitchVipStatus({
  broadcasterId,
  userId,
  accessToken,
  clientId,
  isVip,
}: {
  broadcasterId: string
  userId: string
  accessToken: string
  clientId: string
  isVip: boolean
}): Promise<void> {
  const params = new URLSearchParams({
    broadcaster_id: broadcasterId,
    user_id: userId,
  })

  const response = await devLoggedFetch(
    `https://api.twitch.tv/helix/channels/vips?${params.toString()}`,
    {
      method: isVip ? "POST" : "DELETE",
      headers: helixHeaders(accessToken, clientId),
    }
  )

  if (!response.ok) {
    await throwTwitchApiError(
      response,
      isVip ? "Could not add VIP." : "Could not remove VIP."
    )
  }
}

export async function sendTwitchWhisper({
  fromUserId,
  toUserId,
  message,
  accessToken,
  clientId,
}: {
  fromUserId: string
  toUserId: string
  message: string
  accessToken: string
  clientId: string
}): Promise<void> {
  const params = new URLSearchParams({
    from_user_id: fromUserId,
    to_user_id: toUserId,
  })

  const response = await devLoggedFetch(
    `https://api.twitch.tv/helix/whispers?${params.toString()}`,
    {
      method: "POST",
      headers: helixJsonHeaders(accessToken, clientId),
      body: JSON.stringify({ message }),
    }
  )

  if (!response.ok) {
    await throwTwitchApiError(response, "Could not send whisper.")
  }
}

function helixHeaders(accessToken: string, clientId: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Client-Id": clientId,
  }
}

function helixJsonHeaders(accessToken: string, clientId: string): HeadersInit {
  return {
    ...helixHeaders(accessToken, clientId),
    "Content-Type": "application/json",
  }
}
