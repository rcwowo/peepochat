import * as React from "react"
import { toast } from "sonner"

import { useChatLayout } from "@/hooks/chat-ui/use-chat-layout"
import { usePeepochatConfig } from "@/hooks/peepochat/use-peepochat-config"
import { useBlockedUsers } from "@/hooks/twitch/use-blocked-users"
import { useTwitchAuth } from "@/hooks/twitch/use-twitch-auth"
import { useTwitchChannels } from "@/hooks/twitch/use-twitch-channels"
import { useChatBadges } from "@/hooks/chat-ui/use-chat-badges"
import { useRcwBadges } from "@/hooks/chat-ui/use-rcw-badges"
import { useHighlightActivity } from "@/hooks/chat-ui/use-highlight-activity"
import { useStreamLiveStatus } from "@/hooks/twitch/player/use-stream-live-status"
import {
  useTwitchChat,
  isSyncChannelsSupersededError,
} from "@/hooks/twitch/use-twitch-chat"
import {
  canShowDesktopNotifications,
  shouldShowDesktopNotification,
  showDesktopNotification,
} from "@/lib/highlights/desktop-notifications"
import { playAlertSound } from "@/lib/highlights/alert-sounds"
import {
  addLiveNotification,
  formatLiveNotificationText,
} from "@/lib/highlights/notification-center"
import { createNicknameMentionMap } from "@/lib/chat/nicknames"
import { normalizeChannelLogin } from "@/lib/twitch/channel/channel"
import { EMPTY_WATCH_STATE, watchReducer } from "@/lib/player/watch-state"
import type { SplitLayoutEdge } from "@/lib/chat/layout/split-layout"
import {
  findSplitContainingChannel,
  isLiveNotificationsEnabledForChannel,
} from "@/lib/peepochat/peepochat-config"
import {
  setSeventvEmoteRenderOptions,
  setThirdPartyEmoteFetchOptions,
} from "@/lib/chat/emotes/emotes"
import {
  PeepochatChatContext,
  PeepochatConfigContext,
  PeepochatLayoutContext,
  PeepochatPlayerContext,
  PeepochatSidebarHighlightsContext,
  type PeepochatChatContextValue,
  type PeepochatConfigContextValue,
  type PeepochatLayoutContextValue,
  type PeepochatPlayerContextValue,
  type PeepochatSidebarHighlightsContextValue,
} from "@/lib/peepochat/peepochat-context"

