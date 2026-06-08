import * as React from "react"

type UseIntersectionVisibleOptions = {
  rootMargin?: string
  threshold?: number
}

export function useIntersectionVisible<T extends Element>(
  options: UseIntersectionVisibleOptions = {}
) {
  const { rootMargin = "0px", threshold = 0 } = options
  const ref = React.useRef<T | null>(null)
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry?.isIntersecting ?? false)
      },
      { rootMargin, threshold }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [rootMargin, threshold])

  return { ref, visible }
}
