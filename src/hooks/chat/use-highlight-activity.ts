import * as React from "react"

import { useLazyRef } from "@/hooks/use-lazy-ref"
import { addChannelMessageHighlight } from "@/lib/highlights/channel-message-highlights"
import {
  addPingNotification,
  markPingNotificationsReadForChannels,
} from "@/lib/highlights/notification-center"
import {
  compilePingRules,
  findPingMatchRange,
  getPingMatchPattern,
  getUsernameMentionRuleId,
  matchPingRules,
  messageMentionsUsername,
  type CompiledPingRule,
} from "@/lib/highlights/highlight-rules"
import { playAlertSound } from "@/lib/highlights/alert-sounds"
import {
  canShowDesktopNotifications,
  showDesktopNotification,
} from "@/lib/highlights/desktop-notifications"
import type { AppConfig } from "@/lib/peepochat/peepochat-config"
import {
  isUnreadIndicatorEnabledForChannel,
  isUnreadIndicatorEnabledForSplit,
} from "@/lib/peepochat/peepochat-config"
import { normalizeChannelLogin } from "@/lib/twitch/twitch-channel"
import type { TwitchChatMessage } from "@/lib/twitch/twitch-chat"

function buildUnreadEnabledByLogin(
  config: AppConfig,
  channels: AppConfig["twitch"]["channels"]
): Map<string, boolean> {
  const globalEnabled = config.highlights.unreadIndicatorsEnabled
  const map = new Map<string, boolean>()
  for (const channel of channels) {
    const override = channel.unreadIndicatorEnabled
    map.set(
      channel.login,
      override !== null && override !== undefined ? override : globalEnabled
    )
  }
  return map
}

