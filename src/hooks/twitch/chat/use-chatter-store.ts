import * as React from "react"

import { createChatterStore } from "@/lib/chat/chatter-store"

export function useChatterStore() {
  const [store] = React.useState(() => createChatterStore())

  React.useEffect(() => {
    return () => {
      store.dispose()
    }
  }, [store])

  return store
}

export type ChatterStoreApi = ReturnType<typeof useChatterStore>
