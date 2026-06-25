import * as React from "react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core"

import {
  clampSplitChildSizes,
  normalizeSplitLayout,
  type ChatSplitLayoutNode,
  type SplitLayoutEdge,
} from "@/lib/chat/chat-split-layout"
import { cn } from "@/lib/utils"

type ChatSplitLayoutProps = {
  splitId: string
  channels: string[]
  layout?: ChatSplitLayoutNode
  getPanePreview?: (login: string) => {
    label: string
    profileImageUrl?: string
  }
  renderPane: (
    login: string,
    dragHandleProps: React.HTMLAttributes<HTMLDivElement>
  ) => React.ReactNode
  onMovePane: (
    splitId: string,
    sourceChannel: string,
    targetChannel: string,
    edge: SplitLayoutEdge
  ) => void
  onResizePath: (splitId: string, path: number[], sizes: number[]) => void
}

type ResizeState = {
  key: string
  path: number[]
  sizes: number[]
}

type DragOverlayPreviewProps = {
  login: string
  label: string
  profileImageUrl?: string
}

const DROP_EDGES: SplitLayoutEdge[] = ["top", "right", "bottom", "left"]
const DIVIDER_HIT_AREA_PX = 11

function pathKey(path: number[]) {
  return path.join(".")
}

function getDropEdge(
  point: { x: number; y: number },
  rect: DOMRect
): SplitLayoutEdge {
  const distances: Record<SplitLayoutEdge, number> = {
    top: Math.abs(point.y - rect.top),
    right: Math.abs(rect.right - point.x),
    bottom: Math.abs(rect.bottom - point.y),
    left: Math.abs(point.x - rect.left),
  }

  return DROP_EDGES.reduce((best, edge) =>
    distances[edge] < distances[best] ? edge : best
  )
}

function distanceToRect(point: { x: number; y: number }, rect: DOMRect) {
  const dx =
    point.x < rect.left
      ? rect.left - point.x
      : point.x > rect.right
        ? point.x - rect.right
        : 0
  const dy =
    point.y < rect.top
      ? rect.top - point.y
      : point.y > rect.bottom
        ? point.y - rect.bottom
        : 0

  return Math.hypot(dx, dy)
}

function ResizeHandle({
  direction,
  onPointerDown,
  onDoubleClick,
}: {
  direction: "row" | "column"
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
  onDoubleClick: (event: React.MouseEvent<HTMLDivElement>) => void
}) {
  return (
    <div
      role="separator"
      aria-orientation={direction === "row" ? "vertical" : "horizontal"}
      className={cn(
        "group relative z-10 shrink-0 touch-none bg-border/70 transition-colors hover:bg-primary/60",
        direction === "row"
          ? "h-full w-px cursor-col-resize"
          : "h-px w-full cursor-row-resize"
      )}
      onPointerDown={onPointerDown}
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

function DragOverlayPreview({
  login,
  label,
  profileImageUrl,
}: DragOverlayPreviewProps) {
  return (
    <div className="flex cursor-grabbing items-center gap-2 rounded-full border border-border/80 bg-popover/95 px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-lg backdrop-blur">
      {profileImageUrl ? (
        <img
          src={profileImageUrl}
          alt=""
          className="size-5 shrink-0 rounded-full object-cover"
          draggable={false}
        />
      ) : (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary uppercase">
          {login.slice(0, 2)}
        </span>
      )}
      <span className="max-w-32 truncate">{label}</span>
    </div>
  )
}

function SplitPaneDropFrame({
  login,
  activeChannel,
  overChannel,
  dropEdge,
  registerPane,
  renderPane,
}: {
  login: string
  activeChannel: string | null
  overChannel: string | null
  dropEdge: SplitLayoutEdge | null
  registerPane: (login: string, node: HTMLElement | null) => void
  renderPane: (
    login: string,
    dragHandleProps: React.HTMLAttributes<HTMLDivElement>
  ) => React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragNodeRef,
    isDragging,
  } = useDraggable({ id: login })
  const { setNodeRef: setDropNodeRef } = useDroppable({ id: login })
  const isDropTarget =
    activeChannel !== null &&
    activeChannel !== login &&
    overChannel === login &&
    dropEdge !== null

  const setNodeRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      setDragNodeRef(node)
      setDropNodeRef(node)
      registerPane(login, node)
    },
    [login, registerPane, setDragNodeRef, setDropNodeRef]
  )

  const dragHandleProps = {
    ...attributes,
    ...listeners,
    className: cn(
      "cursor-grab touch-none select-none active:cursor-grabbing",
      isDragging && "cursor-grabbing"
    ),
  } satisfies React.HTMLAttributes<HTMLDivElement>

  return (
    <div
      ref={setNodeRef}
      data-split-pane={login}
      className={cn(
        "relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden rounded-none",
        isDragging && "opacity-50"
      )}
    >
      {renderPane(login, dragHandleProps)}
      {isDropTarget ? (
        <div
          className={cn(
            "pointer-events-none absolute z-20 rounded-sm bg-primary/60",
            dropEdge === "top" && "top-0 right-0 left-0 h-1",
            dropEdge === "right" && "top-0 right-0 bottom-0 w-1",
            dropEdge === "bottom" && "right-0 bottom-0 left-0 h-1",
            dropEdge === "left" && "top-0 bottom-0 left-0 w-1"
          )}
        />
      ) : null}
    </div>
  )
}

