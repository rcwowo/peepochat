import * as React from "react"

import type { UserCardTarget } from "@/hooks/twitch/use-user-card"
import type { TwitchChatMessage } from "@/lib/twitch/twitch-chat"

export type UserCardContextValue = {
  openUserCard: (
    target: UserCardTarget,
    triggerEl: HTMLElement | null,
    recentMessages?: TwitchChatMessage[]
  ) => void
  closeUserCard: () => void
  toggleUserCard: (
    target: UserCardTarget,
    triggerEl: HTMLElement | null,
    recentMessages?: TwitchChatMessage[]
  ) => void
  isUserCardOpenFor: (target: UserCardTarget) => boolean
}

export const UserCardContext = React.createContext<UserCardContextValue | null>(
  null
)
