import * as React from "react"

import type { AppConfig, ChatSplit } from "@/lib/chatvoice-config"
import {
  createSplitId,
  findSplitByChannels,
  getActiveChannelLogin,
  getActiveSplitChannels,
  getChannelsUsedInSplits,
  getChatLayout,
  isSplitViewActive,
  normalizeSplitChannels,
} from "@/lib/chatvoice-config"
import {
  appendChannelToSidebarOrder,
  applySidebarOrder,
  normalizeSidebarOrder,
  removeKeysFromSidebarOrder,
  reorderSidebarItemIds,
  replaceChannelsWithSplitInOrder,
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
          return commitLayout(
            current,
            {
              activeSplitId: activeId,
              splits: current.layout.splits.map((split) =>
                split.id === activeId
                  ? { ...split, channels: nextChannels }
                  : split
              ),
            }
          )
        }

        const remaining = nextChannels[0] ?? getActiveChannelLogin(current)
        const splits = current.layout.splits.filter((split) => split.id !== activeId)
        let order = removeKeysFromSidebarOrder(normalizeSidebarOrder(current), [
          splitOrderKey(activeId),
        ])
        order = appendChannelToSidebarOrder(order, normalized)

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
    reorderSidebar,
  }
}
