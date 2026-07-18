import * as React from "react"

const NEAR_BOTTOM_PX = 24

type TimelineEntry = { message: { id: string } }

export function useChatScroll<T extends TimelineEntry>({
  timeline,
  isActive,
}: {
  timeline: T[]
  isActive: boolean
}) {
  const chatContainerRef = React.useRef<HTMLDivElement>(null)
  const messageListRef = React.useRef<HTMLDivElement>(null)
  const isProgrammaticScrollRef = React.useRef(false)
  const timelineRef = React.useRef(timeline)
  const pendingScrollBehaviorRef = React.useRef<ScrollBehavior | null>(null)
  const [isScrollPaused, setIsScrollPaused] = React.useState(false)
  const [pausedTimeline, setPausedTimeline] = React.useState<T[] | null>(null)

  React.useLayoutEffect(() => {
    timelineRef.current = timeline
  }, [timeline])

  const displayedTimeline =
    isScrollPaused && pausedTimeline !== null ? pausedTimeline : timeline

  const scrollToBottom = React.useCallback(
    (behavior: ScrollBehavior = "auto") => {
      const el = chatContainerRef.current
      if (!el) return

      isProgrammaticScrollRef.current = true
      el.scrollTo({ top: el.scrollHeight, behavior })
      requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false
      })
    },
    []
  )

  const resumeScroll = React.useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      pendingScrollBehaviorRef.current = behavior
      setIsScrollPaused(false)
      setPausedTimeline(null)
    },
    []
  )

  const handleChatScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (isProgrammaticScrollRef.current) return

      const el = event.currentTarget
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight
      const isNearBottom = distanceFromBottom <= NEAR_BOTTOM_PX

      if (isNearBottom) {
        setIsScrollPaused(false)
        setPausedTimeline(null)
        return
      }

      setIsScrollPaused(true)
      setPausedTimeline((current) => current ?? timelineRef.current)
    },
    []
  )

  const timelineScrollKey = React.useMemo(() => {
    if (timeline.length === 0) {
      return "empty"
    }

    const lastEntry = timeline[timeline.length - 1]
    return `${timeline.length}:${lastEntry.message.id}`
  }, [timeline])

  React.useLayoutEffect(() => {
    if (!isActive || isScrollPaused) return

    const behavior = pendingScrollBehaviorRef.current ?? "auto"
    pendingScrollBehaviorRef.current = null
    scrollToBottom(behavior)
  }, [isActive, timelineScrollKey, isScrollPaused, scrollToBottom])

  React.useEffect(() => {
    const messageList = messageListRef.current
    if (
      !isActive ||
      !messageList ||
      isScrollPaused ||
      typeof ResizeObserver === "undefined"
    ) {
      return
    }

    const observer = new ResizeObserver(() => {
      scrollToBottom("auto")
    })
    observer.observe(messageList)

    return () => {
      observer.disconnect()
    }
  }, [isActive, isScrollPaused, scrollToBottom])

  return {
    chatContainerRef,
    messageListRef,
    displayedTimeline,
    isScrollPaused,
    handleChatScroll,
    resumeScroll,
    scrollToBottom,
  }
}
