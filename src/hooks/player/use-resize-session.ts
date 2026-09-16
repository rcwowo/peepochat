import * as React from "react"

import { ResizeActivityContext } from "@/lib/player/resize-activity-context"

export function useResizeActivity() {
  return React.useContext(ResizeActivityContext)
}

type ResizeSessionOptions<T> = {
  event: React.PointerEvent<HTMLElement>
  initialValue: T
  getValue: (event: PointerEvent) => T
  onPreview: (value: T) => void
  onCommit: (value: T) => void
  onCancel: () => void
}

export function usePointerResizeSession<T>() {
  const [active, setActive] = React.useState(false)
  const mountedRef = React.useRef(true)
  const stopRef = React.useRef<((commit: boolean) => void) | null>(null)
  const activateFrameRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (activateFrameRef.current !== null) {
        window.cancelAnimationFrame(activateFrameRef.current)
        activateFrameRef.current = null
      }
      stopRef.current?.(false)
    }
  }, [])

  const start = React.useCallback((options: ResizeSessionOptions<T>) => {
    stopRef.current?.(false)

    const target = options.event.currentTarget
    const pointerId = options.event.pointerId
    let latestValue = options.initialValue
    let frameId: number | null = null
    let finished = false
    let recaptureAttempts = 0

    const previewLatest = () => {
      frameId = null
      options.onPreview(latestValue)
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) {
        return
      }

      latestValue = options.getValue(event)
      if (frameId === null) {
        frameId = window.requestAnimationFrame(previewLatest)
      }
    }

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerCancel)
      window.removeEventListener("blur", handleBlur)
      target.removeEventListener("lostpointercapture", handleLostPointerCapture)
      if (activateFrameRef.current !== null) {
        window.cancelAnimationFrame(activateFrameRef.current)
        activateFrameRef.current = null
      }
    }

    const finish = (commit: boolean) => {
      if (finished) {
        return
      }

      finished = true
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
        frameId = null
      }
      cleanup()
      stopRef.current = null

      if (target.hasPointerCapture(pointerId)) {
        target.releasePointerCapture(pointerId)
      }

      if (mountedRef.current) {
        setActive(false)
      }

      if (commit) {
        options.onPreview(latestValue)
        options.onCommit(latestValue)
      } else {
        options.onCancel()
      }
    }

    function handlePointerUp(event: PointerEvent) {
      if (event.pointerId === pointerId) {
        finish(true)
      }
    }

    function handlePointerCancel(event: PointerEvent) {
      if (event.pointerId === pointerId) {
        finish(false)
      }
    }

    function handleLostPointerCapture(event: PointerEvent) {
      if (event.pointerId !== pointerId || finished) {
        return
      }

      if (target.isConnected && recaptureAttempts < 3) {
        recaptureAttempts += 1
        try {
          target.setPointerCapture(pointerId)
          return
        } catch {
          finish(false)
          return
        }
      }

      finish(false)
    }

    function handleBlur() {
      finish(false)
    }

    options.event.preventDefault()
    options.event.stopPropagation()
    target.focus()
    target.setPointerCapture(pointerId)
    window.addEventListener("pointermove", handlePointerMove, { passive: true })
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerCancel)
    window.addEventListener("blur", handleBlur)
    target.addEventListener("lostpointercapture", handleLostPointerCapture)
    stopRef.current = finish
    activateFrameRef.current = window.requestAnimationFrame(() => {
      activateFrameRef.current = null
      if (!finished && mountedRef.current) {
        setActive(true)
      }
    })
  }, [])

  return { active, start }
}
