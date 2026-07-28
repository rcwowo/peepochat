import * as React from "react"

import { Button } from "@/components/ui/button"
import { COMPOSER_NOTICE_AUTO_DISMISS_MS } from "@/lib/chat/chat-send-notice"

type ComposerNoticeBannerProps = {
  noticeId: string
  message: string
  queueCount: number
  chatVisible: boolean
  onDismiss: () => void
}

function NoticeTimerRing({ progress }: { progress: number }) {
  const size = 14
  const stroke = 1.5
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * Math.min(Math.max(progress, 0), 1)

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="size-3.5 shrink-0 -rotate-90 text-muted-foreground"
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.25}
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  )
}

function ComposerNoticeTimer({
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

  return <NoticeTimerRing progress={progress} />
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
      className="flex items-center gap-2 border-b border-border/50 px-2.5 py-1.5"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <ComposerNoticeTimer
        key={noticeId}
        noticeId={noticeId}
        chatVisible={chatVisible}
        hovered={hovered}
        pageVisible={pageVisible}
        onDismiss={onDismiss}
      />
      <p className="min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground">
        {message}
      </p>
      {queueCount > 1 ? (
        <span className="shrink-0 text-[11px] text-muted-foreground/70 tabular-nums">
          1/{queueCount}
        </span>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="h-5 shrink-0 px-2 text-[11px]"
        onClick={onDismiss}
      >
        Dismiss
      </Button>
    </div>
  )
}
