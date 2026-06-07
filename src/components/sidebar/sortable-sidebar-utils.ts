import type { PointerEvent } from "react"

/** Prevent row drag when pressing action controls inside a sortable row. */
export function preventRowDrag(event: PointerEvent) {
  event.stopPropagation()
}
