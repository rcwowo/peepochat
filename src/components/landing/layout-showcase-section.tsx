import * as React from "react"
import { Columns2Icon, LayoutGridIcon, MoveIcon } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { useIntersectionVisible } from "@/hooks/use-intersection-visible"
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import { LANDING_CHANNELS } from "@/lib/landing/landing-channels"
import { cn } from "@/lib/utils"

type PaneId = "a" | "b" | "c"

type LayoutNode =
  | { type: "pane"; id: PaneId }
  | {
      type: "split"
      direction: "row" | "column"
      children: { node: LayoutNode; size: number }[]
    }

type Rect = {
  x: number
  y: number
  width: number
  height: number
}

type Divider = Rect & {
  id: string
  direction: "row" | "column"
}

type FrameMetrics = {
  paneRects: Map<PaneId, Rect>
  dividers: Divider[]
  paneOpacity: Map<PaneId, number>
  dragGhost: {
    paneId: PaneId
    rect: Rect
    opacity: number
  } | null
  activeDividerId: string | null
}

const PANES: Record<PaneId, { displayName: string; profileImageUrl: string }> =
  {
    a: LANDING_CHANNELS.rcwOwO,
    b: LANDING_CHANNELS.dhinkha,
    c: LANDING_CHANNELS.toastercat,
  }

const SKELETON_LINE_WIDTHS = [
  0.78, 0.62, 0.88, 0.54, 0.71, 0.48, 0.83, 0.59, 0.67, 0.52, 0.74, 0.61,
] as const

// Header is h-7; center of drag handle as a fraction of pane height.
const PANE_HEADER_CENTER_Y = 0.038

const LAYOUT_HORIZONTAL: LayoutNode = {
  type: "split",
  direction: "row",
  children: [
    { node: { type: "pane", id: "a" }, size: 50 },
    { node: { type: "pane", id: "b" }, size: 50 },
  ],
}

const LAYOUT_HORIZONTAL_RESIZED: LayoutNode = {
  type: "split",
  direction: "row",
  children: [
    { node: { type: "pane", id: "a" }, size: 68 },
    { node: { type: "pane", id: "b" }, size: 32 },
  ],
}

const LAYOUT_VERTICAL: LayoutNode = {
  type: "split",
  direction: "column",
  children: [
    { node: { type: "pane", id: "a" }, size: 50 },
    { node: { type: "pane", id: "b" }, size: 50 },
  ],
}

// Vertical stack on the left, toastercat_ on the right — equal halves.
const LAYOUT_COLUMN_C: LayoutNode = {
  type: "split",
  direction: "row",
  children: [
    {
      node: {
        type: "split",
        direction: "column",
        children: [
          { node: { type: "pane", id: "a" }, size: 50 },
          { node: { type: "pane", id: "b" }, size: 50 },
        ],
      },
      size: 50,
    },
    { node: { type: "pane", id: "c" }, size: 50 },
  ],
}

const LAYOUT_COLUMN_C_RESIZED: LayoutNode = {
  type: "split",
  direction: "row",
  children: [
    {
      node: {
        type: "split",
        direction: "column",
        children: [
          { node: { type: "pane", id: "a" }, size: 72 },
          { node: { type: "pane", id: "b" }, size: 28 },
        ],
      },
      size: 50,
    },
    { node: { type: "pane", id: "c" }, size: 50 },
  ],
}

const LAYOUT_ROW_ABC: LayoutNode = {
  type: "split",
  direction: "row",
  children: [
    { node: { type: "pane", id: "a" }, size: 34 },
    { node: { type: "pane", id: "b" }, size: 33 },
    { node: { type: "pane", id: "c" }, size: 33 },
  ],
}

type Phase =
  | {
      kind: "hold"
      layout: LayoutNode
      duration: number
    }
  | {
      kind: "resize"
      from: LayoutNode
      to: LayoutNode
      duration: number
      dividerId: string
    }
  | {
      kind: "drag"
      from: LayoutNode
      to: LayoutNode
      paneId: PaneId
      duration: number
    }
  | {
      kind: "add-pane"
      from: LayoutNode
      to: LayoutNode
      paneId: PaneId
      duration: number
    }
  | {
      kind: "remove-pane"
      from: LayoutNode
      to: LayoutNode
      paneId: PaneId
      duration: number
    }

