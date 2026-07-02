import * as React from "react"

type UseIntersectionVisibleOptions = {
  rootMargin?: string
  threshold?: number
}

export function useIntersectionVisible<T extends Element>(
  options: UseIntersectionVisibleOptions = {}
) {
  const { rootMargin = "0px", threshold = 0 } = options
  const [visible, setVisible] = React.useState(false)
  const observerRef = React.useRef<IntersectionObserver | null>(null)

  const ref = React.useCallback(
    (element: T | null) => {
      observerRef.current?.disconnect()
      observerRef.current = null

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
      observerRef.current = observer
    },
    [rootMargin, threshold]
  )

  return { ref, visible }
}
