import { arrayMove } from "@dnd-kit/sortable"

import type { AppConfig, ChatSplit, TwitchChannel } from "@/lib/chatvoice-config"
import { getChannelsUsedInSplits, normalizeSplitChannels } from "@/lib/chatvoice-config"

export const SPLIT_ORDER_PREFIX = "split:"
export const CHANNEL_ORDER_PREFIX = "channel:"

export function splitOrderKey(splitId: string) {
  return `${SPLIT_ORDER_PREFIX}${splitId}`
}

export function channelOrderKey(login: string) {
  return `${CHANNEL_ORDER_PREFIX}${login.trim().replace(/^#/, "").toLowerCase()}`
}

export function buildSidebarOrder(config: AppConfig): string[] {
  const inSplits = getChannelsUsedInSplits(config.layout.splits)
  const order: string[] = []

  for (const split of config.layout.splits) {
    if (split.channels.length >= 2) {
      order.push(splitOrderKey(split.id))
    }
  }

  for (const channel of config.twitch.channels) {
    if (!inSplits.has(channel.login)) {
      order.push(channelOrderKey(channel.login))
    }
  }

  return order
}

export function normalizeSidebarOrder(config: AppConfig): string[] {
  const defaultOrder = buildSidebarOrder(config)
  const validKeys = new Set(defaultOrder)
  const result: string[] = []

  for (const key of config.layout.sidebarOrder ?? []) {
    if (validKeys.has(key) && !result.includes(key)) {
      result.push(key)
    }
  }

  for (const key of defaultOrder) {
    if (!result.includes(key)) {
      result.push(key)
    }
  }

  return result
}

export function applySidebarOrder(
  config: AppConfig,
  order: string[]
): {
  channels: TwitchChannel[]
  layout: AppConfig["layout"] & { sidebarOrder: string[] }
} {
  const channelMap = new Map(
    config.twitch.channels.map((channel) => [channel.login, channel])
  )
  const splitMap = new Map(config.layout.splits.map((split) => [split.id, split]))

  const splits: ChatSplit[] = []
  const soloChannels: TwitchChannel[] = []
  const seenSplits = new Set<string>()
  const seenSolo = new Set<string>()

  for (const key of order) {
    if (key.startsWith(SPLIT_ORDER_PREFIX)) {
      const split = splitMap.get(key.slice(SPLIT_ORDER_PREFIX.length))
      if (split && split.channels.length >= 2 && !seenSplits.has(split.id)) {
        splits.push(split)
        seenSplits.add(split.id)
      }
      continue
    }

    if (key.startsWith(CHANNEL_ORDER_PREFIX)) {
      const login = key.slice(CHANNEL_ORDER_PREFIX.length)
      const channel = channelMap.get(login)
      if (channel && !seenSolo.has(login)) {
        soloChannels.push(channel)
        seenSolo.add(login)
      }
    }
  }

  for (const split of config.layout.splits) {
    if (split.channels.length >= 2 && !seenSplits.has(split.id)) {
      splits.push(split)
      seenSplits.add(split.id)
    }
  }

  const inSplits = getChannelsUsedInSplits(splits)
  for (const channel of config.twitch.channels) {
    if (!inSplits.has(channel.login) && !seenSolo.has(channel.login)) {
      soloChannels.push(channel)
      seenSolo.add(channel.login)
    }
  }

  const channels: TwitchChannel[] = []
  const seenChannels = new Set<string>()

  for (const split of splits) {
    for (const login of normalizeSplitChannels(split.channels)) {
      const channel = channelMap.get(login)
      if (channel && !seenChannels.has(login)) {
        channels.push(channel)
        seenChannels.add(login)
      }
    }
  }

  for (const channel of soloChannels) {
    if (!seenChannels.has(channel.login)) {
      channels.push(channel)
      seenChannels.add(channel.login)
    }
  }

  for (const channel of config.twitch.channels) {
    if (!seenChannels.has(channel.login)) {
      channels.push(channel)
      seenChannels.add(channel.login)
    }
  }

  const nextConfig: AppConfig = {
    ...config,
    twitch: { ...config.twitch, channels },
    layout: {
      ...config.layout,
      splits,
      sidebarOrder: order,
    },
  }

  return {
    channels,
    layout: {
      ...nextConfig.layout,
      sidebarOrder: normalizeSidebarOrder(nextConfig),
    },
  }
}

export function removeKeysFromSidebarOrder(order: string[], keys: string[]) {
  const remove = new Set(keys)
  return order.filter((key) => !remove.has(key))
}

export function reorderSidebarItemIds(
  order: string[],
  activeId: string,
  overId: string
) {
  const oldIndex = order.indexOf(activeId)
  const newIndex = order.indexOf(overId)
  if (oldIndex === -1 || newIndex === -1) {
    return order
  }
  return arrayMove(order, oldIndex, newIndex)
}

export function appendChannelToSidebarOrder(order: string[], login: string) {
  const key = channelOrderKey(login)
  if (order.includes(key)) {
    return order
  }
  return [...order, key]
}

export function replaceChannelsWithSplitInOrder(
  order: string[],
  splitId: string,
  channelLogins: string[]
) {
  const splitKey = splitOrderKey(splitId)
  const channelKeys = channelLogins.map(channelOrderKey)
  const withoutChannels = order.filter(
    (key) => !channelKeys.includes(key) && key !== splitKey
  )
  return [...withoutChannels, splitKey]
}