function SplitNodeView({
  node,
  path,
  transientSizes,
  activeChannel,
  overChannel,
  dropEdge,
  registerPane,
  renderPane,
  onResizeStart,
  onResizeReset,
}: {
  node: ChatSplitLayoutNode
  path: number[]
  transientSizes: Record<string, number[]>
  activeChannel: string | null
  overChannel: string | null
  dropEdge: SplitLayoutEdge | null
  registerPane: (login: string, node: HTMLElement | null) => void
  renderPane: (
    login: string,
    dragHandleProps: React.HTMLAttributes<HTMLDivElement>
  ) => React.ReactNode
  onResizeStart: (
    event: React.PointerEvent<HTMLDivElement>,
    path: number[],
    index: number,
    direction: "row" | "column",
    sizes: number[]
  ) => void
  onResizeReset: (path: number[], count: number) => void
}) {
  if (node.type === "pane") {
    return (
      <SplitPaneDropFrame
        login={node.channel}
        activeChannel={activeChannel}
        overChannel={overChannel}
        dropEdge={dropEdge}
        registerPane={registerPane}
        renderPane={renderPane}
      />
    )
  }

  const key = pathKey(path)
  const sizes = transientSizes[key] ?? node.children.map((entry) => entry.size)

  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-1 overflow-hidden",
        node.direction === "column" && "flex-col"
      )}
    >
      {node.children.map((entry, index) => (
        <React.Fragment key={`${pathKey([...path, index])}:${index}`}>
          <div
            className="flex min-h-0 min-w-0 overflow-hidden"
            style={{
              flexBasis: `${sizes[index]}%`,
              flexGrow: sizes[index],
              flexShrink: 1,
            }}
          >
            <SplitNodeView
              node={entry.node}
              path={[...path, index]}
              transientSizes={transientSizes}
              activeChannel={activeChannel}
              overChannel={overChannel}
              dropEdge={dropEdge}
              registerPane={registerPane}
              renderPane={renderPane}
              onResizeStart={onResizeStart}
              onResizeReset={onResizeReset}
            />
          </div>
          {index < node.children.length - 1 ? (
            <ResizeHandle
              direction={node.direction}
              onPointerDown={(event) =>
                onResizeStart(event, path, index, node.direction, sizes)
              }
              onDoubleClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onResizeReset(path, node.children.length)
              }}
            />
          ) : null}
        </React.Fragment>
      ))}
    </div>
  )
}

