import * as React from "react"
import {
  elementScroll,
  useVirtualizer,
  type Virtualizer,
} from "@tanstack/react-virtual"

import {
  estimateTimelineItemSize,
  type ChatListLayout,
} from "@/lib/chat/chat-message-layout"
import type { TwitchTimelineItem } from "@/lib/twitch/twitch-chat-types"

const NEAR_BOTTOM_PX = 24
const STICK_TO_END_PX = 1
const LIST_EDGE_PADDING_PX = 4
const USER_SCROLL_INTENT_PX = 2

export type ChatScrollLayout = Omit<
  ChatListLayout,
  "viewportWidth" | "fontFamily"
>

function readChatViewport(el: HTMLElement | null) {
  if (!el) {
    return { width: 0, fontFamily: "" }
  }

  return {
    width: el.clientWidth,
    fontFamily: getComputedStyle(el).fontFamily,
  }
}

function getDistanceFromBottom(el: HTMLElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight
}

function isVerticalScrollbarInteraction(event: PointerEvent, el: HTMLElement) {
  return event.clientX - el.getBoundingClientRect().left >= el.clientWidth
}

export function useChatScroll<T extends TwitchTimelineItem>({
  timeline,
  channelLogin,
  layout,
  active = true,
}: {
  timeline: T[]
  channelLogin: string
  layout: ChatScrollLayout
  active?: boolean
}) {
  const chatContainerRef = React.useRef<HTMLDivElement>(null)
  const isProgrammaticScrollRef = React.useRef(false)
  const ignoreScrollRef = React.useRef(false)
  const isPinnedRef = React.useRef(true)
  const isResumeScrollRef = React.useRef(false)
  const isScrollPausedRef = React.useRef(false)
  const programmaticScrollClearRef = React.useRef<number | null>(null)
  const ignoreScrollClearRef = React.useRef<number | null>(null)
  const pinnedScrollSettleRafRef = React.useRef<number | null>(null)
  const timelineRef = React.useRef(timeline)
  const pendingScrollBehaviorRef = React.useRef<ScrollBehavior | null>(null)
  const listPaddingStartRef = React.useRef(LIST_EDGE_PADDING_PX)
  const lastScrollTopRef = React.useRef(0)
  const touchStartYRef = React.useRef<number | null>(null)
  const userPauseIntentRef = React.useRef(false)
  const [isScrollPaused, setIsScrollPaused] = React.useState(false)
  const [isResuming, setIsResuming] = React.useState(false)
  const [pausedTimeline, setPausedTimeline] = React.useState<T[] | null>(null)
  const [pausedForChannel, setPausedForChannel] = React.useState(channelLogin)
  const [listPaddingStart, setListPaddingStart] =
    React.useState(LIST_EDGE_PADDING_PX)
  const [viewportWidth, setViewportWidth] = React.useState(0)
  const [fontFamily, setFontFamily] = React.useState("")

  const listLayout = React.useMemo<ChatListLayout>(
    () => ({
      ...layout,
      viewportWidth,
      fontFamily,
    }),
    [fontFamily, layout, viewportWidth]
  )
  const listLayoutRef = React.useRef(listLayout)
  listLayoutRef.current = listLayout

  if (pausedForChannel !== channelLogin) {
    setPausedForChannel(channelLogin)
    setIsScrollPaused(false)
    setIsResuming(false)
    setPausedTimeline(null)
    isPinnedRef.current = true
    isResumeScrollRef.current = false
    isScrollPausedRef.current = false
    userPauseIntentRef.current = false
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

  const clearPinnedScrollSettle = React.useCallback(() => {
    if (pinnedScrollSettleRafRef.current !== null) {
      window.cancelAnimationFrame(pinnedScrollSettleRafRef.current)
      pinnedScrollSettleRafRef.current = null
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

  const pauseForUserScroll = React.useCallback(() => {
    clearPinnedScrollSettle()

    if (isResumeScrollRef.current) {
      isResumeScrollRef.current = false
      isProgrammaticScrollRef.current = false
      clearProgrammaticScroll()
      setIsResuming(false)
    }

    isPinnedRef.current = false

    if (isScrollPausedRef.current) {
      return
    }

    isScrollPausedRef.current = true
    setIsScrollPaused(true)
    setPausedTimeline((current) => current ?? timelineRef.current)
  }, [clearPinnedScrollSettle, clearProgrammaticScroll])

  const scrollToFn = React.useCallback(
    (
      offset: number,
      options: { adjustments?: number; behavior?: ScrollBehavior },
      instance: Virtualizer<HTMLDivElement, Element>
    ) => {
      if (options.adjustments == null || options.adjustments === 0) {
        markProgrammaticScroll(
          options.behavior === "smooth" ? "smooth" : "auto"
        )
      }
      elementScroll(offset, options, instance)
    },
    [markProgrammaticScroll]
  )

  const getItemKey = React.useCallback(
    (index: number) => displayedTimeline[index]?.message.id ?? index,
    [displayedTimeline]
  )

  const estimateSize = React.useCallback(
    (index: number) =>
      estimateTimelineItemSize(displayedTimeline[index], listLayoutRef.current),
    [displayedTimeline]
  )

  /* React will skip memoizing this hook because of the useVirtualizer hook */
  /* eslint-disable-next-line react-hooks/incompatible-library */
  const virtualizer = useVirtualizer({
    count: displayedTimeline.length,
    getScrollElement: () => chatContainerRef.current,
    estimateSize,
    getItemKey,
    scrollToFn,
    anchorTo: isScrollPaused ? "start" : "end",
    followOnAppend: !isScrollPaused,
    scrollEndThreshold: STICK_TO_END_PX,
    overscan: 8,
    paddingStart: listPaddingStart,
    paddingEnd: LIST_EDGE_PADDING_PX,
    enabled: active && displayedTimeline.length > 0,
  })

  const scrollToEnd = React.useCallback(
    (behavior: ScrollBehavior = "auto") => {
      isPinnedRef.current = true
      markProgrammaticScroll(behavior)
      virtualizer.scrollToEnd({ behavior })
    },
    [markProgrammaticScroll, virtualizer]
  )

  const schedulePinnedScrollSettle = React.useCallback(() => {
    clearPinnedScrollSettle()
    pinnedScrollSettleRafRef.current = window.requestAnimationFrame(() => {
      pinnedScrollSettleRafRef.current = window.requestAnimationFrame(() => {
        pinnedScrollSettleRafRef.current = null
        if (
          !isPinnedRef.current ||
          isResumeScrollRef.current ||
          isScrollPausedRef.current
        ) {
          return
        }
        scrollToEnd("auto")
      })
    })
  }, [clearPinnedScrollSettle, scrollToEnd])

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
    userPauseIntentRef.current = false
    isScrollPausedRef.current = false
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
    schedulePinnedScrollSettle()

    if (isScrollPausedRef.current) {
      userPauseIntentRef.current = false
      isScrollPausedRef.current = false
      setIsScrollPaused(false)
      setPausedTimeline(null)
    }
  }, [schedulePinnedScrollSettle, scrollToEnd])

  const notifyComposerResize = React.useCallback(() => {
    stickToBottomIfPinned()
  }, [stickToBottomIfPinned])

  React.useEffect(() => {
    return () => {
      clearProgrammaticScroll()
      clearIgnoreScroll()
      clearPinnedScrollSettle()
    }
  }, [clearIgnoreScroll, clearPinnedScrollSettle, clearProgrammaticScroll])

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
      const chatContainer = event.currentTarget
      const scrollTop = chatContainer.scrollTop
      const scrollingUp = scrollTop < lastScrollTopRef.current
      lastScrollTopRef.current = scrollTop

      const distanceFromBottom = getDistanceFromBottom(chatContainer)
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

      if (isNearBottom) {
        if (isScrollPausedRef.current) {
          if (!scrollingUp) {
            userPauseIntentRef.current = false
            isPinnedRef.current = true
            isScrollPausedRef.current = false
            setIsScrollPaused(false)
            setPausedTimeline(null)
          }
          return
        }

        if (scrollingUp && userPauseIntentRef.current) {
          pauseForUserScroll()
          return
        }

        isPinnedRef.current = true
        return
      }

      pauseForUserScroll()
    },
    [finishResumeScroll, pauseForUserScroll]
  )

  React.useEffect(() => {
    const chatContainer = chatContainerRef.current
    if (!chatContainer) {
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

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) {
        userPauseIntentRef.current = true
        pauseForUserScroll()
        return
      }

      cancelResumeScroll()
    }

    const onTouchStart = (event: TouchEvent) => {
      touchStartYRef.current = event.touches[0]?.clientY ?? null
    }

    const onTouchMove = (event: TouchEvent) => {
      const startY = touchStartYRef.current
      const currentY = event.touches[0]?.clientY
      if (
        startY != null &&
        currentY != null &&
        currentY - startY > USER_SCROLL_INTENT_PX
      ) {
        userPauseIntentRef.current = true
        pauseForUserScroll()
        return
      }

      cancelResumeScroll()
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!isVerticalScrollbarInteraction(event, chatContainer)) {
        return
      }

      userPauseIntentRef.current = true
      pauseForUserScroll()
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

    chatContainer.addEventListener("wheel", onWheel, { passive: true })
    chatContainer.addEventListener("touchstart", onTouchStart, {
      passive: true,
    })
    chatContainer.addEventListener("touchmove", onTouchMove, {
      passive: true,
    })
    chatContainer.addEventListener("pointerdown", onPointerDown)
    chatContainer.addEventListener("scrollend", onScrollEnd)

    return () => {
      chatContainer.removeEventListener("wheel", onWheel)
      chatContainer.removeEventListener("touchstart", onTouchStart)
      chatContainer.removeEventListener("touchmove", onTouchMove)
      chatContainer.removeEventListener("pointerdown", onPointerDown)
      chatContainer.removeEventListener("scrollend", onScrollEnd)
    }
  }, [clearProgrammaticScroll, finishResumeScroll, pauseForUserScroll])

  const timelineScrollKey = React.useMemo(() => {
    if (timeline.length === 0) {
      return "empty"
    }

    const lastEntry = timeline[timeline.length - 1]
    return `${timeline.length}:${lastEntry.message.id}`
  }, [timeline])

  React.useLayoutEffect(() => {
    if (
      !active ||
      isScrollPaused ||
      !isPinnedRef.current ||
      displayedTimeline.length === 0
    ) {
      return
    }

    syncListPadding()

    const behavior = pendingScrollBehaviorRef.current ?? "auto"
    pendingScrollBehaviorRef.current = null
    scrollToEnd(behavior)
    if (behavior === "auto") {
      schedulePinnedScrollSettle()
    }
  }, [
    active,
    displayedTimeline.length,
    isScrollPaused,
    schedulePinnedScrollSettle,
    scrollToEnd,
    syncListPadding,
    timelineScrollKey,
  ])

  const totalSize = virtualizer.getTotalSize()

  React.useLayoutEffect(() => {
    if (!active || isScrollPaused || displayedTimeline.length === 0) {
      return
    }

    syncListPadding()
    stickToBottomIfPinned()
  }, [
    active,
    displayedTimeline.length,
    isScrollPaused,
    listPaddingStart,
    stickToBottomIfPinned,
    syncListPadding,
    totalSize,
  ])

  React.useLayoutEffect(() => {
    if (!active) {
      return
    }

    const viewport = readChatViewport(chatContainerRef.current)
    setViewportWidth((current) =>
      current === viewport.width ? current : viewport.width
    )
    setFontFamily((current) =>
      current === viewport.fontFamily ? current : viewport.fontFamily
    )
  }, [active, displayedTimeline.length])

  React.useLayoutEffect(() => {
    if (!active) {
      return
    }
    virtualizer.measure()
  }, [
    active,
    layout.messageSeparators,
    layout.metrics.emoteSizePx,
    layout.metrics.fontSizePx,
    layout.metrics.lineHeightPx,
    layout.metrics.rowPaddingY,
    layout.showTwitchBadges,
    layout.timestampFormat,
    viewportWidth,
    virtualizer,
  ])

  React.useLayoutEffect(() => {
    const chatContainer = chatContainerRef.current
    if (
      !active ||
      displayedTimeline.length === 0 ||
      !chatContainer ||
      typeof ResizeObserver === "undefined"
    ) {
      return
    }

    const observer = new ResizeObserver(() => {
      const viewport = readChatViewport(chatContainer)
      setViewportWidth((current) =>
        current === viewport.width ? current : viewport.width
      )
      setFontFamily((current) =>
        current === viewport.fontFamily ? current : viewport.fontFamily
      )
      syncListPadding()
      stickToBottomIfPinned()
    })

    observer.observe(chatContainer)

    return () => {
      observer.disconnect()
    }
  }, [active, displayedTimeline.length, stickToBottomIfPinned, syncListPadding])

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
