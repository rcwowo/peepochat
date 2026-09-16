import * as React from "react"

import type { TwitchAccount } from "@/lib/peepochat/peepochat-config"
import {
  TwitchApiError,
  fetchFollowedLiveStreams,
  fetchTwitchFollowedChannels,
  type TwitchFollowedChannel,
  type TwitchLiveStream,
} from "@/lib/twitch/auth/api"
import {
  buildFollowedChannelRows,
  type FollowedChannelRow,
} from "@/lib/twitch/channel/followed-channels"

export const FOLLOWS_READ_SCOPE = "user:read:follows"
const CACHE_TTL_MS = 60_000

type FollowedChannelsCache = {
  accountId: string
  channels: TwitchFollowedChannel[]
  streams: TwitchLiveStream[]
  fetchedAt: number
  channelsComplete: boolean
}

type FollowedChannelsStore = {
  cache: FollowedChannelsCache | null
  error: string | null
  errorAccountId: string | null
  missingScopeAccountId: string | null
}

type FollowedChannelsState = {
  rows: FollowedChannelRow[]
  loading: boolean
  refreshing: boolean
  missingScope: boolean
  error: string | null
}

const EMPTY_STATE: FollowedChannelsState = {
  rows: [],
  loading: false,
  refreshing: false,
  missingScope: false,
  error: null,
}

const EMPTY_STORE: FollowedChannelsStore = {
  cache: null,
  error: null,
  errorAccountId: null,
  missingScopeAccountId: null,
}

let store: FollowedChannelsStore = EMPTY_STORE
const listeners = new Set<() => void>()
let fetchGeneration = 0
let inFlightAccountId: string | null = null

export function hasFollowsReadScope(account: TwitchAccount | null): boolean {
  return Boolean(account?.scopes?.includes(FOLLOWS_READ_SCOPE))
}

function isMissingFollowsScopeError(error: unknown) {
  return error instanceof TwitchApiError && error.status === 403
}

function rowsFromCache(cache: FollowedChannelsCache | null) {
  if (!cache) {
    return []
  }
  return buildFollowedChannelRows(cache.channels, cache.streams)
}

function isCacheFresh(cache: FollowedChannelsCache, accountId: string) {
  return (
    cache.accountId === accountId &&
    cache.channelsComplete &&
    Date.now() - cache.fetchedAt < CACHE_TTL_MS
  )
}

function publish(next: FollowedChannelsStore) {
  store = next
  for (const listener of listeners) {
    listener()
  }
}

function subscribeFollowedChannels(onStoreChange: () => void) {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}

function getFollowedChannelsSnapshot() {
  return store
}

export function useFollowedChannels(
  account: TwitchAccount | null,
  enabled: boolean
) {
  const snapshot = React.useSyncExternalStore(
    subscribeFollowedChannels,
    getFollowedChannelsSnapshot,
    getFollowedChannelsSnapshot
  )

  React.useEffect(() => {
    if (!enabled || !account || !hasFollowsReadScope(account)) {
      return
    }

    const cached = store.cache?.accountId === account.id ? store.cache : null
    if (cached && isCacheFresh(cached, account.id)) {
      return
    }
    if (inFlightAccountId === account.id) {
      return
    }

    const generation = ++fetchGeneration
    inFlightAccountId = account.id
    const accountId = account.id
    const accessToken = account.accessToken
    const clientId = account.clientId
    let streams: TwitchLiveStream[] = cached?.streams ?? []
    let channels: TwitchFollowedChannel[] = cached?.channels ?? []
    let error: string | null = null

    const isCurrent = () => generation === fetchGeneration

    void (async () => {
      try {
        streams = await fetchFollowedLiveStreams({
          userId: accountId,
          accessToken,
          clientId,
        })
        if (!isCurrent()) {
          return
        }
        publish({
          cache: {
            accountId,
            channels,
            streams,
            fetchedAt: Date.now(),
            channelsComplete: cached?.channelsComplete ?? false,
          },
          error: null,
          errorAccountId: null,
          missingScopeAccountId: null,
        })
      } catch (caught) {
        if (!isCurrent()) {
          return
        }
        if (isMissingFollowsScopeError(caught)) {
          publish({
            ...store,
            missingScopeAccountId: accountId,
          })
          inFlightAccountId = null
          return
        }
        error =
          caught instanceof Error
            ? caught.message
            : "Could not load followed live streams."
      }

      try {
        channels = await fetchTwitchFollowedChannels({
          userId: accountId,
          accessToken,
          clientId,
          onPage: (page) => {
            channels = page
            if (!isCurrent()) {
              return
            }
            publish({
              cache: {
                accountId,
                channels: page,
                streams,
                fetchedAt: Date.now(),
                channelsComplete: false,
              },
              error: null,
              errorAccountId: null,
              missingScopeAccountId: null,
            })
          },
        })
        if (!isCurrent()) {
          return
        }
        publish({
          cache: {
            accountId,
            channels,
            streams,
            fetchedAt: Date.now(),
            channelsComplete: true,
          },
          error: null,
          errorAccountId: null,
          missingScopeAccountId: null,
        })
      } catch (caught) {
        if (!isCurrent()) {
          return
        }
        if (isMissingFollowsScopeError(caught)) {
          publish({
            ...store,
            missingScopeAccountId: accountId,
          })
          inFlightAccountId = null
          return
        }

        const message =
          caught instanceof Error
            ? caught.message
            : "Could not load followed channels."
        const rows = buildFollowedChannelRows(channels, streams)
        publish({
          cache: {
            accountId,
            channels,
            streams,
            fetchedAt: Date.now(),
            channelsComplete: channels.length > 0,
          },
          error: rows.length > 0 ? null : (error ?? message),
          errorAccountId: rows.length > 0 ? null : accountId,
          missingScopeAccountId: null,
        })
      } finally {
        if (isCurrent()) {
          inFlightAccountId = null
        }
      }
    })()
  }, [account, enabled])

  if (!enabled || !account) {
    return EMPTY_STATE
  }

  if (
    !hasFollowsReadScope(account) ||
    snapshot.missingScopeAccountId === account.id
  ) {
    return {
      ...EMPTY_STATE,
      missingScope: true,
    }
  }

  const cache = snapshot.cache?.accountId === account.id ? snapshot.cache : null

  return {
    rows: rowsFromCache(cache),
    loading: !cache,
    refreshing: cache !== null && !cache.channelsComplete,
    missingScope: false,
    error: snapshot.errorAccountId === account.id ? snapshot.error : null,
  }
}
