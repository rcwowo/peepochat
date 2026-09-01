import * as React from "react"

import { ResizeActivityContext } from "@/lib/resize-activity-context"
import { cn } from "@/lib/utils"

const DIVIDER_HIT_AREA_PX = 11

export function ResizeActivityProvider({
  active,
  children,
}: {
  active: boolean
  children: React.ReactNode
}) {
  const parentActive = React.useContext(ResizeActivityContext)
  return (
    <ResizeActivityContext.Provider value={parentActive || active}>
      {children}
    </ResizeActivityContext.Provider>
  )
}

export function ResizeSeparator({
  direction,
  label,
  valueMin,
  valueMax,
  valueNow,
  onPointerDown,
  onKeyDown,
  onDoubleClick,
}: {
  direction: "row" | "column"
  label: string
  valueMin?: number
  valueMax?: number
  valueNow?: number
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void
  onDoubleClick: (event: React.MouseEvent<HTMLDivElement>) => void
}) {
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={direction === "row" ? "vertical" : "horizontal"}
      aria-valuemin={valueMin}
      aria-valuemax={valueMax}
      aria-valuenow={valueNow}
      className={cn(
        "group relative z-20 shrink-0 touch-none bg-border transition-colors outline-none hover:bg-primary/60 focus-visible:bg-primary/60",
        direction === "row"
          ? "h-full w-px cursor-col-resize"
          : "h-px w-full cursor-row-resize"
      )}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={onDoubleClick}
    >
      <div
        className={cn(
          "absolute bg-transparent",
          direction === "row"
            ? "inset-y-0 left-1/2 -translate-x-1/2"
            : "inset-x-0 top-1/2 -translate-y-1/2"
        )}
        style={
          direction === "row"
            ? { width: DIVIDER_HIT_AREA_PX }
            : { height: DIVIDER_HIT_AREA_PX }
        }
      />
    </div>
  )
}