export function PeepochatProvider({ children }: { children: React.ReactNode }) {
  const {
    config,
    ready,
    needsOnboarding,
    completeOnboarding,
    requireOnboarding,
    updateConfig,
    restoreBackup,
  } = usePeepochatConfig()
  const [watchState, dispatchWatch] = React.useReducer(
    watchReducer,
    EMPTY_WATCH_STATE
  )
  const playerMode = config.player.mode
  const playerMultiAudio = config.player.multiAudio
  const {
    account,
    oauthBusy,
    login,
    logout,
    invalidateSession,
    sessionExpired,
    isOAuthConfigured,
  } = useTwitchAuth({
    config,
    updateConfig,
  })
  const effectiveAccount = sessionExpired ? null : account
  const hasAccountValue = account !== null
  const onChatMessageRef = React.useRef<
    | ((message: import("@/lib/twitch/chat/chat").TwitchChatMessage) => void)
    | null
  >(null)
  const onHistoricalMessagesRef = React.useRef<
    | ((messages: import("@/lib/twitch/chat/chat").TwitchChatMessage[]) => void)
    | null
  >(null)

  const {
    connectionState,
    sendConnectionState,
    logs,
    subscribeToRoom,
    syncChannels,
    getTimeline,
    getRoom,
    getRoomId,
    subscribeToChatters,
    getChatters,
    getChatterByLogin,
    searchChatters,
    isRecentMessagesLoading,
    subscribeToRecentMessagesLoading,
    getSelfChatState,
    getChannelSendBlock,
    registerSendOutcomeListener,
    replayPendingComposerNotice,
    dismissComposerNotice,
    setEmoteLoadContext,
    setRecentMessagesEnabled,
    setLiveEmoteUpdatesEnabled,
    setLiveMessageLimit,
    setDeletedMessagesBehavior,
    setClearChatWhenInstructed,
    setHideBlockedUsers,
    setShowSuspiciousActivity,
    setVisibleSharedChatChannels,
    setIsUserBlocked,
    setChatCommandActions,
    setNicknameMentions,
    purgeMessagesFromBlockedUsers,
    purgeMessagesFromUser,
    markChatMessageDeleted,
    injectChatMessage,
    injectSystemMessage,
    injectAutomodHeldMessage,
    injectSuspiciousUserMessage,
    getComposerEmoteCatalog,
    ensureComposerEmotes,
    isComposerEmotesLoading,
    refreshEmotes,
    rehydrateAllRoomTimelines,
    sendMessage,
    sendActionMessage,
    runChatCommand,
    ensureSharedChatSourceProfiles,
  } = useTwitchChat({
    account: effectiveAccount,
    onAuthFailure: invalidateSession,
    onChatMessageRef,
    onHistoricalMessagesRef,
  })
  const {
    isBlocked,
    blockUser: blockUserBase,
    unblockUser: unblockUserBase,
  } = useBlockedUsers(effectiveAccount)
  const {
    getBadgeCatalog,
    loadBadgesForRoom,
    subscribeToBadgeCatalogs,
    hasBadgeSupport,
  } = useChatBadges(effectiveAccount)
  const { getMemberBadge } = useRcwBadges()

  const connectOptions = React.useMemo(
    () => ({
      accessToken: effectiveAccount?.accessToken,
      nick: effectiveAccount?.login,
    }),
    [effectiveAccount?.accessToken, effectiveAccount?.login]
  )

  const syncAllChannels = React.useCallback(
    (channelLogins: string[]) => {
      return syncChannels(channelLogins, connectOptions)
    },
    [connectOptions, syncChannels]
  )

  const {
    savedSplits,
    activeSplitId,
    activeSplitLayout,
    sidebarOrder,
    splitChannels,
    isSplitView,
    channelsInSplits,
    visibleChannelLogins,
    keepChatViewsMounted,
    cachedChatViews,
    activeChatViewKey,
    mountedChannelLogins,
    selectSplit,
    openSplitView,
    addSplitChannel,
    removeSplitChannel,
    unsplit,
    reorderSidebar,
    moveSplitPane,
    resizeSplitPanePath,
  } = useChatLayout({ config, updateConfig })

  const {
    channels,
    activeChannelLogin,
    setActiveChannel: setActiveChannelBase,
    addChannel: addChannelBase,
    removeChannel: removeChannelBase,
  } = useTwitchChannels({
    config,
    updateConfig,
  })

  const channelLogins = React.useMemo(
    () => channels.map((channel) => channel.login),
    [channels]
  )
  const watchedInstances = watchState.instances
  const watchedChannelLogins = React.useMemo(
    () => watchedInstances.map((instance) => instance.login),
    [watchedInstances]
  )
  const isPlayerViewActive =
    watchState.viewActive && watchedChannelLogins.length > 0
  const playerChatLogin =
    playerMode === "sidebar" ? watchState.focusedLogin : watchState.chatLogin
  const syncChannelLogins = React.useMemo(() => {
    const missing = watchedChannelLogins.filter(
      (login) => !channelLogins.includes(login)
    )
    return missing.length > 0 ? [...channelLogins, ...missing] : channelLogins
  }, [channelLogins, watchedChannelLogins])

  const focusChannelRef = React.useRef<(login: string) => void>((login) => {
    setActiveChannelBase(login)
  })

  const effectiveVisibleChannelLogins = React.useMemo(
    () =>
      isPlayerViewActive && playerChatLogin
        ? [playerChatLogin]
        : visibleChannelLogins,
    [isPlayerViewActive, playerChatLogin, visibleChannelLogins]
  )
  const visibleChannelLoginsRef = React.useRef(effectiveVisibleChannelLogins)
  React.useEffect(() => {
    visibleChannelLoginsRef.current = effectiveVisibleChannelLogins
  }, [effectiveVisibleChannelLogins])

  React.useEffect(() => {
    setVisibleSharedChatChannels(effectiveVisibleChannelLogins)
  }, [effectiveVisibleChannelLogins, setVisibleSharedChatChannels])

  const highlightActivity = useHighlightActivity({
    config,
    accountLogin: account?.login ?? null,
    visibleChannelLogins: effectiveVisibleChannelLogins,
    isSplitView: isPlayerViewActive ? false : isSplitView,
    activeSplitId: isPlayerViewActive ? null : activeSplitId,
    splits: savedSplits,
    onFocusChannel: (login) => {
      focusChannelRef.current(login)
    },
  })

  React.useEffect(() => {
    onChatMessageRef.current = highlightActivity.handleIncomingMessage
  }, [highlightActivity.handleIncomingMessage])

  React.useEffect(() => {
    onHistoricalMessagesRef.current = highlightActivity.handleHistoricalMessages
  }, [highlightActivity.handleHistoricalMessages])

  const { isLive: isChannelLive, getLiveStream } = useStreamLiveStatus({
    channelLogins,
    enabled: effectiveAccount !== null,
    accessToken: effectiveAccount?.accessToken,
    clientId: effectiveAccount?.clientId,
    onChannelWentLive: (login, title, gameName) => {
      if (!isLiveNotificationsEnabledForChannel(config, login)) return

      const normalizedLogin = normalizeChannelLogin(login)
      const isVisible = visibleChannelLoginsRef.current.some(
        (channelLogin) =>
          normalizeChannelLogin(channelLogin) === normalizedLogin
      )

      addLiveNotification({
        channelLogin: login,
        title,
        gameName,
        wentLiveAt: new Date().toISOString(),
        readAt: isVisible ? new Date().toISOString() : null,
      })

      if (config.highlights.doNotDisturbEnabled) return

      if (!canShowDesktopNotifications()) return
      if (!shouldShowDesktopNotification()) return

      const channel = channels.find(
        (entry) => normalizeChannelLogin(entry.login) === login
      )
      const channelName = channel?.displayName || channel?.login || login

      showDesktopNotification({
        title: `${channelName} just went live!`,
        body: formatLiveNotificationText(gameName ?? "", title),
        tag: `live:${login}`,
        icon: channel?.profileImageUrl || undefined,
        onClick: () => focusChannelRef.current(login),
      })
      void playAlertSound({
        useDefaultSounds: config.highlights.useDefaultSounds,
        customId: config.highlights.liveSoundCustomId,
        kind: "live",
      })
    },
  })

  const setActiveChannel = React.useCallback(
    (login: string) => {
      dispatchWatch({ type: "hide" })
      const normalized = normalizeChannelLogin(login)
      const split = findSplitContainingChannel(savedSplits, normalized)

      if (split) {
        highlightActivity.markSplitRead(split.id)
        updateConfig((current) => ({
          ...current,
          twitch: {
            ...current.twitch,
            activeChannelLogin: normalized,
          },
          layout: { ...current.layout, activeSplitId: split.id },
        }))
        return
      }

      highlightActivity.markChannelRead(normalized)
      setActiveChannelBase(normalized)
    },
    [highlightActivity, savedSplits, setActiveChannelBase, updateConfig]
  )

  React.useEffect(() => {
    focusChannelRef.current = setActiveChannel
  }, [setActiveChannel])

  const selectSplitWithRead = React.useCallback(
    (splitId: string) => {
      dispatchWatch({ type: "hide" })
      highlightActivity.markSplitRead(splitId)
      selectSplit(splitId)
    },
    [highlightActivity, selectSplit]
  )

  const addChannel = React.useCallback(
    async (login: string) => {
      dispatchWatch({ type: "hide" })
      return addChannelBase(login)
    },
    [addChannelBase]
  )

  const removeChannel = React.useCallback(
    (login: string) => {
      const normalized = normalizeChannelLogin(login)
      dispatchWatch({ type: "close", login: normalized })
      removeChannelBase(normalized)
    },
    [removeChannelBase]
  )

  const openPlayer = React.useCallback(
    (login: string) => {
      const normalized = normalizeChannelLogin(login)
      if (!normalized) return
      dispatchWatch({
        type: "open",
        login: normalized,
        mode: playerMode,
        multiAudio: playerMultiAudio,
      })
    },
    [playerMode, playerMultiAudio]
  )

  const selectPlayer = React.useCallback((login?: string) => {
    const normalized = login ? normalizeChannelLogin(login) : undefined
    dispatchWatch({ type: "show", login: normalized || undefined })
  }, [])

  const closePlayer = React.useCallback((login: string) => {
    dispatchWatch({ type: "close", login: normalizeChannelLogin(login) })
  }, [])

  const closeAllPlayers = React.useCallback(() => {
    dispatchWatch({ type: "closeAll" })
  }, [])

  const setPlayerChat = React.useCallback((login: string) => {
    dispatchWatch({ type: "setChat", login: normalizeChannelLogin(login) })
  }, [])

  const movePlayerPane = React.useCallback(
    (sourceLogin: string, targetLogin: string, edge: SplitLayoutEdge) => {
      dispatchWatch({ type: "move", sourceLogin, targetLogin, edge })
    },
    []
  )

  const resizePlayerPanePath = React.useCallback(
    (path: number[], sizes: number[]) => {
      dispatchWatch({ type: "resize", path, sizes })
    },
    []
  )

  const reportPlayerMuted = React.useCallback(
    (login: string, muted: boolean) => {
      dispatchWatch({ type: "reportMuted", login, muted })
    },
    []
  )

  const markReadChatLogin = isPlayerViewActive ? playerChatLogin : null
  const markChannelRead = highlightActivity.markChannelRead
  React.useEffect(() => {
    if (markReadChatLogin) {
      markChannelRead(markReadChatLogin)
    }
  }, [markChannelRead, markReadChatLogin])

  React.useEffect(() => {
    setRecentMessagesEnabled(config.chat.recentMessagesEnabled)
  }, [config.chat.recentMessagesEnabled, setRecentMessagesEnabled])

  React.useEffect(() => {
    setLiveEmoteUpdatesEnabled(
      config.chat.emotes.seventvEnabled &&
        config.chat.emotes.liveEmoteUpdatesEnabled
    )
  }, [
    config.chat.emotes.liveEmoteUpdatesEnabled,
    config.chat.emotes.seventvEnabled,
    setLiveEmoteUpdatesEnabled,
  ])

  React.useEffect(() => {
    setLiveMessageLimit(config.chat.maxLiveMessagesPerChannel)
  }, [config.chat.maxLiveMessagesPerChannel, setLiveMessageLimit])

  React.useEffect(() => {
    setDeletedMessagesBehavior(config.chat.deletedMessagesBehavior)
  }, [config.chat.deletedMessagesBehavior, setDeletedMessagesBehavior])

  React.useEffect(() => {
    setClearChatWhenInstructed(config.chat.clearChatWhenInstructed)
  }, [config.chat.clearChatWhenInstructed, setClearChatWhenInstructed])

  React.useEffect(() => {
    setHideBlockedUsers(config.chat.hideBlockedUsers)
  }, [config.chat.hideBlockedUsers, setHideBlockedUsers])

  React.useEffect(() => {
    setShowSuspiciousActivity(config.chat.showSuspiciousActivity)
  }, [config.chat.showSuspiciousActivity, setShowSuspiciousActivity])

  React.useEffect(() => {
    setIsUserBlocked(isBlocked)
  }, [isBlocked, setIsUserBlocked])

  const nicknameMentions = React.useMemo(
    () => createNicknameMentionMap(config.nicknames.entries),
    [config.nicknames.entries]
  )
  React.useEffect(() => {
    setNicknameMentions(nicknameMentions)
  }, [setNicknameMentions, nicknameMentions])

  const blockUser = React.useCallback(
    async (userId: string, login: string) => {
      await blockUserBase(userId, login)
      if (config.chat.hideBlockedUsers) {
        purgeMessagesFromUser(userId, login)
      }
    },
    [blockUserBase, config.chat.hideBlockedUsers, purgeMessagesFromUser]
  )

  const unblockUser = React.useCallback(
    async (userId: string, login?: string) => {
      await unblockUserBase(userId, login)
    },
    [unblockUserBase]
  )

  React.useEffect(() => {
    setChatCommandActions({ blockUser, unblockUser })
  }, [blockUser, setChatCommandActions, unblockUser])

  React.useEffect(() => {
    if (!config.chat.hideBlockedUsers) {
      return
    }

    purgeMessagesFromBlockedUsers((message) =>
      isBlocked(message.userId, message.userName)
    )
  }, [config.chat.hideBlockedUsers, isBlocked, purgeMessagesFromBlockedUsers])

  React.useEffect(() => {
    if (!ready || needsOnboarding) return
    if (!hasAccountValue) return

    void syncAllChannels(syncChannelLogins).catch((error) => {
      if (isSyncChannelsSupersededError(error)) {
        return
      }

      toast.error(error instanceof Error ? error.message : "Connection failed")
    })
  }, [
    syncChannelLogins,
    hasAccountValue,
    needsOnboarding,
    ready,
    syncAllChannels,
  ])

  const effectiveMountedChannelLogins = React.useMemo(() => {
    const missing = watchedChannelLogins.filter(
      (login) => !mountedChannelLogins.includes(login)
    )
    return missing.length > 0
      ? [...mountedChannelLogins, ...missing]
      : mountedChannelLogins
  }, [mountedChannelLogins, watchedChannelLogins])

  React.useEffect(() => {
    for (const login of effectiveMountedChannelLogins) {
      loadBadgesForRoom(getRoomId(login))
    }
  }, [effectiveMountedChannelLogins, getRoomId, loadBadgesForRoom])

  const channelHints = React.useMemo(
    () =>
      channels.map((channel) => ({
        login: channel.login,
        displayName: channel.displayName,
        profileImageUrl: channel.profileImageUrl,
        roomId: getRoomId(channel.login) ?? undefined,
      })),
    [channels, getRoomId]
  )

  const channelLoginsRef = React.useRef(channelLogins)

  const setEmoteLoadContextRef = React.useRef(setEmoteLoadContext)

  React.useEffect(() => {
    channelLoginsRef.current = channelLogins
  }, [channelLogins])

  React.useEffect(() => {
    setEmoteLoadContextRef.current = setEmoteLoadContext
  }, [setEmoteLoadContext])

  React.useEffect(() => {
    setEmoteLoadContextRef.current({
      accessToken: effectiveAccount?.accessToken,
      clientId: effectiveAccount?.clientId,
      userId: effectiveAccount?.id,
      userLogin: effectiveAccount?.login,
      userDisplayName: effectiveAccount?.displayName,
      channelHints,
    })
  }, [
    effectiveAccount?.accessToken,
    effectiveAccount?.clientId,
    effectiveAccount?.id,
    effectiveAccount?.login,
    effectiveAccount?.displayName,
    channelHints,
  ])

  const emotesOptionsReadyRef = React.useRef(false)
  const emoteProviderFlagsRef = React.useRef("")
  const zeroWidthEnabledRef = React.useRef(
    config.chat.emotes.zeroWidthEmotesEnabled
  )
  const refreshEmotesRef = React.useRef(refreshEmotes)
  const rehydrateAllRoomTimelinesRef = React.useRef(rehydrateAllRoomTimelines)

  React.useEffect(() => {
    refreshEmotesRef.current = refreshEmotes
  }, [refreshEmotes])

  React.useEffect(() => {
    rehydrateAllRoomTimelinesRef.current = rehydrateAllRoomTimelines
  }, [rehydrateAllRoomTimelines])

  React.useEffect(() => {
    setSeventvEmoteRenderOptions({
      zeroWidthEnabled: config.chat.emotes.zeroWidthEmotesEnabled,
    })

    if (
      emotesOptionsReadyRef.current &&
      zeroWidthEnabledRef.current !== config.chat.emotes.zeroWidthEmotesEnabled
    ) {
      rehydrateAllRoomTimelinesRef.current()
    }

    zeroWidthEnabledRef.current = config.chat.emotes.zeroWidthEmotesEnabled
  }, [config.chat.emotes.zeroWidthEmotesEnabled])

  React.useEffect(() => {
    const flagsKey = [
      config.chat.emotes.bttvEnabled,
      config.chat.emotes.ffzEnabled,
      config.chat.emotes.seventvEnabled,
      config.chat.emotes.showUnlistedEmotes,
    ].join(":")

    setThirdPartyEmoteFetchOptions({
      bttvEnabled: config.chat.emotes.bttvEnabled,
      ffzEnabled: config.chat.emotes.ffzEnabled,
      seventvEnabled: config.chat.emotes.seventvEnabled,
      showUnlistedEmotes: config.chat.emotes.showUnlistedEmotes,
    })

    if (!emotesOptionsReadyRef.current) {
      emotesOptionsReadyRef.current = true
      emoteProviderFlagsRef.current = flagsKey
      return
    }

    if (emoteProviderFlagsRef.current === flagsKey) {
      return
    }

    emoteProviderFlagsRef.current = flagsKey

    for (const login of channelLoginsRef.current) {
      void refreshEmotesRef.current(login)
    }
  }, [
    config.chat.emotes.bttvEnabled,
    config.chat.emotes.ffzEnabled,
    config.chat.emotes.seventvEnabled,
    config.chat.emotes.showUnlistedEmotes,
  ])

  const canSendChat = Boolean(
    effectiveAccount?.accessToken &&
    connectionState.connected &&
    sendConnectionState.connected
  )

  const executeChatCommand = React.useCallback(
    (login: string, input: string) =>
      runChatCommand(login, input, effectiveAccount),
    [effectiveAccount, runChatCommand]
  )

  const getBadgeCatalogForChannel = React.useCallback(
    (login: string) => getBadgeCatalog(getRoomId(login)),
    [getBadgeCatalog, getRoomId]
  )

  const handleLogout = React.useCallback(() => {
    dispatchWatch({ type: "closeAll" })
    void syncChannels([])
    logout()
    requireOnboarding()
  }, [logout, requireOnboarding, syncChannels])

  const configValue = React.useMemo<PeepochatConfigContextValue>(
    () => ({
      config,
      ready,
      needsOnboarding,
      completeOnboarding,
      requireOnboarding,
      updateConfig,
      restoreBackup,
      account: effectiveAccount,
      oauthBusy,
      isOAuthConfigured,
      loginWithTwitch: login,
      logout: handleLogout,
      channels,
      activeChannelLogin,
      setActiveChannel,
      addChannel,
      removeChannel,
    }),
    [
      config,
      ready,
      needsOnboarding,
      completeOnboarding,
      requireOnboarding,
      updateConfig,
      restoreBackup,
      effectiveAccount,
      oauthBusy,
      isOAuthConfigured,
      login,
      handleLogout,
      channels,
      activeChannelLogin,
      setActiveChannel,
      addChannel,
      removeChannel,
    ]
  )

  const layoutValue = React.useMemo<PeepochatLayoutContextValue>(
    () => ({
      savedSplits,
      activeSplitId,
      activeSplitLayout,
      sidebarOrder,
      splitChannels,
      isSplitView,
      channelsInSplits,
      visibleChannelLogins,
      keepChatViewsMounted,
      cachedChatViews,
      activeChatViewKey,
      mountedChannelLogins,
      selectSplit: selectSplitWithRead,
      openSplitView,
      addSplitChannel,
      removeSplitChannel,
      unsplit,
      reorderSidebar,
      moveSplitPane,
      resizeSplitPanePath,
    }),
    [
      savedSplits,
      activeSplitId,
      activeSplitLayout,
      sidebarOrder,
      splitChannels,
      isSplitView,
      channelsInSplits,
      visibleChannelLogins,
      keepChatViewsMounted,
      cachedChatViews,
      activeChatViewKey,
      mountedChannelLogins,
      selectSplitWithRead,
      openSplitView,
      addSplitChannel,
      removeSplitChannel,
      unsplit,
      reorderSidebar,
      moveSplitPane,
      resizeSplitPanePath,
    ]
  )

  const isSplitLive = React.useCallback(
    (logins: string[]) =>
      config.highlights.liveIndicatorsEnabled &&
      logins.some((login) => isChannelLive(login)),
    [config.highlights.liveIndicatorsEnabled, isChannelLive]
  )

  const getChannelLiveStream = React.useCallback(
    (login: string) => getLiveStream(login),
    [getLiveStream]
  )

  const sidebarHighlightsValue =
    React.useMemo<PeepochatSidebarHighlightsContextValue>(
      () => ({
        hasUnreadForChannel: highlightActivity.hasUnreadForChannel,
        hasUnreadForSplit: highlightActivity.hasUnreadForSplit,
        hasPingForChannel: highlightActivity.hasPingForChannel,
        hasPingForSplit: highlightActivity.hasPingForSplit,
        markChannelRead: highlightActivity.markChannelRead,
        markSplitRead: highlightActivity.markSplitRead,
        isChannelLive: (login) =>
          config.highlights.liveIndicatorsEnabled && isChannelLive(login),
        getChannelLiveStream,
        isSplitLive,
        liveIndicatorsEnabled: config.highlights.liveIndicatorsEnabled,
      }),
      [
        config.highlights.liveIndicatorsEnabled,
        highlightActivity.hasUnreadForChannel,
        highlightActivity.hasUnreadForSplit,
        highlightActivity.hasPingForChannel,
        highlightActivity.hasPingForSplit,
        highlightActivity.markChannelRead,
        highlightActivity.markSplitRead,
        isChannelLive,
        getChannelLiveStream,
        isSplitLive,
      ]
    )

  const playerValue = React.useMemo<PeepochatPlayerContextValue>(
    () => ({
      playerMode,
      watchedInstances,
      watchedChannelLogins,
      playerLayout: watchState.layout,
      playerChatLogin,
      focusedPlayerLogin: watchState.focusedLogin,
      playerViewActive: isPlayerViewActive,
      openPlayer,
      selectPlayer,
      closePlayer,
      closeAllPlayers,
      setPlayerChat,
      movePlayerPane,
      resizePlayerPanePath,
      reportPlayerMuted,
    }),
    [
      playerMode,
      watchedInstances,
      watchedChannelLogins,
      watchState.layout,
      playerChatLogin,
      watchState.focusedLogin,
      isPlayerViewActive,
      openPlayer,
      selectPlayer,
      closePlayer,
      closeAllPlayers,
      setPlayerChat,
      movePlayerPane,
      resizePlayerPanePath,
      reportPlayerMuted,
    ]
  )

  const chatValue = React.useMemo<PeepochatChatContextValue>(
    () => ({
      connectionState,
      sendConnectionState,
      logs,
      subscribeToRoom,
      getTimeline,
      getRoom,
      getRoomId,
      subscribeToChatters,
      getChatters,
      getChatterByLogin,
      searchChatters,
      isRecentMessagesLoading,
      subscribeToRecentMessagesLoading,
      getSelfChatState,
      getChannelSendBlock,
      registerSendOutcomeListener,
      replayPendingComposerNotice,
      dismissComposerNotice,
      getBadgeCatalog: getBadgeCatalogForChannel,
      getBadgeCatalogByRoomId: getBadgeCatalog,
      subscribeToBadgeCatalogs,
      loadBadgesForRoom,
      ensureSharedChatSourceProfiles,
      getMemberBadge,
      getComposerEmoteCatalog,
      ensureComposerEmotes,
      isComposerEmotesLoading,
      refreshEmotes,
      sendChatMessage: sendMessage,
      sendActionMessage,
      executeChatCommand,
      markChatMessageDeleted,
      injectChatMessage,
      injectSystemMessage,
      injectAutomodHeldMessage,
      injectSuspiciousUserMessage,
      canSendChat,
      hasBadgeSupport,
      hideBlockedUsers: config.chat.hideBlockedUsers,
      isUserBlocked: isBlocked,
      blockUser,
      unblockUser,
    }),
    [
      connectionState,
      sendConnectionState,
      logs,
      subscribeToRoom,
      getTimeline,
      getRoom,
      getRoomId,
      subscribeToChatters,
      getChatters,
      getChatterByLogin,
      searchChatters,
      isRecentMessagesLoading,
      subscribeToRecentMessagesLoading,
      getSelfChatState,
      getChannelSendBlock,
      registerSendOutcomeListener,
      replayPendingComposerNotice,
      dismissComposerNotice,
      getBadgeCatalogForChannel,
      getBadgeCatalog,
      subscribeToBadgeCatalogs,
      loadBadgesForRoom,
      ensureSharedChatSourceProfiles,
      getMemberBadge,
      getComposerEmoteCatalog,
      ensureComposerEmotes,
      isComposerEmotesLoading,
      refreshEmotes,
      sendMessage,
      sendActionMessage,
      executeChatCommand,
      markChatMessageDeleted,
      injectChatMessage,
      injectSystemMessage,
      injectAutomodHeldMessage,
      injectSuspiciousUserMessage,
      canSendChat,
      hasBadgeSupport,
      config.chat.hideBlockedUsers,
      isBlocked,
      blockUser,
      unblockUser,
    ]
  )

  return (
    <PeepochatConfigContext.Provider value={configValue}>
      <PeepochatLayoutContext.Provider value={layoutValue}>
        <PeepochatSidebarHighlightsContext.Provider
          value={sidebarHighlightsValue}
        >
          <PeepochatPlayerContext.Provider value={playerValue}>
            <PeepochatChatContext.Provider value={chatValue}>
              {children}
            </PeepochatChatContext.Provider>
          </PeepochatPlayerContext.Provider>
        </PeepochatSidebarHighlightsContext.Provider>
      </PeepochatLayoutContext.Provider>
    </PeepochatConfigContext.Provider>
  )
}
