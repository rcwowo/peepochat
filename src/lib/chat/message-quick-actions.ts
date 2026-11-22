export const MESSAGE_QUICK_ACTION_IDS = [
  "copy",
  "reply",
  "delete",
  "timeout",
  "ban",
] as const

export type MessageQuickActionId = (typeof MESSAGE_QUICK_ACTION_IDS)[number]

export function isMessageQuickActionId(
  value: unknown
): value is MessageQuickActionId {
  return (
    typeof value === "string" &&
    (MESSAGE_QUICK_ACTION_IDS as readonly string[]).includes(value)
  )
}

export function createDefaultMessageQuickActionOrder(): MessageQuickActionId[] {
  return [...MESSAGE_QUICK_ACTION_IDS]
}

export function normalizeMessageQuickActionOrder(
  input: unknown
): MessageQuickActionId[] {
  const order = new Set<MessageQuickActionId>()
  if (Array.isArray(input)) {
    for (const value of input) {
      if (isMessageQuickActionId(value)) {
        order.add(value)
      }
    }
  }
  for (const id of MESSAGE_QUICK_ACTION_IDS) {
    order.add(id)
  }
  return [...order]
}

export function moveMessageQuickAction(
  order: readonly MessageQuickActionId[],
  activeId: MessageQuickActionId,
  overId: MessageQuickActionId,
  isVisible: (id: MessageQuickActionId) => boolean = () => true
): MessageQuickActionId[] {
  const normalized = normalizeMessageQuickActionOrder(order)
  const visible = normalized.filter(isVisible)
  const fromIndex = visible.indexOf(activeId)
  const toIndex = visible.indexOf(overId)
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return normalized
  }

  const reordered = [...visible]
  reordered.splice(fromIndex, 1)
  reordered.splice(toIndex, 0, activeId)

  let nextVisibleIndex = 0
  return normalized.map((id) =>
    isVisible(id) ? reordered[nextVisibleIndex++] : id
  )
}
