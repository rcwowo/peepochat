import * as React from "react"

import type { ChatSearchCommittedFilter } from "@/lib/search/chat-search"

export type SearchHotkeyApi = {
  open: (prefill?: string) => void
  openWithFilters: (filters: ChatSearchCommittedFilter[]) => void
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
  getPane: (channelLogin: string) => PaneHotkeyActions | null
}

export const HotkeyRegistryContext =
  React.createContext<HotkeyRegistryValue | null>(null)
