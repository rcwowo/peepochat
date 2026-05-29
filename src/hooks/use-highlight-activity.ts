import * as React from "react"

import {
  addChannelMessageHighlight,
  clearChannelMessageHighlights,
} from "@/lib/channel-message-highlights"
import {
  compilePingRules,
  matchPingRules,
  type CompiledPingRule,
} from "@/lib/highlight-rules"
import {
  canShowDesktopNotifications,
  showDesktopNotification,
} from "@/lib/desktop-notifications"
import type { AppConfig } from "@/lib/peepochat-config"
import {
  isUnreadIndicatorEnabledForChannel,
  isUnreadIndicatorEnabledForSplit,
} from "@/lib/peepochat-config"
import { normalizeChannelLogin } from "@/lib/twitch-channel"
import type { TwitchChatMessage } from "@/lib/twitch-chat"

const PING_RULES_KEY_SEPARATOR = "\u0001"

function buildPingRulesKey(pings: AppConfig["highlights"]["pings"]) {
  return pings
    .map(
      (rule) =>
        `${rule.id}${PING_RULES_KEY_SEPARATOR}${rule.pattern}${PING_RULES_KEY_SEPARATOR}${rule.enabled}${PING_RULES_KEY_SEPARATOR}${rule.notify}`
    )
    .join("\u0000")
}

function buildUnreadEnabledByLogin(config: AppConfig): Map<string, boolean> {
  const globalEnabled = config.highlights.unreadIndicatorsEnabled
  const map = new Map<string, boolean>()
  for (const channel of config.twitch.channels) {
    const override = channel.unreadIndicatorEnabled
    map.set(
      channel.login,
      override !== null && override !== undefined ? override : globalEnabled
    )
  }
  return map
}

export { useChannelHighlightedMessageIds } from "@/lib/channel-message-highlights"

