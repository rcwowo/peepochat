import * as React from "react"

import type { AppConfig, ChatSplit } from "@/lib/peepochat-config"
import {
  createSplitId,
  findSplitByChannels,
  getActiveChannelLogin,
  getActiveSplitChannels,
  getChannelsUsedInSplits,
  getChatLayout,
  isSplitViewActive,
  normalizeSplitChannels,
} from "@/lib/peepochat-config"
import {
  applySidebarOrder,
  normalizeSidebarOrder,
  removeKeysFromSidebarOrder,
  reorderSidebarItemIds,
  replaceChannelsWithSplitInOrder,
  channelOrderKey,
  splitOrderKey,
} from "@/lib/sidebar-order"

function pruneSplits(splits: ChatSplit[]): ChatSplit[] {
  return splits
    .map((split) => ({
      ...split,
      channels: normalizeSplitChannels(split.channels),
    }))
    .filter((split) => split.channels.length >= 2)
}

function commitLayout(
  config: AppConfig,
  layout: Pick<AppConfig["layout"], "activeSplitId" | "splits">,
  order?: string[]
) {
  const draft: AppConfig = {
    ...config,
    layout: {
      ...config.layout,
      ...layout,
      sidebarOrder: order ?? config.layout.sidebarOrder ?? [],
    },
  }

  const applied = applySidebarOrder(draft, normalizeSidebarOrder(draft))

  return {
    ...config,
    twitch: { ...config.twitch, channels: applied.channels },
    layout: applied.layout,
  }
}

