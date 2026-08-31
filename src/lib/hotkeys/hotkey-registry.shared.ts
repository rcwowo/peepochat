import * as React from "react"

export type SearchHotkeyApi = {
  open: (prefill?: string) => void
  close: () => void
  isOpen: () => boolean
}

export type PaneHotkeyActions = {
  toggleEmotePicker: () => boolean
  toggleViewerList: () => boolean
  focusComposer: () => void
}

export type HotkeyRegistryValue = {
  registerSearch: (api: SearchHotkeyApi) => () => void
  registerPane: (channelLogin: string, actions: PaneHotkeyActions) => () => void
  rememberFocusedPane: (channelLogin: string) => void
  requestComposerFocus: (channelLogin: string) => void
  restoreLastComposerFocus: () => boolean
  getLastFocusedLogin: () => string | null
  getSearch: () => SearchHotkeyApi | null
  getTargetPane: () => PaneHotkeyActions | null
}

export const HotkeyRegistryContext =
  React.createContext<HotkeyRegistryValue | null>(null)
