"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

const TooltipResetContext = React.createContext<{
  resetCounter: number
  suppressUntilMs: number
}>({ resetCounter: 0, suppressUntilMs: 0 })

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  const [resetCounter, setResetCounter] = React.useState(0)
  const [suppressUntilMs, setSuppressUntilMs] = React.useState(0)

  React.useEffect(() => {
    const reset = (suppressMs = 0) => {
      setResetCounter((current) => current + 1)
      if (suppressMs > 0) {
        setSuppressUntilMs(Date.now() + suppressMs)
      }
    }

    // When the tab becomes active again, focused elements can immediately
    // trigger tooltips (focus-open). Close and briefly suppress re-open.
    const onBlur = () => reset()
    const onFocus = () => reset(250)
    window.addEventListener("blur", onBlur)
    window.addEventListener("focus", onFocus)
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        reset()
        return
      }
      if (document.visibilityState === "visible") {
        reset(250)
      }
    }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      window.removeEventListener("blur", onBlur)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  return (
    <TooltipResetContext.Provider value={{ resetCounter, suppressUntilMs }}>
      <TooltipPrimitive.Provider
        data-slot="tooltip-provider"
        delayDuration={delayDuration}
        {...props}
      />
    </TooltipResetContext.Provider>
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const { resetCounter, suppressUntilMs } = React.useContext(TooltipResetContext)
  const isControlled = props.open !== undefined
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    if (isControlled) {
      if (!props.open) return
      // Force-close controlled tooltips (sidebar channel buttons) when tab/window changes
      // so they don't remain stuck open.
      props.onOpenChange?.(false)
      return
    }

    // Close uncontrolled tooltips without remounting their children. Remounting would
    // reload lazy images (e.g. Twitch emotes in chat) and abort in-flight requests.
    setOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isControlled, resetCounter])

  const handleOpenChange = (next: boolean) => {
    if (next && Date.now() < suppressUntilMs) {
      if (isControlled) {
        props.onOpenChange?.(false)
      } else {
        setOpen(false)
        props.onOpenChange?.(false)
      }
      return
    }

    if (isControlled) {
      props.onOpenChange?.(next)
      return
    }

    setOpen(next)
    props.onOpenChange?.(next)
  }

  if (isControlled) {
    const { open: _open, onOpenChange: _onOpenChange, ...rest } = props
    return (
      <TooltipPrimitive.Root
        data-slot="tooltip"
        {...rest}
        open={props.open}
        onOpenChange={handleOpenChange}
      />
    )
  }

  return (
    <TooltipPrimitive.Root
      data-slot="tooltip"
      {...props}
      open={open}
      onOpenChange={handleOpenChange}
    />
  )
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 inline-flex w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
