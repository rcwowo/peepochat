import * as React from "react"

import { ChatViewActiveContext } from "@/components/chat/chat-view-active-context"

export function ChatViewActiveProvider({
  isActive,
  children,
}: {
  isActive: boolean
  children: React.ReactNode
}) {
  return (
    <ChatViewActiveContext.Provider value={isActive}>
      {children}
    </ChatViewActiveContext.Provider>
  )
}
