import * as React from "react"

export function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = React.useState(() => {
    if (typeof window === "undefined") {
      return false
    }

    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  })

  React.useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)")

    const handleChange = () => {
      setReducedMotion(motionQuery.matches)
    }

    motionQuery.addEventListener("change", handleChange)
    return () => motionQuery.removeEventListener("change", handleChange)
  }, [])

  return reducedMotion
}
