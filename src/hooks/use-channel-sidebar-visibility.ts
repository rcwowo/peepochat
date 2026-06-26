import * as React from "react"

import { useCompactLayout } from "@/hooks/use-compact-layout"
import {
  readChannelSidebarVisible,
  writeChannelSidebarVisible,
} from "@/lib/sidebar/channel-sidebar-visibility"

export function useChannelSidebarVisibility() {
  const isCompact = useCompactLayout()
  const [visible, setVisible] = React.useState(readChannelSidebarVisible)

  const setChannelSidebarVisible = React.useCallback((nextVisible: boolean) => {
    setVisible(nextVisible)
    writeChannelSidebarVisible(nextVisible)
  }, [])

  const toggleChannelSidebar = React.useCallback(() => {
    setChannelSidebarVisible(!visible)
  }, [setChannelSidebarVisible, visible])

  return {
    isCompact,
    channelSidebarVisible: isCompact ? visible : true,
    toggleChannelSidebar,
  }
}
