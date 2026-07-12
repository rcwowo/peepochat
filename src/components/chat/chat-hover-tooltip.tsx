import * as React from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"

type ChatHoverTooltipContextValue = {
  show: (anchor: HTMLElement, content: React.ReactNode, className?: string) => void
  hide: (anchor: HTMLElement) => void
}

const ChatHoverTooltipContext =
  React.createContext<ChatHoverTooltipContextValue | null>(null)

type ActiveTooltip = {
  anchor: HTMLElement
  content: React.ReactNode
  className?: string
}

function isAnchorVisible(anchor: HTMLElement) {
  if (!anchor.isConnected) {
    return false
  }

  const rect = anchor.getBoundingClientRect()
  return (
    rect.bottom > 0 &&
    rect.top < window.innerHeight &&
    rect.right > 0 &&
    rect.left < window.innerWidth
  )
}

function ChatHoverTooltipLayer({
  active,
  onDismiss,
}: {
  active: ActiveTooltip
  onDismiss: () => void
}) {
  const tooltipRef = React.useRef<HTMLDivElement>(null)

  const applyPosition = React.useCallback(() => {
    const tooltip = tooltipRef.current
    if (!tooltip) {
      return
    }

    if (!isAnchorVisible(active.anchor)) {
      onDismiss()
      return
    }

    const anchorRect = active.anchor.getBoundingClientRect()
    tooltip.style.left = `${anchorRect.left + anchorRect.width / 2}px`
    tooltip.style.top = `${anchorRect.top - 4}px`
    tooltip.style.visibility = "visible"
  }, [active.anchor, onDismiss])

  const setTooltipRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      tooltipRef.current = node
      if (node) {
        applyPosition()
      }
    },
    [applyPosition]
  )

  React.useEffect(() => {
    applyPosition()
    window.addEventListener("scroll", applyPosition, { capture: true })
    window.addEventListener("resize", applyPosition)
    return () => {
      window.removeEventListener("scroll", applyPosition, { capture: true })
      window.removeEventListener("resize", applyPosition)
    }
  }, [applyPosition, active.content, active.className])

  return createPortal(
    <div
      ref={setTooltipRef}
      role="tooltip"
      style={{
        position: "fixed",
        transform: "translate(-50%, -100%)",
        visibility: "hidden",
      }}
      className={cn(
        "pointer-events-none z-50 inline-flex w-fit max-w-xs origin-center items-center gap-1.5 rounded-md bg-foreground text-xs text-background",
        active.className
      )}
    >
      {active.content}
    </div>,
    document.body
  )
}

export function ChatHoverTooltipProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [active, setActive] = React.useState<ActiveTooltip | null>(null)

  const show = React.useCallback(
    (anchor: HTMLElement, content: React.ReactNode, className?: string) => {
      setActive({ anchor, content, className })
    },
    []
  )

  const hide = React.useCallback((anchor: HTMLElement) => {
    setActive((current) => (current?.anchor === anchor ? null : current))
  }, [])

  const contextValue = React.useMemo(
    () => ({ show, hide }),
    [show, hide]
  )

  return (
    <ChatHoverTooltipContext.Provider value={contextValue}>
      {children}
      {active ? (
        <ChatHoverTooltipLayer
          active={active}
          onDismiss={() => setActive(null)}
        />
      ) : null}
    </ChatHoverTooltipContext.Provider>
  )
}

type ChatHoverTooltipTargetProps = {
  content: React.ReactNode
  tooltipClassName?: string
  children: React.ReactNode
  className?: string
  onClick?: React.MouseEventHandler<HTMLSpanElement>
  onContextMenu?: React.MouseEventHandler<HTMLSpanElement>
  ref?: React.Ref<HTMLSpanElement>
}

export function ChatHoverTooltipTarget({
  content,
  tooltipClassName,
  children,
  className,
  onClick,
  onContextMenu,
  ref,
}: ChatHoverTooltipTargetProps) {
  const context = React.useContext(ChatHoverTooltipContext)
  const anchorRef = React.useRef<HTMLSpanElement>(null)
  const setAnchorRef = React.useCallback(
    (node: HTMLSpanElement | null) => {
      anchorRef.current = node
      if (typeof ref === "function") {
        ref(node)
        return
      }
      if (ref) {
        ref.current = node
      }
    },
    [ref]
  )

  const handlePointerEnter = React.useCallback(() => {
    const anchor = anchorRef.current
    if (!context || !anchor) {
      return
    }

    context.show(anchor, content, tooltipClassName)
  }, [content, context, tooltipClassName])

  const handlePointerLeave = React.useCallback(() => {
    const anchor = anchorRef.current
    if (!context || !anchor) {
      return
    }

    context.hide(anchor)
  }, [context])

  if (!context) {
    return (
      <span className={className} onClick={onClick} onContextMenu={onContextMenu}>
        {children}
      </span>
    )
  }

  return (
    <span
      ref={setAnchorRef}
      className={className}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {children}
    </span>
  )
}
