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
  const ignoreScrollRef = React.useRef(false)
  const isPinnedRef = React.useRef(true)
  const isScrollPausedRef = React.useRef(false)
  const programmaticScrollClearRef = React.useRef<number | null>(null)
  const ignoreScrollClearRef = React.useRef<number | null>(null)
  const timelineRef = React.useRef(timeline)
  const pendingScrollBehaviorRef = React.useRef<ScrollBehavior | null>(null)
  const [isScrollPaused, setIsScrollPaused] = React.useState(false)
  const [pausedTimeline, setPausedTimeline] = React.useState<T[] | null>(null)

  React.useLayoutEffect(() => {
    timelineRef.current = timeline
  }, [timeline])

  React.useLayoutEffect(() => {
    isScrollPausedRef.current = isScrollPaused
  }, [isScrollPaused])

  const displayedTimeline =
    isScrollPaused && pausedTimeline !== null ? pausedTimeline : timeline
  const hasMessages = displayedTimeline.length > 0

  const clearProgrammaticScroll = React.useCallback(() => {
    if (programmaticScrollClearRef.current !== null) {
      window.clearTimeout(programmaticScrollClearRef.current)
      programmaticScrollClearRef.current = null
    }
  }, [])

  const clearIgnoreScroll = React.useCallback(() => {
    if (ignoreScrollClearRef.current !== null) {
      window.cancelAnimationFrame(ignoreScrollClearRef.current)
      ignoreScrollClearRef.current = null
    }
  }, [])

  const beginIgnoreScroll = React.useCallback(() => {
    clearIgnoreScroll()
    ignoreScrollRef.current = true
    ignoreScrollClearRef.current = window.requestAnimationFrame(() => {
      ignoreScrollClearRef.current = window.requestAnimationFrame(() => {
        ignoreScrollRef.current = false
        ignoreScrollClearRef.current = null
      })
    })
  }, [clearIgnoreScroll])

  const scrollToBottom = React.useCallback(
    (behavior: ScrollBehavior = "auto") => {
      const el = chatContainerRef.current
      if (!el) return

      clearProgrammaticScroll()
      beginIgnoreScroll()
      isProgrammaticScrollRef.current = true
      el.scrollTo({ top: el.scrollHeight, behavior })

      if (behavior === "smooth") {
        programmaticScrollClearRef.current = window.setTimeout(() => {
          isProgrammaticScrollRef.current = false
          programmaticScrollClearRef.current = null
        }, 400)
        return
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          isProgrammaticScrollRef.current = false
        })
      })
    },
    [beginIgnoreScroll, clearProgrammaticScroll]
  )

  const stickToBottomIfPinned = React.useCallback(() => {
    if (!isPinnedRef.current) return

    beginIgnoreScroll()
    scrollToBottom("auto")

    if (isScrollPausedRef.current) {
      setIsScrollPaused(false)
      setPausedTimeline(null)
    }
  }, [beginIgnoreScroll, scrollToBottom])

  const notifyComposerResize = React.useCallback(() => {
    stickToBottomIfPinned()
  }, [stickToBottomIfPinned])

  React.useEffect(() => {
    return () => {
      clearProgrammaticScroll()
      clearIgnoreScroll()
    }
  }, [clearIgnoreScroll, clearProgrammaticScroll])

  const resumeScroll = React.useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      isPinnedRef.current = true
      pendingScrollBehaviorRef.current = behavior
      setIsScrollPaused(false)
      setPausedTimeline(null)
    },
    []
  )

  const handleChatScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (isProgrammaticScrollRef.current || ignoreScrollRef.current) return

      const el = event.currentTarget
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight
      const isNearBottom = distanceFromBottom <= NEAR_BOTTOM_PX

      isPinnedRef.current = isNearBottom

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

  React.useLayoutEffect(() => {
    const messageList = messageListRef.current
    const chatContainer = chatContainerRef.current
    if (
      !isActive ||
      !hasMessages ||
      !messageList ||
      !chatContainer ||
      typeof ResizeObserver === "undefined"
    ) {
      return
    }

    const observer = new ResizeObserver(() => {
      stickToBottomIfPinned()
    })
    observer.observe(messageList)
    observer.observe(chatContainer)

    return () => {
      observer.disconnect()
    }
  }, [hasMessages, isActive, stickToBottomIfPinned])

  return {
    chatContainerRef,
    messageListRef,
    displayedTimeline,
    isScrollPaused,
    handleChatScroll,
    resumeScroll,
    scrollToBottom,
    notifyComposerResize,
  }
}
