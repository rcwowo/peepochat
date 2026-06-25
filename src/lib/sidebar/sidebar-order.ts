import { arrayMove } from "@dnd-kit/sortable"

import type {
  AppConfig,
  ChatSplit,
  TwitchChannel,
} from "@/lib/peepochat/peepochat-config"
import {
  getActiveChannelLogin,
  getActiveSplitChannels,
  getChannelsUsedInSplits,
  isSplitViewActive,
  normalizeSplitChannels,
} from "@/lib/peepochat/peepochat-config"

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
  const splitMap = new Map(
    config.layout.splits.map((split) => [split.id, split])
  )

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
  const removeKeys = new Set<string>([splitKey, ...channelKeys])

  // Insert the split at the position of the earliest channel being replaced.
  // If none of the channels exist in the order (edge cases), keep the split's
  // existing position if present, otherwise append it.
  const indices = channelKeys
    .map((key) => order.indexOf(key))
    .filter((idx) => idx >= 0)
  const existingSplitIndex = order.indexOf(splitKey)
  const insertIndex =
    indices.length > 0
      ? Math.min(...indices)
      : existingSplitIndex >= 0
        ? existingSplitIndex
        : order.length

  const next = order.filter((key) => !removeKeys.has(key))
  const clampedIndex = Math.max(0, Math.min(insertIndex, next.length))
  next.splice(clampedIndex, 0, splitKey)
  return next
}

export type SidebarFocusTarget = {
  activeChannelLogin: string
  activeSplitId: string | null
}

export function wasRemovedChannelInView(
  config: AppConfig,
  removedLogin: string
): boolean {
  if (isSplitViewActive(config)) {
    return getActiveSplitChannels(config).includes(removedLogin)
  }

  return getActiveChannelLogin(config) === removedLogin
}

function focusTargetFromSidebarKey(
  key: string,
  splits: ChatSplit[],
  channels: TwitchChannel[]
): SidebarFocusTarget | null {
  if (key.startsWith(SPLIT_ORDER_PREFIX)) {
    const splitId = key.slice(SPLIT_ORDER_PREFIX.length)
    const split = splits.find((entry) => entry.id === splitId)
    if (split && split.channels.length >= 2) {
      return {
        activeChannelLogin: normalizeSplitChannels(split.channels)[0],
        activeSplitId: splitId,
      }
    }
    return null
  }

  if (key.startsWith(CHANNEL_ORDER_PREFIX)) {
    const login = key.slice(CHANNEL_ORDER_PREFIX.length)
    if (channels.some((channel) => channel.login === login)) {
      return {
        activeChannelLogin: login,
        activeSplitId: null,
      }
    }
  }

  return null
}

function resolveSidebarNavigationTarget(
  orderBefore: string[],
  orderAfter: string[],
  removedKey: string
): string | null {
  if (orderAfter.length === 0) {
    return null
  }

  const removedIndex = orderBefore.indexOf(removedKey)
  const orderAfterSet = new Set(orderAfter)

  if (removedIndex === 0) {
    return orderAfter[0]
  }

  if (removedIndex > 0) {
    for (let index = removedIndex - 1; index >= 0; index -= 1) {
      const key = orderBefore[index]
      if (orderAfterSet.has(key)) {
        return key
      }
    }
  }

  return orderAfter[0]
}

function firstAvailableSidebarFocus(
  orderAfter: string[],
  splits: ChatSplit[],
  channels: TwitchChannel[]
): SidebarFocusTarget {
  for (const key of orderAfter) {
    const target = focusTargetFromSidebarKey(key, splits, channels)
    if (target) {
      return target
    }
  }

  return { activeChannelLogin: "", activeSplitId: null }
}

export function resolveFocusAfterChannelRemoval(
  config: AppConfig,
  removedLogin: string,
  nextState: {
    channels: TwitchChannel[]
    splits: ChatSplit[]
    sidebarOrder: string[]
  }
): SidebarFocusTarget {
  const orderBefore = normalizeSidebarOrder(config)
  const orderAfter = nextState.sidebarOrder
  const removedKey = channelOrderKey(removedLogin)

  if (!wasRemovedChannelInView(config, removedLogin)) {
    const currentActive = getActiveChannelLogin(config)
    const currentSplitId = config.layout.activeSplitId

    if (currentSplitId) {
      const split = nextState.splits.find(
        (entry) => entry.id === currentSplitId
      )
      if (split && split.channels.length >= 2) {
        const splitChannels = normalizeSplitChannels(split.channels)
        const nextActive = splitChannels.includes(currentActive)
          ? currentActive
          : splitChannels[0]

        return {
          activeChannelLogin: nextActive,
          activeSplitId: currentSplitId,
        }
      }
    } else if (
      currentActive &&
      currentActive !== removedLogin &&
      nextState.channels.some((channel) => channel.login === currentActive)
    ) {
      return {
        activeChannelLogin: currentActive,
        activeSplitId: null,
      }
    }

    return firstAvailableSidebarFocus(
      orderAfter,
      nextState.splits,
      nextState.channels
    )
  }

  const targetKey = resolveSidebarNavigationTarget(
    orderBefore,
    orderAfter,
    removedKey
  )

  if (!targetKey) {
    return { activeChannelLogin: "", activeSplitId: null }
  }

  return (
    focusTargetFromSidebarKey(
      targetKey,
      nextState.splits,
      nextState.channels
    ) ??
    firstAvailableSidebarFocus(orderAfter, nextState.splits, nextState.channels)
  )
}