const PHASES: Phase[] = [
  // 1. Side by side — resize demo
  { kind: "hold", layout: LAYOUT_HORIZONTAL, duration: 1800 },
  {
    kind: "resize",
    from: LAYOUT_HORIZONTAL,
    to: LAYOUT_HORIZONTAL_RESIZED,
    duration: 1800,
    dividerId: "root.0",
  },
  { kind: "hold", layout: LAYOUT_HORIZONTAL_RESIZED, duration: 1000 },
  // 2. Dhinkha under rcwOwO
  {
    kind: "drag",
    from: LAYOUT_HORIZONTAL_RESIZED,
    to: LAYOUT_VERTICAL,
    paneId: "b",
    duration: 2200,
  },
  { kind: "hold", layout: LAYOUT_VERTICAL, duration: 1400 },
  // 3. toastercat_ added beside the vertical split
  {
    kind: "add-pane",
    from: LAYOUT_VERTICAL,
    to: LAYOUT_COLUMN_C,
    paneId: "c",
    duration: 2000,
  },
  { kind: "hold", layout: LAYOUT_COLUMN_C, duration: 1200 },
  // Resize within the vertical arrangement
  {
    kind: "resize",
    from: LAYOUT_COLUMN_C,
    to: LAYOUT_COLUMN_C_RESIZED,
    duration: 1800,
    dividerId: "root.0.0",
  },
  { kind: "hold", layout: LAYOUT_COLUMN_C_RESIZED, duration: 1200 },
  // 4. Dhinkha back to the middle column
  {
    kind: "drag",
    from: LAYOUT_COLUMN_C_RESIZED,
    to: LAYOUT_ROW_ABC,
    paneId: "b",
    duration: 2400,
  },
  { kind: "hold", layout: LAYOUT_ROW_ABC, duration: 1400 },
  // 5. Remove toastercat_ — loops to 50/50 start
  {
    kind: "remove-pane",
    from: LAYOUT_ROW_ABC,
    to: LAYOUT_HORIZONTAL,
    paneId: "c",
    duration: 2000,
  },
]

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function interpolateLayouts(
  from: LayoutNode,
  to: LayoutNode,
  t: number
): LayoutNode {
  if (from.type !== to.type) {
    return t < 0.5 ? from : to
  }

  if (from.type === "pane") {
    return from
  }

  if (to.type !== "split") {
    return from
  }

  if (
    from.direction !== to.direction ||
    from.children.length !== to.children.length
  ) {
    return t < 0.5 ? from : to
  }

  return {
    type: "split",
    direction: from.direction,
    children: from.children.map((child, index) => {
      const target = to.children[index] ?? child
      return {
        node: interpolateLayouts(child.node, target.node, t),
        size: lerp(child.size, target.size, t),
      }
    }),
  }
}

function computeLayoutMetrics(
  node: LayoutNode,
  bounds: Rect,
  path: string,
  paneRects: Map<PaneId, Rect>,
  dividers: Divider[]
) {
  if (node.type === "pane") {
    paneRects.set(node.id, bounds)
    return
  }

  const total = node.children.reduce((sum, child) => sum + child.size, 0)
  let offset = node.direction === "row" ? bounds.x : bounds.y

  node.children.forEach((child, index) => {
    const ratio = child.size / total
    const childBounds =
      node.direction === "row"
        ? {
            x: offset,
            y: bounds.y,
            width: bounds.width * ratio,
            height: bounds.height,
          }
        : {
            x: bounds.x,
            y: offset,
            width: bounds.width,
            height: bounds.height * ratio,
          }

    const childPath = `${path}.${index}`
    computeLayoutMetrics(
      child.node,
      childBounds,
      childPath,
      paneRects,
      dividers
    )
    offset += node.direction === "row" ? childBounds.width : childBounds.height

    if (index < node.children.length - 1) {
      const dividerThickness = 0.008
      dividers.push({
        id: childPath,
        direction: node.direction,
        x:
          node.direction === "row"
            ? childBounds.x + childBounds.width - dividerThickness / 2
            : bounds.x,
        y:
          node.direction === "column"
            ? childBounds.y + childBounds.height - dividerThickness / 2
            : bounds.y,
        width: node.direction === "row" ? dividerThickness : bounds.width,
        height: node.direction === "column" ? dividerThickness : bounds.height,
      })
    }
  })
}

