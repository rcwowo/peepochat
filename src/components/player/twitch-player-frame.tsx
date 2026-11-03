import * as React from "react"

import {
  TWITCH_PLAYER_ORIGIN,
  buildTwitchPlayerUrl,
  parseTwitchPlayerMessage,
  sendTwitchPlayerMuted,
} from "@/lib/player/twitch-player"
import { cn } from "@/lib/utils"

const PLAYER_READY_EVENTS = new Set(["ready", "video.ready"])

export function TwitchPlayerFrame({
  login,
  title,
  initialMuted,
  muted,
  onMutedChange,
  frozen = false,
  className,
}: {
  login: string
  title: string
  initialMuted: boolean
  muted?: boolean
  onMutedChange?: (muted: boolean) => void
  frozen?: boolean
  className?: string
}) {
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null)
  const [src] = React.useState(() =>
    buildTwitchPlayerUrl(login, { muted: muted ?? initialMuted })
  )
  const mutedRef = React.useRef(muted)
  const onMutedChangeRef = React.useRef(onMutedChange)
  const reportedMutedRef = React.useRef<boolean | null>(null)
  const syncedRef = React.useRef(false)

  React.useLayoutEffect(() => {
    mutedRef.current = muted
    onMutedChangeRef.current = onMutedChange
  })

  React.useEffect(() => {
    if (muted === undefined) return
    sendTwitchPlayerMuted(iframeRef.current?.contentWindow, muted)
  }, [muted])

  React.useEffect(() => {
    const enforceMuted = () => {
      const target = mutedRef.current
      if (target !== undefined) {
        sendTwitchPlayerMuted(iframeRef.current?.contentWindow, target)
      }
    }

    const handleMessage = (event: MessageEvent) => {
      const frameWindow = iframeRef.current?.contentWindow
      if (
        !frameWindow ||
        event.source !== frameWindow ||
        event.origin !== TWITCH_PLAYER_ORIGIN
      ) {
        return
      }

      const message = parseTwitchPlayerMessage(event.data)
      if (!message) return

      if (message.kind === "event") {
        if (PLAYER_READY_EVENTS.has(message.name)) {
          enforceMuted()
        }
        return
      }

      if (!syncedRef.current) {
        syncedRef.current = true
        enforceMuted()
      }

      if (
        message.muted !== null &&
        reportedMutedRef.current !== message.muted
      ) {
        reportedMutedRef.current = message.muted
        onMutedChangeRef.current?.(message.muted)
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [])

  React.useLayoutEffect(() => {
    const iframe = iframeRef.current
    if (!iframe || !frozen) return

    const rect = iframe.getBoundingClientRect()
    iframe.style.width = `${rect.width}px`
    iframe.style.height = `${rect.height}px`
    return () => {
      iframe.style.removeProperty("width")
      iframe.style.removeProperty("height")
    }
  }, [frozen])

  if (!src) {
    return null
  }

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={title}
      allow="autoplay; fullscreen"
      allowFullScreen
      className={cn("size-full border-0", className)}
      onLoad={() => {
        syncedRef.current = false
      }}
    />
  )
}
