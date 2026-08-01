import * as React from "react"
import {
  elementScroll,
  useVirtualizer,
  type Virtualizer,
} from "@tanstack/react-virtual"

const NEAR_BOTTOM_PX = 24
const LIST_EDGE_PADDING_PX = 4
const DEFAULT_ESTIMATE_SIZE_PX = 40

type TimelineEntry = {
  kind: string
  message: { id: string; reply?: unknown }
}

function estimateTimelineItemSize(entry: TimelineEntry | undefined) {
  if (!entry) {
    return DEFAULT_ESTIMATE_SIZE_PX
  }

  if (entry.kind === "automod" || entry.kind === "suspicious") {
    return 72
  }

  if (entry.kind === "system") {
    return 56
  }

  if (entry.kind === "chat" && entry.message.reply) {
    return 64
  }

  return DEFAULT_ESTIMATE_SIZE_PX
}

function getDistanceFromBottom(el: HTMLElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight
}

export function useChatScroll<T extends TimelineEntry>({
  timeline,
  isActive,
  channelLogin,
}: {
  timeline: T[]
  isActive: boolean
  channelLogin: string
}) {
  const chatContainerRef = React.useRef<HTMLDivElement>(null)
  const isProgrammaticScrollRef = React.useRef(false)
  const ignoreScrollRef = React.useRef(false)
  const isPinnedRef = React.useRef(true)
  const isResumeScrollRef = React.useRef(false)
  const isScrollPausedRef = React.useRef(false)
  const programmaticScrollClearRef = React.useRef<number | null>(null)
  const ignoreScrollClearRef = React.useRef<number | null>(null)
  const timelineRef = React.useRef(timeline)
  const pendingScrollBehaviorRef = React.useRef<ScrollBehavior | null>(null)
  const listPaddingStartRef = React.useRef(LIST_EDGE_PADDING_PX)
  const [isScrollPaused, setIsScrollPaused] = React.useState(false)
  const [isResuming, setIsResuming] = React.useState(false)
  const [pausedTimeline, setPausedTimeline] = React.useState<T[] | null>(null)
  const [pausedForChannel, setPausedForChannel] = React.useState(channelLogin)
  const [listPaddingStart, setListPaddingStart] =
    React.useState(LIST_EDGE_PADDING_PX)

  if (pausedForChannel !== channelLogin) {
    setPausedForChannel(channelLogin)
    setIsScrollPaused(false)
    setIsResuming(false)
    setPausedTimeline(null)
    isPinnedRef.current = true
    isResumeScrollRef.current = false
    pendingScrollBehaviorRef.current = "auto"
    listPaddingStartRef.current = LIST_EDGE_PADDING_PX
    setListPaddingStart(LIST_EDGE_PADDING_PX)
  }

  React.useLayoutEffect(() => {
    timelineRef.current = timeline
  }, [timeline])

  React.useLayoutEffect(() => {
    isScrollPausedRef.current = isScrollPaused
  }, [isScrollPaused])

  React.useLayoutEffect(() => {
    listPaddingStartRef.current = listPaddingStart
  }, [listPaddingStart])

  const displayedTimeline =
    isScrollPaused &&
    pausedTimeline !== null &&
    pausedForChannel === channelLogin
      ? pausedTimeline
      : timeline

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

  const markProgrammaticScroll = React.useCallback(
    (behavior: ScrollBehavior = "auto") => {
      clearProgrammaticScroll()
      beginIgnoreScroll()
      isProgrammaticScrollRef.current = true

      if (behavior === "smooth" || isResumeScrollRef.current) {
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

  const scrollToFn = React.useCallback(
    (
      offset: number,
      options: { adjustments?: number; behavior?: ScrollBehavior },
      instance: Virtualizer<HTMLDivElement, Element>
    ) => {
      markProgrammaticScroll(options.behavior === "smooth" ? "smooth" : "auto")
      elementScroll(offset, options, instance)
    },
    [markProgrammaticScroll]
  )

  const getItemKey = React.useCallback(
    (index: number) => displayedTimeline[index]?.message.id ?? index,
    [displayedTimeline]
  )

  const estimateSize = React.useCallback(
    (index: number) => estimateTimelineItemSize(displayedTimeline[index]),
    [displayedTimeline]
  )

  const virtualizer = useVirtualizer({
    count: displayedTimeline.length,
    getScrollElement: () => chatContainerRef.current,
    estimateSize,
    getItemKey,
    scrollToFn,
    anchorTo: "end",
    followOnAppend: true,
    scrollEndThreshold: NEAR_BOTTOM_PX,
    overscan: 8,
    paddingStart: listPaddingStart,
    paddingEnd: LIST_EDGE_PADDING_PX,
    enabled: isActive && displayedTimeline.length > 0,
  })

  const scrollToEnd = React.useCallback(
    (behavior: ScrollBehavior = "auto") => {
      isPinnedRef.current = true
      markProgrammaticScroll(behavior)
      virtualizer.scrollToEnd({ behavior })
    },
    [markProgrammaticScroll, virtualizer]
  )

  const syncListPadding = React.useCallback(() => {
    const chatContainer = chatContainerRef.current
    if (!chatContainer || displayedTimeline.length === 0) {
      return false
    }

    const contentSize = Math.max(
      0,
      virtualizer.getTotalSize() - listPaddingStartRef.current
    )
    const nextPaddingStart = Math.max(
      LIST_EDGE_PADDING_PX,
      chatContainer.clientHeight - contentSize
    )

    if (nextPaddingStart === listPaddingStartRef.current) {
      return false
    }

    listPaddingStartRef.current = nextPaddingStart
    setListPaddingStart(nextPaddingStart)
    return true
  }, [displayedTimeline.length, virtualizer])

  const finishResumeScroll = React.useCallback(() => {
    if (!isScrollPausedRef.current) {
      return
    }

    isResumeScrollRef.current = true
    isPinnedRef.current = true
    pendingScrollBehaviorRef.current = "auto"
    setIsResuming(false)
    setIsScrollPaused(false)
    setPausedTimeline(null)
  }, [])

  const stickToBottomIfPinned = React.useCallback(() => {
    if (!isPinnedRef.current || isResumeScrollRef.current) {
      return
    }

    scrollToEnd("auto")

    if (isScrollPausedRef.current) {
      setIsScrollPaused(false)
      setPausedTimeline(null)
    }
  }, [scrollToEnd])

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
      if (isResumeScrollRef.current || !isScrollPausedRef.current) {
        return
      }

      const chatContainer = chatContainerRef.current
      const alreadyAtPausedEnd =
        chatContainer !== null &&
        getDistanceFromBottom(chatContainer) <= NEAR_BOTTOM_PX

      if (behavior === "auto" || alreadyAtPausedEnd) {
        finishResumeScroll()
        return
      }

      isResumeScrollRef.current = true
      setIsResuming(true)
      markProgrammaticScroll(behavior)
      virtualizer.scrollToEnd({ behavior })
    },
    [finishResumeScroll, markProgrammaticScroll, virtualizer]
  )

  const handleChatScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const distanceFromBottom = getDistanceFromBottom(event.currentTarget)
      const isNearBottom = distanceFromBottom <= NEAR_BOTTOM_PX

      if (isResumeScrollRef.current) {
        if (isNearBottom) {
          if (isScrollPausedRef.current) {
            finishResumeScroll()
          } else {
            isResumeScrollRef.current = false
            isPinnedRef.current = true
          }
        }

        return
      }

      if (isProgrammaticScrollRef.current || ignoreScrollRef.current) {
        return
      }

      isPinnedRef.current = isNearBottom

      if (isNearBottom) {
        setIsScrollPaused(false)
        setPausedTimeline(null)
        return
      }

      setIsScrollPaused(true)
      setPausedTimeline((current) => current ?? timelineRef.current)
    },
    [finishResumeScroll]
  )

  React.useEffect(() => {
    const chatContainer = chatContainerRef.current
    if (!chatContainer || !isActive) {
      return
    }

    const cancelResumeScroll = () => {
      if (!isResumeScrollRef.current) {
        return
      }

      isResumeScrollRef.current = false
      isPinnedRef.current = false
      isProgrammaticScrollRef.current = false
      clearProgrammaticScroll()
      setIsResuming(false)
    }

    const onScrollEnd = () => {
      if (!isResumeScrollRef.current) {
        return
      }

      if (getDistanceFromBottom(chatContainer) > NEAR_BOTTOM_PX) {
        return
      }

      if (isScrollPausedRef.current) {
        finishResumeScroll()
        return
      }

      isResumeScrollRef.current = false
      isPinnedRef.current = true
    }

    chatContainer.addEventListener("wheel", cancelResumeScroll, {
      passive: true,
    })
    chatContainer.addEventListener("touchmove", cancelResumeScroll, {
      passive: true,
    })
    chatContainer.addEventListener("scrollend", onScrollEnd)

    return () => {
      chatContainer.removeEventListener("wheel", cancelResumeScroll)
      chatContainer.removeEventListener("touchmove", cancelResumeScroll)
      chatContainer.removeEventListener("scrollend", onScrollEnd)
    }
  }, [clearProgrammaticScroll, finishResumeScroll, isActive])

  const timelineScrollKey = React.useMemo(() => {
    if (timeline.length === 0) {
      return "empty"
    }

    const lastEntry = timeline[timeline.length - 1]
    return `${timeline.length}:${lastEntry.message.id}`
  }, [timeline])

  React.useLayoutEffect(() => {
    if (!isActive || isScrollPaused || displayedTimeline.length === 0) {
      return
    }

    syncListPadding()

    const behavior = pendingScrollBehaviorRef.current ?? "auto"
    pendingScrollBehaviorRef.current = null
    scrollToEnd(behavior)
  }, [
    displayedTimeline.length,
    isActive,
    isScrollPaused,
    scrollToEnd,
    syncListPadding,
    timelineScrollKey,
  ])

  const totalSize = virtualizer.getTotalSize()

  React.useLayoutEffect(() => {
    if (!isActive || isScrollPaused || displayedTimeline.length === 0) {
      return
    }

    if (syncListPadding()) {
      scrollToEnd("auto")
    }
  }, [
    displayedTimeline.length,
    isActive,
    isScrollPaused,
    listPaddingStart,
    scrollToEnd,
    syncListPadding,
    totalSize,
  ])

  React.useLayoutEffect(() => {
    const chatContainer = chatContainerRef.current
    if (
      !isActive ||
      displayedTimeline.length === 0 ||
      !chatContainer ||
      typeof ResizeObserver === "undefined"
    ) {
      return
    }

    const observer = new ResizeObserver(() => {
      syncListPadding()
      stickToBottomIfPinned()
    })

    observer.observe(chatContainer)

    return () => {
      observer.disconnect()
    }
  }, [
    displayedTimeline.length,
    isActive,
    stickToBottomIfPinned,
    syncListPadding,
  ])

  return {
    chatContainerRef,
    displayedTimeline,
    virtualizer,
    isScrollPaused: isScrollPaused && !isResuming,
    handleChatScroll,
    resumeScroll,
    notifyComposerResize,
  }
}