function getLayoutMetrics(layout: LayoutNode) {
  const paneRects = new Map<PaneId, Rect>()
  const dividers: Divider[] = []
  computeLayoutMetrics(
    layout,
    { x: 0, y: 0, width: 1, height: 1 },
    "root",
    paneRects,
    dividers
  )
  return { paneRects, dividers }
}

function lerpRect(from: Rect, to: Rect, t: number): Rect {
  return {
    x: lerp(from.x, to.x, t),
    y: lerp(from.y, to.y, t),
    width: lerp(from.width, to.width, t),
    height: lerp(from.height, to.height, t),
  }
}

function lerpAllPaneRects(
  from: Map<PaneId, Rect>,
  to: Map<PaneId, Rect>,
  t: number
) {
  const paneRects = new Map<PaneId, Rect>()
  const paneIds = new Set([...from.keys(), ...to.keys()])

  for (const paneId of paneIds) {
    const fromRect = from.get(paneId)
    const toRect = to.get(paneId)
    if (fromRect && toRect) {
      paneRects.set(paneId, lerpRect(fromRect, toRect, t))
    } else if (fromRect) {
      paneRects.set(paneId, fromRect)
    } else if (toRect) {
      paneRects.set(paneId, toRect)
    }
  }

  return paneRects
}

function blendDividers(from: Divider[], to: Divider[], t: number) {
  const eased = easeInOutCubic(t)
  const out: Divider[] = []

  for (const target of to) {
    const source = from.find((entry) => entry.id === target.id)
    if (source) {
      out.push({
        ...target,
        ...lerpRect(source, target, eased),
        direction: eased < 0.5 ? source.direction : target.direction,
      })
      continue
    }

    if (eased < 0.18) {
      continue
    }

    const reveal = easeInOutCubic((eased - 0.18) / 0.82)
    const start: Rect =
      target.direction === "row"
        ? {
            ...target,
            x: target.x - target.width * 4,
            width: target.width * 0.1,
          }
        : {
            ...target,
            y: target.y - target.height * 4,
            height: target.height * 0.1,
          }

    out.push({
      ...target,
      ...lerpRect(start, target, reveal),
    })
  }

  return out
}

function paneDragHandlePoint(rect: Rect) {
  return {
    x: rect.x + rect.width * 0.42,
    y: rect.y + rect.height * PANE_HEADER_CENTER_Y,
  }
}

function metricsFromLayout(layout: LayoutNode): FrameMetrics {
  const { paneRects, dividers } = getLayoutMetrics(layout)
  return {
    paneRects,
    dividers,
    paneOpacity: new Map(),
    dragGhost: null,
    activeDividerId: null,
  }
}

function metricsFromResize(
  from: LayoutNode,
  to: LayoutNode,
  dividerId: string,
  progress: number
): FrameMetrics {
  const layout = interpolateLayouts(from, to, easeInOutCubic(progress))
  const { paneRects, dividers } = getLayoutMetrics(layout)

  return {
    paneRects,
    dividers,
    paneOpacity: new Map(),
    dragGhost: null,
    activeDividerId: progress > 0.05 && progress < 0.95 ? dividerId : null,
  }
}

function metricsFromDrag(
  from: LayoutNode,
  to: LayoutNode,
  paneId: PaneId,
  progress: number
): FrameMetrics {
  const fromMetrics = getLayoutMetrics(from)
  const toMetrics = getLayoutMetrics(to)
  const t = easeInOutCubic(Math.min(progress / 0.88, 1))
  const lift = Math.sin(t * Math.PI) * 0.022

  const paneRects = lerpAllPaneRects(
    fromMetrics.paneRects,
    toMetrics.paneRects,
    t
  )
  const draggedBase = paneRects.get(paneId)

  if (draggedBase) {
    paneRects.set(paneId, draggedBase)
  }

  const fromRect = fromMetrics.paneRects.get(paneId)
  const toRect = toMetrics.paneRects.get(paneId)
  const ghostRect =
    fromRect && toRect
      ? {
          ...lerpRect(fromRect, toRect, t),
          y: lerp(fromRect.y, toRect.y, t) - lift,
        }
      : null

  return {
    paneRects,
    dividers: blendDividers(fromMetrics.dividers, toMetrics.dividers, t),
    paneOpacity: new Map(),
    dragGhost: ghostRect
      ? {
          paneId,
          rect: ghostRect,
          opacity: progress < 0.9 ? 1 : 1 - (progress - 0.9) / 0.1,
        }
      : null,
    activeDividerId: null,
  }
}

