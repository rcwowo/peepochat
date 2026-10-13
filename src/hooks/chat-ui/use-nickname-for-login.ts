import * as React from "react"

import { findNicknameByLogin } from "@/lib/chat/nicknames"
import { usePeepochatSettings } from "@/lib/peepochat/peepochat-context"

export function useNicknameForLogin(
  userName: string | null | undefined
): string | null {
  const { config } = usePeepochatSettings()
  const entries = config.nicknames.entries

  return React.useMemo(
    () => findNicknameByLogin(entries, userName),
    [entries, userName]
  )
}
