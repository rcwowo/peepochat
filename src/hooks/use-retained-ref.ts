import * as React from "react"

import { retainDevRuntime } from "@/lib/dev/retain-runtime"

export function useRetainedRef<T>(
  key: string,
  create: () => T
): React.MutableRefObject<T> {
  const [ref] = React.useState(() =>
    retainDevRuntime(key, () => ({ current: create() }))
  )
  return ref
}