function metricsFromAddPane(
  from: LayoutNode,
  to: LayoutNode,
  paneId: PaneId,
  progress: number
): FrameMetrics {
  const fromMetrics = getLayoutMetrics(from)
  const toMetrics = getLayoutMetrics(to)
  const paneOpacity = new Map<PaneId, number>()
  const t = easeInOutCubic(progress)

  const paneRects = lerpAllPaneRects(
    fromMetrics.paneRects,
    toMetrics.paneRects,
    t
  )
  const targetRect = toMetrics.paneRects.get(paneId)

  if (targetRect && !fromMetrics.paneRects.has(paneId)) {
    paneRects.delete(paneId)
    const reveal = easeInOutCubic(Math.max(0, (progress - 0.06) / 0.94))
    const enterFrom: Rect = {
      x: targetRect.x + targetRect.width * 0.55,
      y: targetRect.y,
      width: targetRect.width * 0.45,
      height: targetRect.height,
    }
    paneRects.set(paneId, lerpRect(enterFrom, targetRect, reveal))
    paneOpacity.set(paneId, reveal)
  }

  return {
    paneRects,
    dividers: blendDividers(fromMetrics.dividers, toMetrics.dividers, t),
    paneOpacity,
    dragGhost: null,
    activeDividerId: null,
  }
}

function metricsFromRemovePane(
  from: LayoutNode,
  to: LayoutNode,
  paneId: PaneId,
  progress: number
): FrameMetrics {
  const fromMetrics = getLayoutMetrics(from)
  const toMetrics = getLayoutMetrics(to)
  const paneOpacity = new Map<PaneId, number>()
  const fadePortion = 0.42
  const sourceRect = fromMetrics.paneRects.get(paneId)

  if (progress < fadePortion && sourceRect) {
    const fade = 1 - progress / fadePortion
    const paneRects = new Map(fromMetrics.paneRects)

    paneOpacity.set(paneId, fade)

    return {
      paneRects,
      dividers: fromMetrics.dividers,
      paneOpacity,
      dragGhost: null,
      activeDividerId: null,
    }
  }

  const expand = easeInOutCubic((progress - fadePortion) / (1 - fadePortion))
  const paneRects = lerpAllPaneRects(
    fromMetrics.paneRects,
    toMetrics.paneRects,
    expand
  )
  paneRects.delete(paneId)

  return {
    paneRects,
    dividers: blendDividers(fromMetrics.dividers, toMetrics.dividers, expand),
    paneOpacity,
    dragGhost: null,
    activeDividerId: null,
  }
}

function computeFrameMetrics(phase: Phase, progress: number): FrameMetrics {
  switch (phase.kind) {
    case "hold":
      return metricsFromLayout(phase.layout)
    case "resize":
      return metricsFromResize(phase.from, phase.to, phase.dividerId, progress)
    case "drag":
      return metricsFromDrag(phase.from, phase.to, phase.paneId, progress)
    case "add-pane":
      return metricsFromAddPane(phase.from, phase.to, phase.paneId, progress)
    case "remove-pane":
      return metricsFromRemovePane(phase.from, phase.to, phase.paneId, progress)
  }
}

const PROGRESS_RENDER_INTERVAL_MS = 32

function useLayoutShowcaseAnimation(reducedMotion: boolean, active: boolean) {
  const [phaseIndex, setPhaseIndex] = React.useState(0)
  const [progress, setProgress] = React.useState(() => (reducedMotion ? 1 : 0))
  const activeRef = React.useRef(active)

  React.useEffect(() => {
    activeRef.current = active
  }, [active])

  const phase = PHASES[phaseIndex % PHASES.length] ?? PHASES[0]

  React.useEffect(() => {
    if (!active) {
      return
    }

    if (reducedMotion) {
      const timer = window.setInterval(() => {
        setPhaseIndex((current) => (current + 1) % PHASES.length)
      }, 4000)

      return () => window.clearInterval(timer)
    }

    let frame = 0
    let start = performance.now()
    let lastRender = 0
    let pausedAt = 0
    const duration = phase.duration

    const tick = (now: number) => {
      if (!activeRef.current) {
        return
      }

      if (document.hidden) {
        if (pausedAt === 0) {
          pausedAt = now
        }
        frame = requestAnimationFrame(tick)
        return
      }

      if (pausedAt > 0) {
        start += now - pausedAt
        pausedAt = 0
      }

      const elapsed = now - start
      const linear = Math.min(elapsed / duration, 1)

      if (now - lastRender >= PROGRESS_RENDER_INTERVAL_MS || linear >= 1) {
        lastRender = now
        setProgress(linear)
      }

      if (linear < 1) {
        frame = requestAnimationFrame(tick)
        return
      }

      setPhaseIndex((current) => (current + 1) % PHASES.length)
      setProgress(0)
    }

    frame = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frame)
  }, [active, phase.duration, phaseIndex, reducedMotion])

  const frameMetrics = React.useMemo(() => {
    if (reducedMotion) {
      if (phase.kind === "hold") {
        return metricsFromLayout(phase.layout)
      }
      return metricsFromLayout(phase.to)
    }

    return computeFrameMetrics(phase, progress)
  }, [phase, reducedMotion, progress])

  return frameMetrics
}