export function ChatSplitLayout({
  splitId,
  channels,
  layout,
  getPanePreview,
  renderPane,
  onMovePane,
  onResizePath,
}: ChatSplitLayoutProps) {
  const normalizedLayout = React.useMemo(
    () => normalizeSplitLayout(layout, channels),
    [channels, layout]
  )
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )
  const paneElementsRef = React.useRef(new Map<string, HTMLElement>())
  const pointerRef = React.useRef<{ x: number; y: number } | null>(null)
  const frameRef = React.useRef<number | null>(null)
  const resizeRef = React.useRef<ResizeState | null>(null)
  const overChannelRef = React.useRef<string | null>(null)
  const dropEdgeRef = React.useRef<SplitLayoutEdge | null>(null)
  const [activeChannel, setActiveChannel] = React.useState<string | null>(null)
  const [overChannel, setOverChannel] = React.useState<string | null>(null)
  const [dropEdge, setDropEdge] = React.useState<SplitLayoutEdge | null>(null)
  const [transientSizes, setTransientSizes] = React.useState<
    Record<string, number[]>
  >({})

  React.useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
      }
    }
  }, [])

  const registerPane = React.useCallback(
    (login: string, node: HTMLElement | null) => {
      if (node) {
        paneElementsRef.current.set(login, node)
        return
      }
      paneElementsRef.current.delete(login)
    },
    []
  )

  const setDropTarget = React.useCallback(
    (target: string | null, edge: SplitLayoutEdge | null) => {
      overChannelRef.current = target
      dropEdgeRef.current = edge
      setOverChannel(target)
      setDropEdge(edge)
    },
    []
  )

  const updateDropTargetFromPoint = React.useCallback(
    (point: { x: number; y: number }, active: string | null) => {
      if (!active) {
        setDropTarget(null, null)
        return
      }

      let fallback: { login: string; rect: DOMRect; distance: number } | null =
        null

      for (const [login, element] of paneElementsRef.current) {
        if (login === active) {
          continue
        }

        const rect = element.getBoundingClientRect()
        if (
          point.x >= rect.left &&
          point.x <= rect.right &&
          point.y >= rect.top &&
          point.y <= rect.bottom
        ) {
          setDropTarget(login, getDropEdge(point, rect))
          return
        }

        const distance = distanceToRect(point, rect)
        if (!fallback || distance < fallback.distance) {
          fallback = { login, rect, distance }
        }
      }

      if (!fallback) {
        setDropTarget(null, null)
        return
      }

      setDropTarget(fallback.login, getDropEdge(point, fallback.rect))
    },
    [setDropTarget]
  )

  const handleDragStart = React.useCallback(
    (event: DragStartEvent) => {
      setActiveChannel(String(event.active.id))
      const activatorEvent = event.activatorEvent
      if (activatorEvent instanceof PointerEvent) {
        const point = { x: activatorEvent.clientX, y: activatorEvent.clientY }
        pointerRef.current = point
        updateDropTargetFromPoint(point, String(event.active.id))
      }
    },
    [updateDropTargetFromPoint]
  )

  const handleDragMove = React.useCallback(
    (event: DragMoveEvent) => {
      if (event.activatorEvent instanceof PointerEvent) {
        const point = {
          x: event.activatorEvent.clientX + event.delta.x,
          y: event.activatorEvent.clientY + event.delta.y,
        }
        pointerRef.current = point
        updateDropTargetFromPoint(point, String(event.active.id))
        return
      }

      const rect = event.active.rect.current.translated
      if (rect) {
        const point = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        }
        pointerRef.current = point
        updateDropTargetFromPoint(point, String(event.active.id))
      }
    },
    [updateDropTargetFromPoint]
  )

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const source = String(event.active.id)
      const target = overChannelRef.current
      const edge = dropEdgeRef.current
      if (target && target !== source && edge) {
        onMovePane(splitId, source, target, edge)
      }
      setActiveChannel(null)
      setDropTarget(null, null)
      pointerRef.current = null
    },
    [onMovePane, setDropTarget, splitId]
  )

  const handleDragCancel = React.useCallback(() => {
    setActiveChannel(null)
    setDropTarget(null, null)
    pointerRef.current = null
  }, [setDropTarget])

  React.useEffect(() => {
    if (!activeChannel) {
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      const point = { x: event.clientX, y: event.clientY }
      pointerRef.current = point
      updateDropTargetFromPoint(point, activeChannel)
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true })
    return () => window.removeEventListener("pointermove", handlePointerMove)
  }, [activeChannel, updateDropTargetFromPoint])

  const handleResizeStart = React.useCallback(
    (
      event: React.PointerEvent<HTMLDivElement>,
      path: number[],
      index: number,
      direction: "row" | "column",
      sizes: number[]
    ) => {
      event.preventDefault()
      event.stopPropagation()

      const container = event.currentTarget.parentElement
      if (!container) {
        return
      }

      const key = pathKey(path)
      const rect = container.getBoundingClientRect()
      const axisSize = direction === "row" ? rect.width : rect.height
      if (axisSize <= 0) {
        return
      }

      const startCoordinate =
        direction === "row" ? event.clientX : event.clientY
      const startSizes = [...sizes]

      const commitResize = () => {
        const state = resizeRef.current
        resizeRef.current = null
        setTransientSizes((current) => {
          const { [key]: _removed, ...rest } = current
          return rest
        })
        if (state) {
          onResizePath(splitId, state.path, state.sizes)
        }
        window.removeEventListener("pointermove", handlePointerMove)
        window.removeEventListener("pointerup", commitResize)
      }

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const coordinate =
          direction === "row" ? moveEvent.clientX : moveEvent.clientY
        const deltaPercent = ((coordinate - startCoordinate) / axisSize) * 100
        const nextSizes = [...startSizes]
        nextSizes[index] += deltaPercent
        nextSizes[index + 1] -= deltaPercent
        const clamped = clampSplitChildSizes(nextSizes)
        resizeRef.current = { key, path, sizes: clamped }

        if (frameRef.current !== null) {
          cancelAnimationFrame(frameRef.current)
        }

        frameRef.current = requestAnimationFrame(() => {
          setTransientSizes((current) => ({ ...current, [key]: clamped }))
          frameRef.current = null
        })
      }

      resizeRef.current = { key, path, sizes: startSizes }
      window.addEventListener("pointermove", handlePointerMove)
      window.addEventListener("pointerup", commitResize, { once: true })
    },
    [onResizePath, splitId]
  )

  const handleResizeReset = React.useCallback(
    (path: number[], count: number) => {
      if (count <= 0) {
        return
      }
      onResizePath(
        splitId,
        path,
        Array.from({ length: count }, () => 100 / count)
      )
    },
    [onResizePath, splitId]
  )

  if (!normalizedLayout) {
    return null
  }

  const activePreview = activeChannel
    ? (getPanePreview?.(activeChannel) ?? {
        label: activeChannel,
      })
    : null

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SplitNodeView
        node={normalizedLayout}
        path={[]}
        transientSizes={transientSizes}
        activeChannel={activeChannel}
        overChannel={overChannel}
        dropEdge={dropEdge}
        registerPane={registerPane}
        renderPane={renderPane}
        onResizeStart={handleResizeStart}
        onResizeReset={handleResizeReset}
      />
      <DragOverlay>
        {activeChannel && activePreview ? (
          <DragOverlayPreview
            login={activeChannel}
            label={activePreview.label}
            profileImageUrl={activePreview.profileImageUrl}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
