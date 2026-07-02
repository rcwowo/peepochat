import * as React from "react"

export function useLazyRef<T>(initializer: () => T): React.RefObject<T> {
  const ref = React.useRef<T | undefined>(undefined)
  if (ref.current === undefined) {
    ref.current = initializer()
  }
  return ref as React.RefObject<T>
}
