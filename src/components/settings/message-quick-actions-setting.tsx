import * as React from "react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  BanIcon,
  ClockIcon,
  CopyIcon,
  CornerUpLeftIcon,
  GripVerticalIcon,
  Trash2Icon,
} from "lucide-react"

import { SettingsGroup } from "@/components/settings/settings-primitives"
import { Switch } from "@/components/ui/switch"
import {
  isMessageQuickActionId,
  moveMessageQuickAction,
  type MessageQuickActionId,
} from "@/lib/chat/message-quick-actions"
import { restrictToVerticalContainer } from "@/lib/dnd/modifiers"
import type { MessageQuickActionsConfig } from "@/lib/peepochat/peepochat-config"
import { cn } from "@/lib/utils"

type QuickActionEnabledKey = Exclude<keyof MessageQuickActionsConfig, "order">

type QuickActionMeta = {
  title: string
  icon: React.ComponentType<{ className?: string }>
  enabledKey: QuickActionEnabledKey
  requires: "none" | "delete" | "moderate"
}

const QUICK_ACTION_META: Record<MessageQuickActionId, QuickActionMeta> = {
  copy: {
    title: "Copy message",
    icon: CopyIcon,
    enabledKey: "copyEnabled",
    requires: "none",
  },
  reply: {
    title: "Reply",
    icon: CornerUpLeftIcon,
    enabledKey: "replyEnabled",
    requires: "none",
  },
  delete: {
    title: "Delete message",
    icon: Trash2Icon,
    enabledKey: "deleteEnabled",
    requires: "delete",
  },
  timeout: {
    title: "Timeout",
    icon: ClockIcon,
    enabledKey: "timeoutEnabled",
    requires: "moderate",
  },
  ban: {
    title: "Ban",
    icon: BanIcon,
    enabledKey: "banEnabled",
    requires: "moderate",
  },
}

const quickActionDragModifiers: Modifier[] = [restrictToVerticalContainer]

function SortableQuickActionRow({
  id,
  checked,
  onCheckedChange,
}: {
  id: MessageQuickActionId
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const meta = QUICK_ACTION_META[id]
  const Icon = meta.icon
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "relative flex items-center gap-3 bg-background py-2.5 pr-3 pl-1.5",
        isDragging && "z-10 shadow-sm"
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Reorder ${meta.title}`}
        data-settings-sorting={isDragging ? "" : undefined}
        className="flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 text-sm leading-tight font-medium">
        {meta.title}
      </div>
      <Switch
        checked={checked}
        aria-label={meta.title}
        onCheckedChange={onCheckedChange}
      />
    </div>
  )
}

export function MessageQuickActionsSetting({
  value,
  canDeleteMessages,
  canModerateUsers,
  onChange,
}: {
  value: MessageQuickActionsConfig
  canDeleteMessages: boolean
  canModerateUsers: boolean
  onChange: (
    update: (current: MessageQuickActionsConfig) => MessageQuickActionsConfig
  ) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const isVisible = React.useCallback(
    (id: MessageQuickActionId) => {
      const { requires } = QUICK_ACTION_META[id]
      if (requires === "delete") {
        return canDeleteMessages
      }
      if (requires === "moderate") {
        return canModerateUsers
      }
      return true
    },
    [canDeleteMessages, canModerateUsers]
  )

  const visibleIds = React.useMemo(
    () => value.order.filter(isVisible),
    [isVisible, value.order]
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) {
      return
    }

    const activeId = String(active.id)
    const overId = String(over.id)
    if (!isMessageQuickActionId(activeId) || !isMessageQuickActionId(overId)) {
      return
    }

    onChange((current) => ({
      ...current,
      order: moveMessageQuickAction(current.order, activeId, overId, isVisible),
    }))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={quickActionDragModifiers}
      autoScroll={false}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={visibleIds}
        strategy={verticalListSortingStrategy}
      >
        <SettingsGroup>
          {visibleIds.map((id) => {
            const { enabledKey } = QUICK_ACTION_META[id]
            return (
              <SortableQuickActionRow
                key={id}
                id={id}
                checked={value[enabledKey]}
                onCheckedChange={(checked) =>
                  onChange((current) => ({
                    ...current,
                    [enabledKey]: checked,
                  }))
                }
              />
            )
          })}
        </SettingsGroup>
      </SortableContext>
    </DndContext>
  )
}
