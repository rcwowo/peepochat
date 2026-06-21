import * as React from "react"

import { EmoteCardContext } from "@/components/chat/emote-card-context.shared"

export function useEmoteCardContext() {
  return React.useContext(EmoteCardContext)
}
