import * as React from "react"

import type { EmoteCardTarget } from "@/lib/chat/emote-card"

export type EmoteCardContextValue = {
  openEmoteCard: (target: EmoteCardTarget, triggerEl: HTMLElement | null) => void
  closeEmoteCard: () => void
  toggleEmoteCard: (target: EmoteCardTarget, triggerEl: HTMLElement | null) => void
  isEmoteCardOpenFor: (target: EmoteCardTarget) => boolean
}

export const EmoteCardContext =
  React.createContext<EmoteCardContextValue | null>(null)
