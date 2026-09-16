import * as React from "react"

import { createChatterStore } from "@/lib/chat/chatters/store"
import { retainDevRuntime } from "@/lib/dev/retain-runtime"

export function useChatterStore() {
  const [store] = React.useState(() =>
    retainDevRuntime("chatter-store", createChatterStore)
  )

  React.useEffect(() => {
    return () => {
      if (import.meta.env.DEV) {
        return
      }
      store.dispose()
    }
  }, [store])

  return store
}

export type ChatterStoreApi = ReturnType<typeof useChatterStore>
