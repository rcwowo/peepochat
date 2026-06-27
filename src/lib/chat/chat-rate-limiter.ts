const GLOBAL_WINDOW_MS = 30_000
const GLOBAL_LIMIT = 20
const PRIVILEGED_CHANNEL_LIMIT = 100
const PER_CHANNEL_MIN_INTERVAL_MS = 1_000

export type ChatRateLimitResult = "ok" | "too_fast" | "too_many"

export class ChatRateLimiter {
  private globalSends: number[] = []
  private channelSends = new Map<string, number[]>()
  private lastChannelSend = new Map<string, number>()

  check(
    channel: string,
    isPrivileged: boolean,
    now = Date.now()
  ): ChatRateLimitResult {
    this.pruneWindow(this.globalSends, now)

    const channelTimes = this.channelSends.get(channel) ?? []
    this.pruneWindow(channelTimes, now)

    if (!isPrivileged) {
      const lastSend = this.lastChannelSend.get(channel) ?? 0
      if (now - lastSend < PER_CHANNEL_MIN_INTERVAL_MS) {
        return "too_fast"
      }

      if (this.globalSends.length >= GLOBAL_LIMIT) {
        return "too_many"
      }

      return "ok"
    }

    if (channelTimes.length >= PRIVILEGED_CHANNEL_LIMIT) {
      return "too_many"
    }

    if (channelTimes.length < GLOBAL_LIMIT) {
      if (this.globalSends.length >= GLOBAL_LIMIT) {
        return "too_many"
      }
    }

    return "ok"
  }

  record(channel: string, now = Date.now()) {
    this.pruneWindow(this.globalSends, now)
    this.globalSends.push(now)

    const channelTimes = this.channelSends.get(channel) ?? []
    this.pruneWindow(channelTimes, now)
    channelTimes.push(now)
    this.channelSends.set(channel, channelTimes)
    this.lastChannelSend.set(channel, now)
  }

  unrecordLast(channel: string, now = Date.now()) {
    this.popLast(this.globalSends, now)

    const channelTimes = this.channelSends.get(channel)
    if (channelTimes) {
      this.popLast(channelTimes, now)
      if (channelTimes.length === 0) {
        this.channelSends.delete(channel)
      } else {
        this.channelSends.set(channel, channelTimes)
      }
    }

    const previous = this.lastChannelSend.get(channel)
    if (previous !== undefined) {
      const channelTimesAfter = this.channelSends.get(channel) ?? []
      const lastRecorded = channelTimesAfter.at(-1)
      if (lastRecorded === undefined) {
        this.lastChannelSend.delete(channel)
      } else {
        this.lastChannelSend.set(channel, lastRecorded)
      }
    }
  }

  private popLast(timestamps: number[], now: number) {
    this.pruneWindow(timestamps, now)
    timestamps.pop()
  }

  reset() {
    this.globalSends = []
    this.channelSends.clear()
    this.lastChannelSend.clear()
  }

  private pruneWindow(timestamps: number[], now: number) {
    const cutoff = now - GLOBAL_WINDOW_MS
    while (timestamps.length > 0 && timestamps[0]! < cutoff) {
      timestamps.shift()
    }
  }
}
