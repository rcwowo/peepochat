import * as React from "react"

import {
  HotkeyRegistryContext,
  type HotkeyRegistryValue,
  type PaneHotkeyActions,
  type SearchHotkeyApi,
} from "@/lib/hotkeys/hotkey-registry.shared"

export function HotkeyRegistryProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const searchRef = React.useRef<SearchHotkeyApi | null>(null)
  const panesRef = React.useRef(new Map<string, PaneHotkeyActions>())
  const lastFocusedLoginRef = React.useRef<string | null>(null)
  const pendingFocusLoginRef = React.useRef<string | null>(null)

  const registerSearch = React.useCallback((api: SearchHotkeyApi) => {
    searchRef.current = api
    return () => {
      if (searchRef.current === api) {
        searchRef.current = null
      }
    }
  }, [])

  const registerPane = React.useCallback(
    (channelLogin: string, actions: PaneHotkeyActions) => {
      panesRef.current.set(channelLogin, actions)
      if (pendingFocusLoginRef.current === channelLogin) {
        pendingFocusLoginRef.current = null
        window.requestAnimationFrame(() => {
          actions.focusComposer()
        })
      }
      return () => {
        if (panesRef.current.get(channelLogin) === actions) {
          panesRef.current.delete(channelLogin)
        }
      }
    },
    []
  )

  const rememberFocusedPane = React.useCallback((channelLogin: string) => {
    lastFocusedLoginRef.current = channelLogin
  }, [])

  const requestComposerFocus = React.useCallback((channelLogin: string) => {
    lastFocusedLoginRef.current = channelLogin
    pendingFocusLoginRef.current = channelLogin
    window.requestAnimationFrame(() => {
      if (pendingFocusLoginRef.current !== channelLogin) {
        return
      }
      const pane = panesRef.current.get(channelLogin)
      if (!pane) {
        return
      }
      pendingFocusLoginRef.current = null
      pane.focusComposer()
    })
  }, [])

  const getSearch = React.useCallback(() => searchRef.current, [])
  const getLastFocusedLogin = React.useCallback(
    () => lastFocusedLoginRef.current,
    []
  )
  const getTargetPane = React.useCallback(() => {
    const last = lastFocusedLoginRef.current
    if (last) {
      const pane = panesRef.current.get(last)
      if (pane) {
        return pane
      }
    }

    if (panesRef.current.size === 1) {
      return panesRef.current.values().next().value ?? null
    }

    return null
  }, [])

  const getPane = React.useCallback(
    (channelLogin: string) => panesRef.current.get(channelLogin) ?? null,
    []
  )

  const restoreLastComposerFocus = React.useCallback(() => {
    const pane = getTargetPane()
    if (!pane) {
      return false
    }

    window.requestAnimationFrame(() => {
      pane.focusComposer()
    })
    return true
  }, [getTargetPane])

  const value = React.useMemo<HotkeyRegistryValue>(
    () => ({
      registerSearch,
      registerPane,
      rememberFocusedPane,
      requestComposerFocus,
      restoreLastComposerFocus,
      getLastFocusedLogin,
      getSearch,
      getTargetPane,
      getPane,
    }),
    [
      getPane,
      getLastFocusedLogin,
      getSearch,
      getTargetPane,
      registerPane,
      registerSearch,
      rememberFocusedPane,
      requestComposerFocus,
      restoreLastComposerFocus,
    ]
  )

  return (
    <HotkeyRegistryContext.Provider value={value}>
      {children}
    </HotkeyRegistryContext.Provider>
  )
}
