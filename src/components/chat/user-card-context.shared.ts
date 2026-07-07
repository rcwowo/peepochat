import * as React from "react"

import type { UserCardTarget } from "@/hooks/twitch/use-user-card"

export type UserCardContextValue = {
  openUserCard: (target: UserCardTarget, triggerEl: HTMLElement | null) => void
  closeUserCard: () => void
  toggleUserCard: (
    target: UserCardTarget,
    triggerEl: HTMLElement | null
  ) => void
  isUserCardOpenFor: (target: UserCardTarget) => boolean
}

export const UserCardContext = React.createContext<UserCardContextValue | null>(
  null
)
