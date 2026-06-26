import * as React from "react"

/** Matches Tailwind `sm` — settings sheet is full width below this width. */
const COMPACT_LAYOUT_BREAKPOINT = 640

export function useCompactLayout() {
  const [isCompact, setIsCompact] = React.useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(
          `(max-width: ${COMPACT_LAYOUT_BREAKPOINT - 1}px)`
        ).matches
      : false
  )

  React.useEffect(() => {
    const mql = window.matchMedia(
      `(max-width: ${COMPACT_LAYOUT_BREAKPOINT - 1}px)`
    )
    const onChange = () => {
      setIsCompact(mql.matches)
    }
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isCompact
}
