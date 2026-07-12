import * as React from "react"

import {
  readChannelSidebarVisible,
  writeChannelSidebarVisible,
} from "@/lib/sidebar/channel-sidebar-visibility"

export function useChannelSidebarVisibility() {
  const [visible, setVisible] = React.useState(readChannelSidebarVisible)

  const setChannelSidebarVisible = React.useCallback((nextVisible: boolean) => {
    setVisible(nextVisible)
    writeChannelSidebarVisible(nextVisible)
  }, [])

  const toggleChannelSidebar = React.useCallback(() => {
    setChannelSidebarVisible(!visible)
  }, [setChannelSidebarVisible, visible])

  return {
    channelSidebarVisible: visible,
    toggleChannelSidebar,
  }
}
