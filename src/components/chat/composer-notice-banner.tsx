import * as React from "react"
import { InfoIcon, XIcon } from "lucide-react"

import { COMPOSER_NOTICE_AUTO_DISMISS_MS } from "@/lib/chat/chat-send-notice"
import { cn } from "@/lib/utils"

type ComposerNoticeBannerProps = {
  noticeId: string
  message: string
  queueCount: number
  chatVisible: boolean
  onDismiss: () => void
}

function DismissTimerButton({
  noticeId,
  chatVisible,
  hovered,
  pageVisible,
  onDismiss,
}: {
  noticeId: string
  chatVisible: boolean
  hovered: boolean
  pageVisible: boolean
  onDismiss: () => void
}) {
  const [progress, setProgress] = React.useState(0)
  const onDismissRef = React.useRef(onDismiss)
  const timerActiveRef = React.useRef(false)

  React.useLayoutEffect(() => {
    onDismissRef.current = onDismiss
  })

  React.useLayoutEffect(() => {
    timerActiveRef.current = chatVisible && pageVisible && !hovered
  }, [chatVisible, hovered, pageVisible])

  React.useEffect(() => {
    let elapsed = 0
    let last = performance.now()
    let frame = 0

    const tick = (now: number) => {
      const delta = now - last
      last = now

      if (timerActiveRef.current) {
        elapsed += delta

        if (elapsed >= COMPOSER_NOTICE_AUTO_DISMISS_MS) {
          onDismissRef.current()
          return
        }

        setProgress(elapsed / COMPOSER_NOTICE_AUTO_DISMISS_MS)
      }

      frame = window.requestAnimationFrame(tick)
    }

    frame = window.requestAnimationFrame(tick)
    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [noticeId])

  const size = hovered ? 18 : 14
  const stroke = hovered ? 1.5 : 1.25
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * Math.min(Math.max(progress, 0), 1)

  return (
    <button
      type="button"
      aria-label="Dismiss notice"
      onClick={onDismiss}
      className={cn(
        "relative flex shrink-0 cursor-pointer items-center justify-center rounded-full",
        "text-muted-foreground transition-[color,width,height] duration-150 hover:text-foreground",
        hovered ? "size-[18px]" : "size-3.5"
      )}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 m-auto -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="stroke-border"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="stroke-muted-foreground"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <XIcon
        className={cn(
          "relative transition-opacity duration-150",
          hovered ? "size-2.5 opacity-100" : "size-2.5 opacity-0"
        )}
        strokeWidth={2.5}
      />
    </button>
  )
}

export function ComposerNoticeBanner({
  noticeId,
  message,
  queueCount,
  chatVisible,
  onDismiss,
}: ComposerNoticeBannerProps) {
  const [hovered, setHovered] = React.useState(false)
  const [pageVisible, setPageVisible] = React.useState(
    () =>
      typeof document === "undefined" || document.visibilityState === "visible"
  )

  React.useEffect(() => {
    const onVisibility = () => {
      setPageVisible(document.visibilityState === "visible")
    }

    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  return (
    <div
      className="absolute inset-x-0 bottom-full z-0 -mb-3 rounded-t-lg border border-b-0 border-border/50 bg-background/80 backdrop-blur-sm dark:bg-background/50"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={cn(
          "flex items-center gap-1.5 px-2 transition-[min-height] duration-150",
          hovered ? "min-h-7" : "min-h-[22px]"
        )}
      >
        <InfoIcon
          className="size-3 shrink-0 text-muted-foreground/70"
          strokeWidth={2}
          aria-hidden="true"
        />
        <p className="min-w-0 flex-1 text-[11px] leading-tight text-muted-foreground">
          {message}
        </p>
        {queueCount > 1 ? (
          <span className="shrink-0 text-[10px] text-muted-foreground/70 tabular-nums">
            1/{queueCount}
          </span>
        ) : null}
        <DismissTimerButton
          key={noticeId}
          noticeId={noticeId}
          chatVisible={chatVisible}
          hovered={hovered}
          pageVisible={pageVisible}
          onDismiss={onDismiss}
        />
      </div>
      <div aria-hidden="true" className="h-3" />
    </div>
  )
}