export function useHighlightActivity({
  config,
  accountLogin,
  visibleChannelLogins,
  isSplitView,
  activeSplitId,
  splits,
  onFocusChannel,
}: {
  config: AppConfig
  accountLogin: string | null
  visibleChannelLogins: string[]
  isSplitView: boolean
  activeSplitId: string | null
  splits: AppConfig["layout"]["splits"]
  onFocusChannel?: (login: string) => void
}) {
  const [unreadLogins, setUnreadLogins] = React.useState<ReadonlySet<string>>(
    () => new Set()
  )
  const [pingUnreadLogins, setPingUnreadLogins] = React.useState<
    ReadonlySet<string>
  >(() => new Set())

  const visibleRef = React.useRef<ReadonlySet<string>>(new Set())
  React.useEffect(() => {
    visibleRef.current = new Set(
      visibleChannelLogins.map((login) => normalizeChannelLogin(login))
    )
  }, [visibleChannelLogins.join("\0")])

  const compiledPingsRef = React.useRef<CompiledPingRule[]>([])
  const pingRulesKey = buildPingRulesKey(config.highlights.pings)
  React.useEffect(() => {
    compiledPingsRef.current = compilePingRules(config.highlights.pings)
  }, [pingRulesKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const unreadEnabledByLoginRef = React.useRef<Map<string, boolean>>(new Map())
  React.useEffect(() => {
    unreadEnabledByLoginRef.current = buildUnreadEnabledByLogin(config)
  }, [
    config.highlights.unreadIndicatorsEnabled,
    config.twitch.channels,
  ])

  const accountLoginRef = React.useRef(accountLogin)
  accountLoginRef.current = accountLogin

  const pingPushEnabledRef = React.useRef(
    config.highlights.pingPushNotificationsEnabled
  )
  pingPushEnabledRef.current = config.highlights.pingPushNotificationsEnabled

  const onFocusChannelRef = React.useRef(onFocusChannel)
  onFocusChannelRef.current = onFocusChannel

  const configRef = React.useRef(config)
  configRef.current = config

  const clearUnreadForLogins = React.useCallback((logins: string[]) => {
    if (logins.length === 0) return

    const normalizedLogins = logins.map((login) => normalizeChannelLogin(login))

    setUnreadLogins((current) => {
      const next = new Set(current)
      let changed = false
      for (const login of normalizedLogins) {
        if (next.delete(login)) {
          changed = true
        }
      }
      return changed ? next : current
    })

    setPingUnreadLogins((current) => {
      const next = new Set(current)
      let changed = false
      for (const login of normalizedLogins) {
        if (next.delete(login)) {
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [])

  const markChannelRead = React.useCallback(
    (login: string) => {
      const normalized = normalizeChannelLogin(login)
      clearUnreadForLogins([normalized])
      clearChannelMessageHighlights(normalized)
    },
    [clearUnreadForLogins]
  )

  const markSplitRead = React.useCallback(
    (splitId: string) => {
      const split = splits.find((entry) => entry.id === splitId)
      if (!split) return
      clearUnreadForLogins(split.channels)
      for (const channelLogin of split.channels) {
        clearChannelMessageHighlights(channelLogin)
      }
    },
    [clearUnreadForLogins, splits]
  )

  React.useEffect(() => {
    clearUnreadForLogins(visibleChannelLogins)
    for (const login of visibleChannelLogins) {
      clearChannelMessageHighlights(login)
    }
  }, [clearUnreadForLogins, visibleChannelLogins.join("\0")])

  const processIncomingMessages = React.useCallback(
    (messages: TwitchChatMessage[]) => {
      if (messages.length === 0) return

      const visible = visibleRef.current
      const compiled = compiledPingsRef.current
      const hasPingRules = compiled.length > 0
      const account = accountLoginRef.current
      const accountLower = account?.toLowerCase() ?? null
      const unreadEnabledByLogin = unreadEnabledByLoginRef.current

      const unreadAdds = new Set<string>()
      const pingUnreadAdds = new Set<string>()

      for (const message of messages) {
        const login = normalizeChannelLogin(message.channel)

        const unreadEnabled =
          unreadEnabledByLogin.get(login) ??
          configRef.current.highlights.unreadIndicatorsEnabled
        if (!visible.has(login) && unreadEnabled) {
          unreadAdds.add(login)
        }

        if (
          accountLower &&
          message.userName.toLowerCase() === accountLower
        ) {
          continue
        }

        if (!hasPingRules) {
          continue
        }

        const pingMatch = matchPingRules(compiled, message)
        if (!pingMatch) {
          continue
        }

        if (!visible.has(login)) {
          pingUnreadAdds.add(login)
        }

        addChannelMessageHighlight(login, message.id)

        const shouldNotify =
          pingPushEnabledRef.current &&
          pingMatch.notify &&
          document.visibilityState === "hidden" &&
          canShowDesktopNotifications()

        if (shouldNotify) {
          showDesktopNotification({
            title: `#${login}`,
            body: `${message.displayName}: ${message.text}`,
            tag: `ping:${login}:${message.id}`,
            onClick: () => onFocusChannelRef.current?.(login),
          })
        }
      }

      if (unreadAdds.size > 0) {
        setUnreadLogins((current) => {
          let changed = false
          const next = new Set(current)
          for (const login of unreadAdds) {
            if (!next.has(login)) {
              next.add(login)
              changed = true
            }
          }
          return changed ? next : current
        })
      }

      if (pingUnreadAdds.size > 0) {
        setPingUnreadLogins((current) => {
          let changed = false
          const next = new Set(current)
          for (const login of pingUnreadAdds) {
            if (!next.has(login)) {
              next.add(login)
              changed = true
            }
          }
          return changed ? next : current
        })
      }
    },
    []
  )

  const handleIncomingMessage = React.useCallback(
    (message: TwitchChatMessage) => {
      processIncomingMessages([message])
    },
    [processIncomingMessages]
  )

  const handleIncomingMessages = React.useCallback(
    (messages: TwitchChatMessage[]) => {
      processIncomingMessages(messages)
    },
    [processIncomingMessages]
  )

  const hasUnreadForChannel = React.useCallback(
    (login: string) => {
      if (!isUnreadIndicatorEnabledForChannel(configRef.current, login)) {
        return false
      }
      return unreadLogins.has(normalizeChannelLogin(login))
    },
    [unreadLogins]
  )

  const hasPingForChannel = React.useCallback(
    (login: string) => {
      return pingUnreadLogins.has(normalizeChannelLogin(login))
    },
    [pingUnreadLogins]
  )

  const hasPingForSplit = React.useCallback(
    (splitId: string, channelLoginsInSplit: string[]) => {
      if (isSplitView && activeSplitId === splitId) {
        return false
      }
      return channelLoginsInSplit.some((login) =>
        pingUnreadLogins.has(normalizeChannelLogin(login))
      )
    },
    [activeSplitId, isSplitView, pingUnreadLogins]
  )

  const hasUnreadForSplit = React.useCallback(
    (splitId: string, channelLoginsInSplit: string[]) => {
      if (!isUnreadIndicatorEnabledForSplit(configRef.current, splitId)) {
        return false
      }
      if (isSplitView && activeSplitId === splitId) {
        return false
      }
      return channelLoginsInSplit.some((login) =>
        unreadLogins.has(normalizeChannelLogin(login))
      )
    },
    [activeSplitId, isSplitView, unreadLogins]
  )

  return {
    unreadLogins,
    pingUnreadLogins,
    hasUnreadForChannel,
    hasUnreadForSplit,
    hasPingForChannel,
    hasPingForSplit,
    markChannelRead,
    markSplitRead,
    handleIncomingMessage,
    handleIncomingMessages,
  }
}