function pct(value: number) {
  return `${value * 100}%`
}

function rectToInsetStyle(rect: Rect): React.CSSProperties {
  return {
    top: pct(rect.y),
    left: pct(rect.x),
    right: pct(1 - rect.x - rect.width),
    bottom: pct(1 - rect.y - rect.height),
  }
}

function ShowcasePaneSkeletons() {
  return (
    <div className="flex h-full flex-col justify-start gap-1 px-2 py-1.5">
      {SKELETON_LINE_WIDTHS.map((width, index) => (
        <div
          key={index}
          className={cn(
            "flex items-center gap-1.5 rounded-sm px-1 py-0.5",
            index % 2 === 1 && "bg-foreground/4"
          )}
        >
          <Skeleton className="h-2.5 w-8 shrink-0 rounded-sm" />
          <Skeleton
            className="h-2.5 rounded-sm"
            style={{ width: `${width * 100}%` }}
          />
        </div>
      ))}
    </div>
  )
}

function ShowcasePane({
  paneId,
  rect,
  dimmed,
  elevated,
  dragHandleActive,
  opacity = 1,
}: {
  paneId: PaneId
  rect: Rect
  dimmed?: boolean
  elevated?: boolean
  dragHandleActive?: boolean
  opacity?: number
}) {
  const pane = PANES[paneId]

  return (
    <div
      className={cn(
        "absolute isolate z-0 flex min-h-0 min-w-0 flex-col overflow-hidden bg-(--chat-background) transition-[opacity,box-shadow,transform] duration-300 contain-[paint]",
        dimmed && "opacity-40",
        elevated &&
          "z-4 scale-[1.02] shadow-[0_10px_28px_-8px_oklch(0_0_0/55%)] ring-1 ring-primary/45"
      )}
      style={{
        ...rectToInsetStyle(rect),
        opacity: dimmed ? undefined : opacity,
      }}
    >
      <div
        className={cn(
          "relative flex h-7 w-full min-w-0 shrink-0 items-center gap-1.5 overflow-hidden px-2.5",
          dragHandleActive && "bg-primary/10"
        )}
      >
        <img
          src={pane.profileImageUrl}
          alt=""
          className="size-5 shrink-0 rounded-full object-cover"
        />
        <span className="truncate text-xs font-medium">{pane.displayName}</span>
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border"
          aria-hidden
        />
        {dragHandleActive ? (
          <div
            className="pointer-events-none absolute inset-0 ring-1 ring-primary/35 ring-inset"
            aria-hidden
          />
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <ShowcasePaneSkeletons />
      </div>
    </div>
  )
}

function DemoCursor({
  left,
  top,
  grabbing,
  style,
}: {
  left: string
  top: string
  grabbing?: boolean
  style?: React.CSSProperties
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-5 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow-lg motion-safe:animate-pulse",
        grabbing && "scale-90"
      )}
      style={{ left, top, ...style }}
      aria-hidden
    />
  )
}

