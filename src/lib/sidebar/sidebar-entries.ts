import type { ChatSplit, TwitchChannel } from "@/lib/peepochat/peepochat-config"
import {
  CHANNEL_ORDER_PREFIX,
  SPLIT_ORDER_PREFIX,
} from "@/lib/sidebar/sidebar-order"

export type SidebarSplitEntry = {
  key: string
  kind: "split"
  split: ChatSplit
  channels: Array<{
    login: string
    displayName?: string
    profileImageUrl?: string
  }>
}

export type SidebarChannelEntry = {
  key: string
  kind: "channel"
  channel: TwitchChannel
}

export type SidebarEntry = SidebarSplitEntry | SidebarChannelEntry

export function getSidebarEntries(
  sidebarOrder: string[],
  splits: ChatSplit[],
  channels: TwitchChannel[],
  channelsInSplits: Set<string>
): SidebarEntry[] {
  const splitById = new Map(splits.map((split) => [split.id, split]))
  const channelByLogin = new Map(
    channels.map((channel) => [channel.login, channel])
  )

  return sidebarOrder
    .map((key) => {
      if (key.startsWith(SPLIT_ORDER_PREFIX)) {
        const split = splitById.get(key.slice(SPLIT_ORDER_PREFIX.length))
        if (!split || split.channels.length < 2) {
          return null
        }

        return {
          key,
          kind: "split" as const,
          split,
          channels: split.channels.map(
            (login) => channelByLogin.get(login) ?? { login }
          ),
        }
      }

      if (key.startsWith(CHANNEL_ORDER_PREFIX)) {
        const channel = channelByLogin.get(
          key.slice(CHANNEL_ORDER_PREFIX.length)
        )
        if (!channel || channelsInSplits.has(channel.login)) {
          return null
        }

        return { key, kind: "channel" as const, channel }
      }

      return null
    })
    .filter((entry): entry is SidebarEntry => Boolean(entry))
}
