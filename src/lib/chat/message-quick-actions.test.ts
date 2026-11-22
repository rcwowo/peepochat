import { describe, expect, test } from "bun:test"

import {
  MESSAGE_QUICK_ACTION_IDS,
  moveMessageQuickAction,
  normalizeMessageQuickActionOrder,
  type MessageQuickActionId,
} from "@/lib/chat/message-quick-actions"

describe("normalizeMessageQuickActionOrder", () => {
  test("returns the default order for missing or invalid input", () => {
    expect(normalizeMessageQuickActionOrder(undefined)).toEqual([
      ...MESSAGE_QUICK_ACTION_IDS,
    ])
    expect(normalizeMessageQuickActionOrder("copy")).toEqual([
      ...MESSAGE_QUICK_ACTION_IDS,
    ])
  })

  test("keeps a valid custom order", () => {
    const order: MessageQuickActionId[] = [
      "ban",
      "timeout",
      "delete",
      "reply",
      "copy",
    ]
    expect(normalizeMessageQuickActionOrder(order)).toEqual(order)
  })

  test("drops unknown and duplicate entries and appends missing actions", () => {
    expect(
      normalizeMessageQuickActionOrder(["ban", "nope", 4, "ban", "reply"])
    ).toEqual(["ban", "reply", "copy", "delete", "timeout"])
  })
})

describe("moveMessageQuickAction", () => {
  test("moves an action down", () => {
    expect(
      moveMessageQuickAction(MESSAGE_QUICK_ACTION_IDS, "copy", "delete")
    ).toEqual(["reply", "delete", "copy", "timeout", "ban"])
  })

  test("moves an action up", () => {
    expect(
      moveMessageQuickAction(MESSAGE_QUICK_ACTION_IDS, "ban", "reply")
    ).toEqual(["copy", "ban", "reply", "delete", "timeout"])
  })

  test("keeps the order when moving onto itself", () => {
    expect(
      moveMessageQuickAction(MESSAGE_QUICK_ACTION_IDS, "reply", "reply")
    ).toEqual([...MESSAGE_QUICK_ACTION_IDS])
  })

  test("keeps hidden actions in their slots when reordering visible ones", () => {
    const isVisible = (id: MessageQuickActionId) =>
      id === "copy" || id === "reply"
    expect(
      moveMessageQuickAction(
        ["copy", "ban", "reply", "delete", "timeout"],
        "copy",
        "reply",
        isVisible
      )
    ).toEqual(["reply", "ban", "copy", "delete", "timeout"])
    expect(
      moveMessageQuickAction(
        ["delete", "reply", "timeout", "ban", "copy"],
        "copy",
        "reply",
        isVisible
      )
    ).toEqual(["delete", "copy", "timeout", "ban", "reply"])
  })

  test("ignores moves involving hidden actions", () => {
    const order: MessageQuickActionId[] = [
      "copy",
      "ban",
      "reply",
      "delete",
      "timeout",
    ]
    expect(
      moveMessageQuickAction(order, "ban", "copy", (id) => id !== "ban")
    ).toEqual(order)
  })

  test("does not mutate the input", () => {
    const order = [...MESSAGE_QUICK_ACTION_IDS]
    moveMessageQuickAction(order, "copy", "ban")
    expect(order).toEqual([...MESSAGE_QUICK_ACTION_IDS])
  })
})
