import type { AppConfig, TwitchAccount } from "@/lib/peepochat/peepochat-config"
import { fetchIvrTwitchUserProfile } from "@/lib/ivr/ivr-api"
import {
  TwitchApiError,
  fetchTwitchUser,
  fetchTwitchUsersByLogin,
  type TwitchUser,
} from "@/lib/twitch/auth/api"
import { normalizeChannelLogin } from "@/lib/twitch/channel/channel"

const PROFILE_BATCH_SIZE = 100
const BANNER_TIMEOUT_MS = 10_000

export type ProfileRefreshAuth = Pick<TwitchAccount, "accessToken" | "clientId">

export type ProfileRefresh = {
  account: TwitchUser | null
  channels: TwitchUser[]
}

export type ProfileRefreshOutcome = {
  refresh: ProfileRefresh
  retryAccount: boolean
  retryLogins: string[]
  unauthorized: boolean
}

export type ProfileRefreshFetchers = {
  fetchUser: typeof fetchTwitchUser
  fetchUsersByLogin: typeof fetchTwitchUsersByLogin
}

const defaultFetchers: ProfileRefreshFetchers = {
  fetchUser: fetchTwitchUser,
  fetchUsersByLogin: fetchTwitchUsersByLogin,
}

export function chunkLogins(logins: string[], size = PROFILE_BATCH_SIZE) {
  const unique = [
    ...new Set(
      logins.flatMap((login) => {
        const normalized = normalizeChannelLogin(login)
        return normalized ? [normalized] : []
      })
    ),
  ]
  const chunks: string[][] = []
  for (let index = 0; index < unique.length; index += size) {
    chunks.push(unique.slice(index, index + size))
  }
  return chunks
}

export function isRetryableProfileError(error: unknown) {
  if (!(error instanceof TwitchApiError)) {
    return true
  }
  return error.status === 429 || error.status >= 500
}

function isUnauthorized(error: unknown) {
  return error instanceof TwitchApiError && error.status === 401
}

export async function fetchProfileRefresh(
  auth: ProfileRefreshAuth,
  options: { includeAccount: boolean; channelLogins: string[] },
  fetchers: ProfileRefreshFetchers = defaultFetchers
): Promise<ProfileRefreshOutcome> {
  const chunks = chunkLogins(options.channelLogins)
  const [accountResults, channelResults] = await Promise.all([
    Promise.allSettled(
      options.includeAccount
        ? [fetchers.fetchUser(auth.accessToken, auth.clientId)]
        : []
    ),
    Promise.allSettled(
      chunks.map((chunk) =>
        fetchers.fetchUsersByLogin(chunk, auth.accessToken, auth.clientId)
      )
    ),
  ])

  const outcome: ProfileRefreshOutcome = {
    refresh: { account: null, channels: [] },
    retryAccount: false,
    retryLogins: [],
    unauthorized: false,
  }

  const [accountResult] = accountResults
  if (accountResult?.status === "fulfilled") {
    outcome.refresh.account = accountResult.value
  } else if (accountResult?.status === "rejected") {
    outcome.unauthorized ||= isUnauthorized(accountResult.reason)
    outcome.retryAccount = isRetryableProfileError(accountResult.reason)
  }

  channelResults.forEach((result, index) => {
    if (result.status === "fulfilled") {
      outcome.refresh.channels.push(...result.value)
      return
    }
    outcome.unauthorized ||= isUnauthorized(result.reason)
    if (isRetryableProfileError(result.reason)) {
      outcome.retryLogins.push(...(chunks[index] ?? []))
    }
  })

  return outcome
}

export async function fetchAccountBannerImageUrl(
  login: string,
  timeoutMs = BANNER_TIMEOUT_MS,
  fetchProfile: typeof fetchIvrTwitchUserProfile = fetchIvrTwitchUserProfile
): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs)
  })
  try {
    const profile = await Promise.race([
      fetchProfile({ userLogin: login }).catch(() => null),
      timeout,
    ])
    return profile?.bannerImageUrl ?? null
  } finally {
    if (timer !== null) {
      clearTimeout(timer)
    }
  }
}

export function applyProfileRefresh(
  config: AppConfig,
  refresh: ProfileRefresh
): AppConfig {
  const currentAccount = config.twitch.account
  let nextAccount = currentAccount
  if (currentAccount && refresh.account?.id === currentAccount.id) {
    const user = refresh.account
    if (
      currentAccount.login !== user.login ||
      currentAccount.displayName !== user.displayName ||
      currentAccount.profileImageUrl !== user.profileImageUrl
    ) {
      nextAccount = {
        ...currentAccount,
        login: user.login,
        displayName: user.displayName,
        profileImageUrl: user.profileImageUrl,
      }
    }
  }

  const usersByLogin = new Map(
    refresh.channels.map((user) => [user.login.toLowerCase(), user])
  )
  let channelsChanged = false
  const nextChannels = config.twitch.channels.map((channel) => {
    const user = usersByLogin.get(channel.login)
    if (
      !user ||
      (channel.displayName === user.displayName &&
        channel.profileImageUrl === user.profileImageUrl)
    ) {
      return channel
    }
    channelsChanged = true
    return {
      ...channel,
      displayName: user.displayName,
      profileImageUrl: user.profileImageUrl,
    }
  })

  if (nextAccount === currentAccount && !channelsChanged) {
    return config
  }

  return {
    ...config,
    twitch: {
      ...config.twitch,
      account: nextAccount,
      channels: channelsChanged ? nextChannels : config.twitch.channels,
    },
  }
}

export function applyAccountBanner(
  config: AppConfig,
  accountId: string,
  bannerImageUrl: string | null
): AppConfig {
  const account = config.twitch.account
  if (
    bannerImageUrl === null ||
    !account ||
    account.id !== accountId ||
    account.bannerImageUrl === bannerImageUrl
  ) {
    return config
  }
  return {
    ...config,
    twitch: {
      ...config.twitch,
      account: { ...account, bannerImageUrl },
    },
  }
}