export function useChatLayout({
  config,
  updateConfig,
}: {
  config: AppConfig
  updateConfig: (updater: AppConfig | ((current: AppConfig) => AppConfig)) => void
}) {
  const layout = getChatLayout(config)
  const activeChannelLogin = getActiveChannelLogin(config)

  const savedSplits = layout.splits
  const activeSplitId = layout.activeSplitId
  const sidebarOrder = React.useMemo(
    () => normalizeSidebarOrder(config),
    [config]
  )
  const splitChannels = getActiveSplitChannels(config)
  const isSplitView = isSplitViewActive(config)
  const channelsInSplits = React.useMemo(
    () => getChannelsUsedInSplits(savedSplits),
    [savedSplits]
  )

  const navigateToChannel = React.useCallback(
    (login: string) => {
      const normalized = login.trim().replace(/^#/, "").toLowerCase()
      if (!normalized) return

      updateConfig((current) => ({
        ...current,
        twitch: { ...current.twitch, activeChannelLogin: normalized },
        layout: { ...current.layout, activeSplitId: null },
      }))
    },
    [updateConfig]
  )

  const selectSplit = React.useCallback(
    (splitId: string) => {
      updateConfig((current) => {
        const split = current.layout.splits.find((entry) => entry.id === splitId)
        if (!split || split.channels.length < 2) {
          return current
        }

        return {
          ...current,
          twitch: {
            ...current.twitch,
            activeChannelLogin: split.channels[0],
          },
          layout: { ...current.layout, activeSplitId: splitId },
        }
      })
    },
    [updateConfig]
  )

  const openSplitView = React.useCallback(
    (channels: string[]) => {
      const normalized = normalizeSplitChannels(channels)
      if (normalized.length < 2) return

      updateConfig((current) => {
        const existing = findSplitByChannels(current.layout.splits, normalized)
        const splitId = existing?.id ?? createSplitId()
        const splits = existing
          ? current.layout.splits
          : [
              ...current.layout.splits,
              { id: splitId, channels: normalized },
            ]

        const pruned = pruneSplits(splits)
        const order = existing
          ? normalizeSidebarOrder({ ...current, layout: { ...current.layout, splits: pruned } })
          : replaceChannelsWithSplitInOrder(
              normalizeSidebarOrder(current),
              splitId,
              normalized
            )

        return commitLayout(
          {
            ...current,
            twitch: {
              ...current.twitch,
              activeChannelLogin: normalized[0],
            },
          },
          { activeSplitId: splitId, splits: pruned },
          order
        )
      })
    },
    [updateConfig]
  )

  const addSplitChannel = React.useCallback(
    (login: string) => {
      const normalized = login.trim().replace(/^#/, "").toLowerCase()
      if (!normalized) return

      updateConfig((current) => {
        const activeId = current.layout.activeSplitId
        const activeSplit = activeId
          ? current.layout.splits.find((split) => split.id === activeId)
          : null

        if (activeSplit) {
          if (activeSplit.channels.includes(normalized)) {
            return current
          }

          const nextChannels = normalizeSplitChannels([
            ...activeSplit.channels,
            normalized,
          ])

          const pruned = pruneSplits(
            current.layout.splits.map((split) =>
              split.id === activeId
                ? { ...split, channels: nextChannels }
                : split
            )
          )

          return commitLayout(
            current,
            { activeSplitId: activeId, splits: pruned }
          )
        }

        const base = getActiveChannelLogin(current)
        if (!base || base === normalized) {
          return current
        }

        const nextChannels = normalizeSplitChannels([base, normalized])
        const existing = findSplitByChannels(current.layout.splits, nextChannels)
        const splitId = existing?.id ?? createSplitId()
        const splits = existing
          ? current.layout.splits
          : [
              ...current.layout.splits,
              { id: splitId, channels: nextChannels },
            ]
        const pruned = pruneSplits(splits)
        const order = existing
          ? normalizeSidebarOrder({ ...current, layout: { ...current.layout, splits: pruned } })
          : replaceChannelsWithSplitInOrder(
              normalizeSidebarOrder(current),
              splitId,
              nextChannels
            )

        return commitLayout(
          current,
          { activeSplitId: splitId, splits: pruned },
          order
        )
      })
    },
    [updateConfig]
  )

  const removeSplitChannel = React.useCallback(
    (login: string) => {
      const normalized = login.trim().replace(/^#/, "").toLowerCase()

      updateConfig((current) => {
        const activeId = current.layout.activeSplitId
        if (!activeId) {
          return current
        }

        const activeSplit = current.layout.splits.find(
          (split) => split.id === activeId
        )
        if (!activeSplit) {
          return {
            ...current,
            layout: { ...current.layout, activeSplitId: null },
          }
        }

        const nextChannels = normalizeSplitChannels(
          activeSplit.channels.filter((channel) => channel !== normalized)
        )

        if (nextChannels.length >= 2) {
          const currentOrder = normalizeSidebarOrder(current)
          const splitKey = splitOrderKey(activeId)
          const removedKey = channelOrderKey(normalized)
          const splitIndex = currentOrder.indexOf(splitKey)

          const order = currentOrder.filter((key) => key !== removedKey)
          if (splitIndex >= 0) {
            const nextSplitIndex = order.indexOf(splitKey)
            if (nextSplitIndex >= 0) {
              order.splice(nextSplitIndex + 1, 0, removedKey)
            } else {
              order.push(removedKey)
            }
          } else {
            order.push(removedKey)
          }

          return commitLayout(
            current,
            {
              activeSplitId: activeId,
              splits: current.layout.splits.map((split) =>
                split.id === activeId
                  ? { ...split, channels: nextChannels }
                  : split
              ),
            },
            order
          )
        }

        const remaining = nextChannels[0] ?? getActiveChannelLogin(current)
        const splits = current.layout.splits.filter((split) => split.id !== activeId)
        const currentOrder = normalizeSidebarOrder(current)
        const splitKey = splitOrderKey(activeId)
        const splitIndex = currentOrder.indexOf(splitKey)

        const removedKey = channelOrderKey(normalized)
        const remainingKey = remaining ? channelOrderKey(remaining) : null

        const order = removeKeysFromSidebarOrder(currentOrder, [
          splitKey,
          removedKey,
          ...(remainingKey ? [remainingKey] : []),
        ])

        const insertAt =
          splitIndex >= 0 ? Math.min(splitIndex, order.length) : order.length

        if (remainingKey) {
          order.splice(insertAt, 0, remainingKey)
          order.splice(insertAt + 1, 0, removedKey)
        } else {
          order.splice(insertAt, 0, removedKey)
        }

        return commitLayout(
          {
            ...current,
            twitch: {
              ...current.twitch,
              activeChannelLogin:
                remaining || current.twitch.activeChannelLogin,
            },
          },
          { activeSplitId: null, splits },
          order
        )
      })
    },
    [updateConfig]
  )

  const unsplit = React.useCallback(
    (splitId: string) => {
      updateConfig((current) => {
        const split = current.layout.splits.find((s) => s.id === splitId)
        if (!split) return current

        const splitKey = splitOrderKey(splitId)
        const splitIndex = normalizeSidebarOrder(current).indexOf(splitKey)
        const channels = normalizeSplitChannels(split.channels)
        const channelKeys = channels.map(channelOrderKey)

        const nextSplits = current.layout.splits.filter((s) => s.id !== splitId)
        const nextActiveSplitId =
          current.layout.activeSplitId === splitId ? null : current.layout.activeSplitId

        const base = removeKeysFromSidebarOrder(normalizeSidebarOrder(current), [
          splitKey,
          ...channelKeys,
        ])
        const insertAt = splitIndex >= 0 ? Math.min(splitIndex, base.length) : base.length
        base.splice(insertAt, 0, ...channelKeys.filter((k) => !base.includes(k)))

        const nextConfig: AppConfig = {
          ...current,
          twitch:
            current.layout.activeSplitId === splitId && channels[0]
              ? { ...current.twitch, activeChannelLogin: channels[0] }
              : current.twitch,
        }

        return commitLayout(nextConfig, { activeSplitId: nextActiveSplitId, splits: nextSplits }, base)
      })
    },
    [updateConfig]
  )

  const reorderSidebar = React.useCallback(
    (activeId: string, overId: string) => {
      updateConfig((current) => {
        const order = reorderSidebarItemIds(
          normalizeSidebarOrder(current),
          activeId,
          overId
        )
        return commitLayout(current, current.layout, order)
      })
    },
    [updateConfig]
  )

  const visibleChannelLogins = React.useMemo(() => {
    if (isSplitView) {
      return splitChannels
    }

    return activeChannelLogin ? [activeChannelLogin] : []
  }, [activeChannelLogin, isSplitView, splitChannels])

  return {
    savedSplits,
    activeSplitId,
    sidebarOrder,
    splitChannels,
    isSplitView,
    channelsInSplits,
    visibleChannelLogins,
    navigateToChannel,
    selectSplit,
    openSplitView,
    addSplitChannel,
    removeSplitChannel,
    unsplit,
    reorderSidebar,
  }
}
