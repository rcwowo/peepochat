import * as React from "react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { cn } from "@/lib/utils"
import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar"

type SortableSidebarListProps = {
  itemIds: string[]
  onReorder: (activeId: string, overId: string) => void
  children: (itemId: string) => React.ReactNode
  className?: string
}

function SortableSidebarRow({
  id,
  children,
}: {
  id: string
  children: React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <SidebarMenuItem
      ref={setNodeRef}
      style={style}
      data-dragging={isDragging ? "true" : "false"}
      className={cn(
        "w-full group-data-[collapsible=icon]:w-full",
        "touch-none",
        "[&_button]:cursor-pointer [&_img]:cursor-pointer",
        "data-[dragging=true]:cursor-grabbing data-[dragging=true]:[&_button]:cursor-grabbing data-[dragging=true]:[&_img]:cursor-grabbing",
        isDragging && "z-10 opacity-60"
      )}
      {...attributes}
      {...listeners}
    >
      {children}
    </SidebarMenuItem>
  )
}

export function SortableSidebarList({
  itemIds,
  onReorder,
  children,
  className,
}: SortableSidebarListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) {
      return
    }

    onReorder(String(active.id), String(over.id))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <SidebarMenu className={className}>
          {itemIds.map((itemId) => (
            <SortableSidebarRow key={itemId} id={itemId}>
              {children(itemId)}
            </SortableSidebarRow>
          ))}
        </SidebarMenu>
      </SortableContext>
    </DndContext>
  )
}