function LayoutShowcaseDemo() {
  const reducedMotion = usePrefersReducedMotion()
  const { ref: visibilityRef, visible } =
    useIntersectionVisible<HTMLDivElement>({
      rootMargin: "120px",
    })
  const { paneRects, dividers, paneOpacity, dragGhost, activeDividerId } =
    useLayoutShowcaseAnimation(reducedMotion, visible)

  const activeDivider = activeDividerId
    ? dividers.find((entry) => entry.id === activeDividerId)
    : null

  const dragCursor = dragGhost ? paneDragHandlePoint(dragGhost.rect) : null

  return (
    <div
      ref={visibilityRef}
      className="relative mx-auto w-full max-w-136"
      aria-hidden
    >
      <div className="relative overflow-hidden rounded-lg border border-border/85 bg-linear-to-br from-card/88 to-background/92 shadow-[0_2px_4px_oklch(0_0_0/22%),0_18px_40px_-14px_oklch(0_0_0/48%)]">
        <div className="relative aspect-16/11 bg-background bg-[radial-gradient(ellipse_80%_70%_at_50%_0%,color-mix(in_oklch,var(--primary)_8%,transparent),transparent_72%)]">
          {Array.from(paneRects.entries()).map(([paneId, rect]) => {
            const opacity = paneOpacity.get(paneId) ?? 1
            if (opacity < 0.03) {
              return null
            }

            return (
              <ShowcasePane
                key={paneId}
                paneId={paneId}
                rect={rect}
                dimmed={dragGhost?.paneId === paneId}
                opacity={opacity}
              />
            )
          })}

          {dividers.map((divider) => (
            <div
              key={divider.id}
              className={cn(
                "absolute z-10 bg-border/70 transition-[background-color,box-shadow] duration-200",
                divider.direction === "row"
                  ? "w-px cursor-col-resize"
                  : "h-px cursor-row-resize",
                activeDividerId === divider.id &&
                  "bg-primary shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_28%,transparent)]"
              )}
              style={
                divider.direction === "row"
                  ? {
                      top: pct(divider.y),
                      bottom: pct(1 - divider.y - divider.height),
                      left: pct(divider.x + divider.width / 2),
                      marginLeft: "-0.5px",
                    }
                  : {
                      left: pct(divider.x),
                      right: pct(1 - divider.x - divider.width),
                      top: pct(divider.y + divider.height / 2),
                      marginTop: "-0.5px",
                    }
              }
            />
          ))}

          {dragGhost ? (
            <ShowcasePane
              paneId={dragGhost.paneId}
              rect={dragGhost.rect}
              elevated
              dragHandleActive
              opacity={dragGhost.opacity}
            />
          ) : null}

          {activeDivider ? (
            <DemoCursor
              left={pct(
                activeDivider.direction === "row"
                  ? activeDivider.x + activeDivider.width / 2
                  : activeDivider.x + activeDivider.width * 0.55
              )}
              top={pct(
                activeDivider.direction === "column"
                  ? activeDivider.y + activeDivider.height / 2
                  : activeDivider.y + activeDivider.height * 0.52
              )}
            />
          ) : null}

          {dragCursor ? (
            <DemoCursor
              left={pct(dragCursor.x)}
              top={pct(dragCursor.y)}
              grabbing
              style={{ opacity: dragGhost?.opacity }}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

const HIGHLIGHTS = [
  {
    icon: Columns2Icon,
    title: "Resize",
    description: "Drag split dividers to give each channel the space it needs.",
  },
  {
    icon: MoveIcon,
    title: "Rearrange",
    description: "Drop panes onto edges to move them around your layout.",
  },
  {
    icon: LayoutGridIcon,
    title: "Combine",
    description: "Mix horizontal and vertical splits in any arrangement.",
  },
] as const

export function LayoutShowcaseSection() {
  return (
    <section
      id="layouts"
      className="relative overflow-hidden border-t border-white/8 bg-card/20"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_55%_at_78%_42%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_68%),radial-gradient(ellipse_42%_48%_at_12%_72%,color-mix(in_oklch,var(--primary)_8%,transparent),transparent_62%)]"
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-6xl px-6 py-20 lg:py-40">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-16">
          <div className="max-w-xl">
            <h2 className="font-landing-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Anywhere you want with
              <br />
              <span className="text-primary">splits and layouts.</span>
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              You can arrange channels in any way you like. Horizontal,
              vertical, or a mix of both. Rearrange and resize them to make the
              perfect layout.
            </p>

            <ul className="mt-8 space-y-4">
              {HIGHLIGHTS.map((item) => (
                <li key={item.title} className="flex gap-4">
                  <span className="mt-0.5 inline-flex h-full rounded-lg bg-primary/15 p-2">
                    <item.icon className="size-4 text-primary" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <LayoutShowcaseDemo />
        </div>
      </div>
    </section>
  )
}
