import * as React from "react"
import { toast } from "sonner"

import {
  getOpenHotkeySurface,
  getSearchPrefill,
  isComposerActive,
  matchHotkey,
} from "@/lib/hotkeys/match"
import { useHotkeyRegistry } from "@/hooks/use-hotkey-registry"
import { getSidebarEntries } from "@/lib/sidebar/sidebar-entries"
import {
  usePeepochatChat,
  usePeepochatLayout,
  usePeepochatSettings,
} from "@/lib/peepochat/peepochat-context"

function restoreComposerFocus(focusComposer: (() => void) | undefined) {
  if (!focusComposer) {
    return
  }

  window.requestAnimationFrame(() => {
    focusComposer()
  })
}

export function useAppHotkeys({
  enabled,
  settingsOpen,
  addChannelOpen,
  notificationsOpen,
  toggleSettings,
  toggleAddChannel,
  toggleNotifications,
  toggleSidebar,
}: {
  enabled: boolean
  settingsOpen: boolean
  addChannelOpen: boolean
  notificationsOpen: boolean
  toggleSettings: () => void
  toggleAddChannel: () => void
  toggleNotifications: () => void
  toggleSidebar: () => void
}) {
  const {
    getLastFocusedLogin,
    getSearch,
    getTargetPane,
    requestComposerFocus,
  } = useHotkeyRegistry()
  const { setActiveChannel, updateConfig, channels, config } =
    usePeepochatSettings()
  const {
    sidebarOrder,
    savedSplits,
    channelsInSplits,
    selectSplit,
    visibleChannelLogins,
  } = usePeepochatLayout()
  const { refreshEmotes } = usePeepochatChat()

  const selectSidebarIndex = React.useCallback(
    (index: number) => {
      const entries = getSidebarEntries(
        sidebarOrder,
        savedSplits,
        channels,
        channelsInSplits
      )
      const entry = entries[index]
      if (!entry) {
        return null
      }

      if (entry.kind === "split") {
        selectSplit(entry.split.id)
        return entry.split.channels[0] ?? null
      }

      setActiveChannel(entry.channel.login)
      return entry.channel.login
    },
    [
      channels,
      channelsInSplits,
      savedSplits,
      selectSplit,
      setActiveChannel,
      sidebarOrder,
    ]
  )

  const toggleDoNotDisturb = React.useCallback(() => {
    const nextEnabled = !config.highlights.doNotDisturbEnabled
    updateConfig((current) => ({
      ...current,
      highlights: {
        ...current.highlights,
        doNotDisturbEnabled: nextEnabled,
      },
    }))
    toast(nextEnabled ? "Do not disturb is on" : "Do not disturb is off")
  }, [config.highlights.doNotDisturbEnabled, updateConfig])

  const reloadEmotes = React.useCallback(() => {
    for (const login of visibleChannelLogins) {
      void refreshEmotes(login)
    }
  }, [refreshEmotes, visibleChannelLogins])

  React.useEffect(() => {
    if (!enabled) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const match = matchHotkey(event)
      if (!match) {
        return
      }

      const surface = getOpenHotkeySurface()
      const allowWhenSurface =
        match.binding.action !== "sidebar.select"
          ? match.binding.allowWhenSurface
          : undefined
      if (surface && surface !== allowWhenSurface) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const composerWasFocused = isComposerActive()
      const targetPane = getTargetPane()

      switch (match.action) {
        case "search.open": {
          const search = getSearch()
          if (!search) {
            return
          }
          if (search.isOpen()) {
            search.close()
            restoreComposerFocus(targetPane?.focusComposer)
            return
          }
          search.open(getSearchPrefill())
          return
        }
        case "sidebar.select": {
          if (match.index === undefined) {
            return
          }
          const login = selectSidebarIndex(match.index)
          if (!login || !composerWasFocused) {
            return
          }
          requestComposerFocus(login)
          return
        }
        case "channel.add":
          if (addChannelOpen) {
            toggleAddChannel()
            restoreComposerFocus(targetPane?.focusComposer)
            return
          }
          toggleAddChannel()
          return
        case "notifications.open":
          if (notificationsOpen) {
            toggleNotifications()
            restoreComposerFocus(targetPane?.focusComposer)
            return
          }
          toggleNotifications()
          return
        case "dnd.toggle":
          toggleDoNotDisturb()
          if (composerWasFocused) {
            restoreComposerFocus(targetPane?.focusComposer)
          }
          return
        case "settings.open":
          if (settingsOpen) {
            toggleSettings()
            restoreComposerFocus(targetPane?.focusComposer)
            return
          }
          toggleSettings()
          return
        case "sidebar.toggle":
          toggleSidebar()
          if (composerWasFocused) {
            restoreComposerFocus(targetPane?.focusComposer)
          }
          return
        case "emote-picker.open": {
          const opened = targetPane?.toggleEmotePicker()
          if (opened === false) {
            restoreComposerFocus(targetPane?.focusComposer)
          }
          return
        }
        case "viewer-list.open": {
          const opened = targetPane?.toggleViewerList()
          if (opened === false) {
            restoreComposerFocus(targetPane?.focusComposer)
          }
          return
        }
        case "emotes.reload":
          reloadEmotes()
          if (composerWasFocused) {
            restoreComposerFocus(targetPane?.focusComposer)
          }
          return
        case "composer.focus": {
          const login = getLastFocusedLogin()
          if (login) {
            setActiveChannel(login)
            requestComposerFocus(login)
            return
          }
          restoreComposerFocus(targetPane?.focusComposer)
          return
        }
      }
    }

    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [
    addChannelOpen,
    enabled,
    getLastFocusedLogin,
    getSearch,
    getTargetPane,
    requestComposerFocus,
    setActiveChannel,
    notificationsOpen,
    reloadEmotes,
    selectSidebarIndex,
    settingsOpen,
    toggleAddChannel,
    toggleDoNotDisturb,
    toggleNotifications,
    toggleSettings,
    toggleSidebar,
  ])
}
