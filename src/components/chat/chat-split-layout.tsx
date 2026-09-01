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

import { useLazyRef } from "@/hooks/use-lazy-ref"
import {
  clampAdjacentSplitSizes,
  normalizeSplitLayout,
  type ChatSplitLayoutNode,
  type SplitLayoutEdge,
} from "@/lib/chat/chat-split-layout"
import {
  ResizeActivityProvider,
  ResizeSeparator,
} from "@/components/resize-session"
import { usePointerResizeSession } from "@/hooks/use-resize-session"
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

type DragOverlayPreviewProps = {
  login: string
  label: string
  profileImageUrl?: string
}

const DROP_EDGES: SplitLayoutEdge[] = ["top", "right", "bottom", "left"]

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

  const dragHandleClassName = cn(
    "cursor-grab touch-none select-none active:cursor-grabbing",
    isDragging && "cursor-grabbing"
  )
  const dragHandleProps = React.useMemo(
    () =>
      ({
        ...attributes,
        ...listeners,
        className: dragHandleClassName,
      }) satisfies React.HTMLAttributes<HTMLDivElement>,
    [attributes, dragHandleClassName, listeners]
  )

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
  activeChannel,
  overChannel,
  dropEdge,
  registerPane,
  registerResizeChild,
  renderPane,
  onResizeStart,
  onResizeReset,
  onResizeKeyDown,
}: {
  node: ChatSplitLayoutNode
  path: number[]
  activeChannel: string | null
  overChannel: string | null
  dropEdge: SplitLayoutEdge | null
  registerPane: (login: string, node: HTMLElement | null) => void
  registerResizeChild: (
    path: number[],
    index: number,
    node: HTMLElement | null
  ) => void
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
  onResizeKeyDown: (
    event: React.KeyboardEvent<HTMLDivElement>,
    path: number[],
    index: number,
    sizes: number[]
  ) => void
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

  const sizes = node.children.map((entry) => entry.size)

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
            ref={(element) => registerResizeChild(path, index, element)}
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
              activeChannel={activeChannel}
              overChannel={overChannel}
              dropEdge={dropEdge}
              registerPane={registerPane}
              registerResizeChild={registerResizeChild}
              renderPane={renderPane}
              onResizeStart={onResizeStart}
              onResizeReset={onResizeReset}
              onResizeKeyDown={onResizeKeyDown}
            />
          </div>
          {index < node.children.length - 1 ? (
            <ResizeSeparator
              direction={node.direction}
              label="Resize chat panes"
              valueNow={Math.round(sizes[index] ?? 0)}
              onPointerDown={(event) =>
                onResizeStart(event, path, index, node.direction, sizes)
              }
              onKeyDown={(event) => onResizeKeyDown(event, path, index, sizes)}
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

export const ChatSplitLayout = React.memo(function ChatSplitLayout({
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
  const paneElementsRef = useLazyRef(() => new Map<string, HTMLElement>())
  const resizeElementsRef = useLazyRef(() => new Map<string, HTMLElement>())
  const resizeSession = usePointerResizeSession<number[]>()
  const overChannelRef = React.useRef<string | null>(null)
  const dropEdgeRef = React.useRef<SplitLayoutEdge | null>(null)
  const [activeChannel, setActiveChannel] = React.useState<string | null>(null)
  const [overChannel, setOverChannel] = React.useState<string | null>(null)
  const [dropEdge, setDropEdge] = React.useState<SplitLayoutEdge | null>(null)

  const registerPane = React.useCallback(
    (login: string, node: HTMLElement | null) => {
      if (node) {
        paneElementsRef.current.set(login, node)
        return
      }
      paneElementsRef.current.delete(login)
    },
    [paneElementsRef]
  )

  const setDropTarget = React.useCallback(
    (target: string | null, edge: SplitLayoutEdge | null) => {
      if (overChannelRef.current === target && dropEdgeRef.current === edge) {
        return
      }
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
    [paneElementsRef, setDropTarget]
  )

  const handleDragStart = React.useCallback(
    (event: DragStartEvent) => {
      setActiveChannel(String(event.active.id))
      const activatorEvent = event.activatorEvent
      if (activatorEvent instanceof PointerEvent) {
        const point = { x: activatorEvent.clientX, y: activatorEvent.clientY }
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
        updateDropTargetFromPoint(point, String(event.active.id))
        return
      }

      const rect = event.active.rect.current.translated
      if (rect) {
        const point = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        }
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
    },
    [onMovePane, setDropTarget, splitId]
  )

  const handleDragCancel = React.useCallback(() => {
    setActiveChannel(null)
    setDropTarget(null, null)
  }, [setDropTarget])

  const registerResizeChild = React.useCallback(
    (path: number[], index: number, node: HTMLElement | null) => {
      const key = `${pathKey(path)}:${index}`
      if (node) {
        resizeElementsRef.current.set(key, node)
      } else {
        resizeElementsRef.current.delete(key)
      }
    },
    [resizeElementsRef]
  )

  const applyResizePreview = React.useCallback(
    (path: number[], sizes: number[]) => {
      sizes.forEach((size, index) => {
        const element = resizeElementsRef.current.get(
          `${pathKey(path)}:${index}`
        )
        if (!element) {
          return
        }
        element.style.flexBasis = `${size}%`
        element.style.flexGrow = String(size)
      })
    },
    [resizeElementsRef]
  )

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

      const rect = container.getBoundingClientRect()
      const axisSize = direction === "row" ? rect.width : rect.height
      if (axisSize <= 0) {
        return
      }

      const startCoordinate =
        direction === "row" ? event.clientX : event.clientY
      const startSizes = [...sizes]
      resizeSession.start({
        event,
        initialValue: startSizes,
        getValue: (moveEvent) => {
          const coordinate =
            direction === "row" ? moveEvent.clientX : moveEvent.clientY
          const deltaPercent = ((coordinate - startCoordinate) / axisSize) * 100
          const nextSizes = [...startSizes]
          nextSizes[index] += deltaPercent
          nextSizes[index + 1] -= deltaPercent
          return clampAdjacentSplitSizes(nextSizes, index)
        },
        onPreview: (nextSizes) => applyResizePreview(path, nextSizes),
        onCommit: (nextSizes) => onResizePath(splitId, path, nextSizes),
        onCancel: () => applyResizePreview(path, startSizes),
      })
    },
    [applyResizePreview, onResizePath, resizeSession, splitId]
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

  const handleResizeKeyDown = React.useCallback(
    (
      event: React.KeyboardEvent<HTMLDivElement>,
      path: number[],
      index: number,
      sizes: number[]
    ) => {
      const decrease = event.key === "ArrowLeft" || event.key === "ArrowUp"
      const increase = event.key === "ArrowRight" || event.key === "ArrowDown"
      if (!decrease && !increase) {
        return
      }

      event.preventDefault()
      const nextSizes = [...sizes]
      nextSizes[index] += increase ? 2 : -2
      nextSizes[index + 1] -= increase ? 2 : -2
      onResizePath(splitId, path, clampAdjacentSplitSizes(nextSizes, index))
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
    <ResizeActivityProvider active={resizeSession.active}>
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
          activeChannel={activeChannel}
          overChannel={overChannel}
          dropEdge={dropEdge}
          registerPane={registerPane}
          registerResizeChild={registerResizeChild}
          renderPane={renderPane}
          onResizeStart={handleResizeStart}
          onResizeReset={handleResizeReset}
          onResizeKeyDown={handleResizeKeyDown}
        />
        <DragOverlay dropAnimation={null}>
          {activeChannel && activePreview ? (
            <DragOverlayPreview
              login={activeChannel}
              label={activePreview.label}
              profileImageUrl={activePreview.profileImageUrl}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </ResizeActivityProvider>
  )
})
