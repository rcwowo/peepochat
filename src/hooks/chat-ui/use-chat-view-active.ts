import * as React from "react"

import { ChatViewActiveContext } from "@/components/chat/chat-view-active-context"

export function useChatViewActive() {
  return React.useContext(ChatViewActiveContext)
}
