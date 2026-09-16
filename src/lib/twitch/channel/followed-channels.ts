import type {
  TwitchFollowedChannel,
  TwitchLiveStream,
} from "@/lib/twitch/auth/api"
import { normalizeChannelLogin } from "@/lib/twitch/channel/channel"

export type FollowedChannelRow = {
  id: string
  login: string
  displayName: string
  live: boolean
  viewerCount: number
  title: string
  gameName: string
}

export type FollowedChannelListRow =
  | { kind: "header"; id: "live" | "offline"; label: string; count: number }
  | { kind: "channel"; channel: FollowedChannelRow }
  | { kind: "add"; login: string }

function compareDisplayName(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: "base" })
}

function compareFollowedChannelRows(
  left: FollowedChannelRow,
  right: FollowedChannelRow
) {
  if (left.live !== right.live) {
    return left.live ? -1 : 1
  }

  if (left.live && right.live && left.viewerCount !== right.viewerCount) {
    return right.viewerCount - left.viewerCount
  }

  return compareDisplayName(left.displayName, right.displayName)
}

export function buildFollowedChannelRows(
  channels: TwitchFollowedChannel[],
  streams: TwitchLiveStream[]
): FollowedChannelRow[] {
  const channelById = new Map(
    channels.map((channel) => [channel.id, channel] as const)
  )
  const channelByLogin = new Map(
    channels.map((channel) => [channel.login, channel] as const)
  )
  const liveIds = new Set<string>()
  const liveLogins = new Set<string>()
  const rows: FollowedChannelRow[] = []

  for (const stream of streams) {
    const channel =
      channelById.get(stream.userId) ?? channelByLogin.get(stream.userLogin)
    liveIds.add(stream.userId)
    liveLogins.add(stream.userLogin)
    rows.push({
      id: stream.userId,
      login: stream.userLogin,
      displayName: channel?.displayName || stream.userName,
      live: true,
      viewerCount: stream.viewerCount,
      title: stream.title,
      gameName: stream.gameName,
    })
  }

  for (const channel of channels) {
    if (liveIds.has(channel.id) || liveLogins.has(channel.login)) {
      continue
    }

    rows.push({
      id: channel.id,
      login: channel.login,
      displayName: channel.displayName,
      live: false,
      viewerCount: 0,
      title: "",
      gameName: "",
    })
  }

  rows.sort(compareFollowedChannelRows)
  return rows
}

export function matchesFollowedChannelQuery(
  row: FollowedChannelRow,
  query: string
) {
  const needle = normalizeChannelLogin(query)
  if (!needle) {
    return true
  }

  return (
    row.login.includes(needle) || row.displayName.toLowerCase().includes(needle)
  )
}

export function filterFollowedChannelRows(
  rows: FollowedChannelRow[],
  query: string
) {
  const needle = normalizeChannelLogin(query)
  if (!needle) {
    return rows
  }

  return rows.filter((row) => matchesFollowedChannelQuery(row, needle))
}

export function followedChannelListRowKey(row: FollowedChannelListRow) {
  if (row.kind === "header") {
    return `header:${row.id}`
  }
  if (row.kind === "add") {
    return `add:${row.login}`
  }
  return `channel:${row.channel.login}`
}

export function isSelectableFollowedChannelListRow(
  row: FollowedChannelListRow
): row is Extract<FollowedChannelListRow, { kind: "channel" | "add" }> {
  return row.kind === "channel" || row.kind === "add"
}

export function buildFollowedChannelListRows(
  rows: FollowedChannelRow[],
  query: string
): FollowedChannelListRow[] {
  const filtered = filterFollowedChannelRows(rows, query)
  const live = filtered.filter((row) => row.live)
  const offline = filtered.filter((row) => !row.live)
  const list: FollowedChannelListRow[] = []
  const needle = normalizeChannelLogin(query)
  const hasExactLogin = filtered.some((row) => row.login === needle)
  const addRow: FollowedChannelListRow | null =
    needle && !hasExactLogin ? { kind: "add", login: needle } : null

  if (addRow && live.length === 0 && offline.length === 0) {
    list.push(addRow)
  }

  if (live.length > 0) {
    list.push({
      kind: "header",
      id: "live",
      label: "Live",
      count: live.length,
    })
    for (const channel of live) {
      list.push({ kind: "channel", channel })
    }
  }

  if (offline.length > 0) {
    list.push({
      kind: "header",
      id: "offline",
      label: "Offline",
      count: offline.length,
    })
    for (const channel of offline) {
      list.push({ kind: "channel", channel })
    }
  }

  if (addRow && (live.length > 0 || offline.length > 0)) {
    list.push(addRow)
  }

  return list
}
