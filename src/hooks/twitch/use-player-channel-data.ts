import * as React from "react"

import type { TwitchAccount } from "@/lib/peepochat/peepochat-config"
import {
  fetchChannelsByBroadcasterId,
  fetchLiveStreamsByLogin,
  fetchTwitchUsersByLogin,
  type TwitchChannelInformation,
  type TwitchLiveStream,
  type TwitchUser,
} from "@/lib/twitch/twitch-api"

const PLAYER_STREAM_POLL_INTERVAL_MS = 45_000

type PlayerChannelData = {
  user: TwitchUser | null
  channel: TwitchChannelInformation | null
  stream: TwitchLiveStream | null
  loading: boolean
  error: boolean
}

const EMPTY_PLAYER_CHANNEL_DATA: PlayerChannelData = {
  user: null,
  channel: null,
  stream: null,
  loading: false,
  error: false,
}

class PlayerChannelDataEntry {
  private snapshot: PlayerChannelData = {
    ...EMPTY_PLAYER_CHANNEL_DATA,
    loading: true,
  }
  private readonly listeners = new Set<() => void>()
  private intervalId: number | null = null
  private generation = 0
  private profileError = false
  private streamError = false
  private readonly channelLogin: string
  private readonly account: TwitchAccount

  constructor(channelLogin: string, account: TwitchAccount) {
    this.channelLogin = channelLogin
    this.account = account
  }

  getSnapshot = () => this.snapshot

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    if (this.listeners.size === 1) {
      this.start()
    }

    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) {
        this.stop()
      }
    }
  }

  private publish(next: Partial<PlayerChannelData>) {
    this.snapshot = {
      ...this.snapshot,
      ...next,
      error: this.profileError || this.streamError,
    }
    this.listeners.forEach((listener) => listener())
  }

  private start() {
    const generation = ++this.generation
    this.publish({ loading: true })
    void this.loadProfile(generation)
    void this.loadStream(generation)
    this.intervalId = window.setInterval(
      () => void this.loadStream(generation),
      PLAYER_STREAM_POLL_INTERVAL_MS
    )
  }

  private stop() {
    this.generation += 1
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private async loadProfile(generation: number) {
    try {
      const [user] = await fetchTwitchUsersByLogin(
        [this.channelLogin],
        this.account.accessToken,
        this.account.clientId
      )
      if (generation !== this.generation) {
        return
      }

      if (!user) {
        this.profileError = true
        this.publish({ user: null, channel: null, loading: false })
        return
      }

      const [channel] = await fetchChannelsByBroadcasterId(
        [user.id],
        this.account.accessToken,
        this.account.clientId
      )
      if (generation !== this.generation) {
        return
      }

      this.profileError = false
      this.publish({ user, channel: channel ?? null, loading: false })
    } catch {
      if (generation === this.generation) {
        this.profileError = true
        this.publish({ loading: false })
      }
    }
  }

  private async loadStream(generation: number) {
    try {
      const [stream] = await fetchLiveStreamsByLogin(
        [this.channelLogin],
        this.account.accessToken,
        this.account.clientId
      )
      if (generation === this.generation) {
        this.streamError = false
        this.publish({ stream: stream ?? null })
      }
    } catch {
      if (generation === this.generation) {
        this.streamError = true
        this.publish({})
      }
    }
  }
}

const playerChannelDataEntries = new Map<string, PlayerChannelDataEntry>()

export function usePlayerChannelData(
  channelLogin: string,
  account: TwitchAccount | null
) {
  const entry = React.useMemo(() => {
    if (!account) {
      return null
    }

    const key = [
      account.id,
      account.clientId,
      account.accessToken,
      channelLogin,
    ].join(":")
    const existing = playerChannelDataEntries.get(key)
    if (existing) {
      return existing
    }

    const created = new PlayerChannelDataEntry(channelLogin, account)
    playerChannelDataEntries.set(key, created)
    return created
  }, [account, channelLogin])
  const subscribe = React.useCallback(
    (listener: () => void) => entry?.subscribe(listener) ?? (() => undefined),
    [entry]
  )
  const getSnapshot = React.useCallback(
    () => entry?.getSnapshot() ?? EMPTY_PLAYER_CHANNEL_DATA,
    [entry]
  )

  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
