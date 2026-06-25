import * as React from "react"

import { UserCardContext } from "@/components/chat/user-card-context.shared"

export function useUserCardContext() {
  return React.useContext(UserCardContext)
}
