import * as React from "react"
import { toast } from "sonner"

import type { AppConfig, TwitchChannel } from "@/lib/chatvoice-config"
import {
  getAccount,
  getActiveChannelLogin,
  normalizeSplitChannels,
} from "@/lib/chatvoice-config"
import {
  appendChannelToSidebarOrder,
  applySidebarOrder,
  channelOrderKey,
  normalizeSidebarOrder,
  removeKeysFromSidebarOrder,
  splitOrderKey,
} from "@/lib/sidebar-order"
import { fetchTwitchUsersByLogin } from "@/lib/twitch-api"

function pruneSplitsAfterChannelRemoval(
  splits: AppConfig["layout"]["splits"],
  removedLogin: string,
  activeSplitId: string | null
) {
  const nextSplits = splits
    .map((split) => ({
      ...split,
      channels: normalizeSplitChannels(
        split.channels.filter((channel) => channel !== removedLogin)
      ),
    }))
    .filter((split) => split.channels.length >= 2)

  let nextActiveSplitId = activeSplitId
  if (
    nextActiveSplitId &&
    !nextSplits.some((split) => split.id === nextActiveSplitId)
  ) {
    nextActiveSplitId = null
  }

  return { splits: nextSplits, activeSplitId: nextActiveSplitId }
}

export function useTwitchChannels({
  config,
  updateConfig,
  onActiveChannelChange,
}: {
  config: AppConfig
  updateConfig: (updater: AppConfig | ((current: AppConfig) => AppConfig)) => void
  onActiveChannelChange?: (login: string) => void
}) {
  const activeChannelLogin = getActiveChannelLogin(config)

  const setActiveChannel = React.useCallback(
    (login: string) => {
      const normalized = login.trim().replace(/^#/, "").toLowerCase()
      if (!normalized) {
        return
      }

      updateConfig((current) => {
        const hasChannel = current.twitch.channels.some(
          (channel) => channel.login === normalized
        )

        return {
          ...current,
          twitch: {
            ...current.twitch,
            activeChannelLogin: normalized,
            channels: hasChannel
              ? current.twitch.channels
              : [...current.twitch.channels, { login: normalized }],
          },
        }
      })

      onActiveChannelChange?.(normalized)
    },
    [onActiveChannelChange, updateConfig]
  )

  const addChannel = React.useCallback(
    async (login: string) => {
      const normalized = login.trim().replace(/^#/, "").toLowerCase()
      if (!normalized) {
        throw new Error("Enter a channel name.")
      }

      const account = getAccount(config)
      let profile: TwitchChannel = { login: normalized }

      if (account?.accessToken) {
        try {
          const [user] = await fetchTwitchUsersByLogin(
            [normalized],
            account.accessToken,
            account.clientId
          )
          if (user) {
            profile = {
              login: user.login,
              displayName: user.displayName,
              profileImageUrl: user.profileImageUrl,
            }
          }
        } catch {
          toast.message("Channel added without profile details.")
        }
      }

      updateConfig((current) => {
        const exists = current.twitch.channels.some(
          (channel) => channel.login === normalized
        )

        const nextChannels = exists
          ? current.twitch.channels.map((channel) =>
              channel.login === normalized ? { ...channel, ...profile } : channel
            )
          : [...current.twitch.channels, profile]

        const order = appendChannelToSidebarOrder(
          normalizeSidebarOrder(current),
          normalized
        )
        const applied = applySidebarOrder(
          {
            ...current,
            twitch: { ...current.twitch, channels: nextChannels, activeChannelLogin: normalized },
            layout: current.layout,
          },
          order
        )

        return {
          ...current,
          twitch: {
            ...current.twitch,
            channels: applied.channels,
            activeChannelLogin: normalized,
          },
          layout: applied.layout,
        }
      })

      onActiveChannelChange?.(normalized)
      return normalized
    },
    [config, onActiveChannelChange, updateConfig]
  )

  const removeChannel = React.useCallback(
    (login: string) => {
      const normalized = login.trim().replace(/^#/, "").toLowerCase()

      updateConfig((current) => {
        const channels = current.twitch.channels.filter(
          (channel) => channel.login !== normalized
        )
        const nextActive =
          current.twitch.activeChannelLogin === normalized
            ? (channels[0]?.login ?? "")
            : current.twitch.activeChannelLogin

        const { splits, activeSplitId } = pruneSplitsAfterChannelRemoval(
          current.layout.splits,
          normalized,
          current.layout.activeSplitId
        )

        const removedKeys = [channelOrderKey(normalized)]
        const splitKeys = current.layout.splits
          .filter((split) => !splits.some((entry) => entry.id === split.id))
          .map((split) => splitOrderKey(split.id))

        const order = removeKeysFromSidebarOrder(
          normalizeSidebarOrder(current),
          [...removedKeys, ...splitKeys]
        )
        const applied = applySidebarOrder(
          {
            ...current,
            twitch: {
              ...current.twitch,
              channels,
              activeChannelLogin: nextActive,
            },
            layout: { ...current.layout, activeSplitId, splits },
          },
          order
        )

        return {
          ...current,
          twitch: {
            ...current.twitch,
            channels: applied.channels,
            activeChannelLogin: nextActive,
          },
          layout: applied.layout,
        }
      })

      if (activeChannelLogin === normalized) {
        const next = config.twitch.channels.find(
          (channel) => channel.login !== normalized
        )
        if (next) {
          onActiveChannelChange?.(next.login)
        }
      }
    },
    [
      activeChannelLogin,
      config.twitch.channels,
      onActiveChannelChange,
      updateConfig,
    ]
  )

  return {
    channels: config.twitch.channels,
    activeChannelLogin,
    setActiveChannel,
    addChannel,
    removeChannel,
  }
}