export { useChannelMessageHighlights } from "@/lib/highlights/channel-message-highlights"

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
  const normalizedVisibleChannelLogins = React.useMemo(
    () => visibleChannelLogins.map((login) => normalizeChannelLogin(login)),
    [visibleChannelLogins]
  )

  const visibleLoginSet = React.useMemo(
    () => new Set(normalizedVisibleChannelLogins),
    [normalizedVisibleChannelLogins]
  )

  const visibleRef = useLazyRef(() => new Set<string>())
  React.useEffect(() => {
    visibleRef.current = visibleLoginSet
  }, [visibleLoginSet, visibleRef])

  const compiledPingsRef = React.useRef<CompiledPingRule[]>([])
  React.useEffect(() => {
    compiledPingsRef.current = compilePingRules(config.highlights.pings)
  }, [config.highlights.pings])

  const pingOnUsernameMentionRef = React.useRef(
    config.highlights.pingOnUsernameMention
  )
  const highlightPingedMessagesRef = React.useRef(
    config.highlights.highlightPingedMessages
  )
  const useDefaultSoundsRef = React.useRef(config.highlights.useDefaultSounds)
  const pingSoundCustomIdRef = React.useRef(config.highlights.pingSoundCustomId)

  const unreadEnabledByLoginRef = useLazyRef(() => new Map<string, boolean>())

  React.useEffect(() => {
    unreadEnabledByLoginRef.current = buildUnreadEnabledByLogin(
      config,
      config.twitch.channels
    )
  }, [config, config.twitch.channels, unreadEnabledByLoginRef])

  const accountLoginRef = React.useRef(accountLogin)

  const pingPushEnabledRef = React.useRef(
    config.highlights.pingPushNotificationsEnabled
  )
  const doNotDisturbEnabledRef = React.useRef(
    config.highlights.doNotDisturbEnabled
  )

  const onFocusChannelRef = React.useRef(onFocusChannel)

  const configRef = React.useRef(config)

  React.useEffect(() => {
    accountLoginRef.current = accountLogin
  }, [accountLogin])

  React.useEffect(() => {
    pingPushEnabledRef.current = config.highlights.pingPushNotificationsEnabled
  }, [config.highlights.pingPushNotificationsEnabled])

  React.useEffect(() => {
    doNotDisturbEnabledRef.current = config.highlights.doNotDisturbEnabled
  }, [config.highlights.doNotDisturbEnabled])

  React.useEffect(() => {
    pingOnUsernameMentionRef.current = config.highlights.pingOnUsernameMention
  }, [config.highlights.pingOnUsernameMention])

  React.useEffect(() => {
    highlightPingedMessagesRef.current =
      config.highlights.highlightPingedMessages
  }, [config.highlights.highlightPingedMessages])

  React.useEffect(() => {
    useDefaultSoundsRef.current = config.highlights.useDefaultSounds
  }, [config.highlights.useDefaultSounds])

  React.useEffect(() => {
    pingSoundCustomIdRef.current = config.highlights.pingSoundCustomId
  }, [config.highlights.pingSoundCustomId])

  React.useEffect(() => {
    onFocusChannelRef.current = onFocusChannel
  }, [onFocusChannel])

  React.useEffect(() => {
    configRef.current = config
  }, [config])

  React.useEffect(() => {
    markPingNotificationsReadForChannels(normalizedVisibleChannelLogins)
  }, [normalizedVisibleChannelLogins])

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
      markPingNotificationsReadForChannels([normalized])
    },
    [clearUnreadForLogins]
  )

  const markSplitRead = React.useCallback(
    (splitId: string) => {
      const split = splits.find((entry) => entry.id === splitId)
      if (!split) return
      clearUnreadForLogins(split.channels)
      markPingNotificationsReadForChannels(split.channels)
    },
    [clearUnreadForLogins, splits]
  )

  const processIncomingMessages = React.useCallback(
    (messages: TwitchChatMessage[]) => {
      if (messages.length === 0) return

      const visible = visibleRef.current
      const compiled = compiledPingsRef.current
      const hasPingRules =
        compiled.length > 0 || pingOnUsernameMentionRef.current
      const account = accountLoginRef.current
      const accountLower = account?.toLowerCase() ?? null
      const unreadEnabledByLogin = unreadEnabledByLoginRef.current

      const unreadAdds = new Set<string>()
      const pingUnreadAdds = new Set<string>()

      for (const message of messages) {
        const login = normalizeChannelLogin(message.channel)
        const isVisible = visible.has(login)

        const unreadEnabled =
          unreadEnabledByLogin.get(login) ??
          configRef.current.highlights.unreadIndicatorsEnabled
        if (!isVisible && unreadEnabled) {
          unreadAdds.add(login)
        }

        if (accountLower && message.userName.toLowerCase() === accountLower) {
          continue
        }

        if (!hasPingRules) {
          continue
        }

        let pingMatch = matchPingRules(compiled, message)
        if (
          !pingMatch &&
          pingOnUsernameMentionRef.current &&
          account &&
          messageMentionsUsername(message, account)
        ) {
          pingMatch = {
            ruleId: getUsernameMentionRuleId(),
            notify: true,
          }
        }

        if (!pingMatch) {
          continue
        }

        if (!isVisible) {
          pingUnreadAdds.add(login)
        }

        const matchPattern = getPingMatchPattern(
          pingMatch.ruleId,
          pingMatch.pattern,
          account
        )

        if (highlightPingedMessagesRef.current) {
          addChannelMessageHighlight(login, {
            messageId: message.id,
            ruleId: pingMatch.ruleId,
            matchPattern,
            matchRange: findPingMatchRange(
              message.text,
              pingMatch.ruleId,
              matchPattern
            ),
          })
        }

        addPingNotification({
          channelLogin: login,
          messageId: message.id,
          userName: message.userName,
          displayName: message.displayName,
          text: message.text,
          receivedAt: message.receivedAt,
          ruleId: pingMatch.ruleId,
          matchPattern,
          readAt: isVisible ? new Date().toISOString() : null,
        })

        const doNotDisturb = doNotDisturbEnabledRef.current
        const shouldNotify =
          !doNotDisturb &&
          pingPushEnabledRef.current &&
          pingMatch.notify &&
          document.visibilityState === "hidden" &&
          canShowDesktopNotifications()

        if (shouldNotify) {
          const channel = configRef.current.twitch.channels.find(
            (entry) => normalizeChannelLogin(entry.login) === login
          )
          const channelLabel = channel?.displayName || channel?.login || login

          showDesktopNotification({
            title: `${message.displayName} pinged you in #${channelLabel}`,
            body: message.text,
            tag: `ping:${login}:${message.id}`,
            onClick: () => onFocusChannelRef.current?.(login),
          })
        }

        if (!doNotDisturb) {
          void playAlertSound({
            useDefaultSounds: useDefaultSoundsRef.current,
            customId: pingSoundCustomIdRef.current,
            kind: "ping",
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
    [
      visibleRef,
      unreadEnabledByLoginRef,
      accountLoginRef,
      compiledPingsRef,
      pingOnUsernameMentionRef,
      highlightPingedMessagesRef,
      doNotDisturbEnabledRef,
      pingPushEnabledRef,
      useDefaultSoundsRef,
      pingSoundCustomIdRef,
      onFocusChannelRef,
      configRef,
    ]
  )

  const handleIncomingMessage = React.useCallback(
    (message: TwitchChatMessage) => {
      processIncomingMessages([message])
    },
    [processIncomingMessages]
  )

  const hasUnreadForChannel = React.useCallback(
    (login: string) => {
      if (!isUnreadIndicatorEnabledForChannel(configRef.current, login)) {
        return false
      }
      const normalized = normalizeChannelLogin(login)
      if (visibleLoginSet.has(normalized)) {
        return false
      }
      return unreadLogins.has(normalized)
    },
    [unreadLogins, visibleLoginSet]
  )

  const hasPingForChannel = React.useCallback(
    (login: string) => {
      const normalized = normalizeChannelLogin(login)
      if (visibleLoginSet.has(normalized)) {
        return false
      }
      return pingUnreadLogins.has(normalized)
    },
    [pingUnreadLogins, visibleLoginSet]
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
  }
}
