import { afterEach, describe, expect, test } from "bun:test"

import { HOTKEY_BINDINGS } from "@/lib/hotkeys/bindings"
import {
  canRestoreComposerFocus,
  getOpenHotkeySurface,
  getSearchPrefill,
  isComposerActive,
  isOverlayElementOpen,
  matchHotkey,
} from "@/lib/hotkeys/match"

function key(code: string, init: KeyboardEventInit = {}) {
  return new KeyboardEvent("keydown", {
    code,
    cancelable: true,
    ...init,
  })
}

afterEach(() => {
  document.body.innerHTML = ""
  window.getSelection()?.removeAllRanges()
})

describe("HOTKEY_BINDINGS", () => {
  test("never assigns the same combo to two bindings", () => {
    const seen = new Set<string>()
    for (const { combo } of HOTKEY_BINDINGS) {
      const id = [
        Boolean(combo.ctrlOrMeta),
        Boolean(combo.alt),
        Boolean(combo.shift),
        combo.code,
      ].join("|")
      expect(seen.has(id)).toBe(false)
      seen.add(id)
    }
  })

  test("maps Alt+1..9 to sidebar slots 0..8 and Alt+0 to slot 9", () => {
    const slots = HOTKEY_BINDINGS.flatMap((binding) =>
      binding.action === "sidebar.select"
        ? [[binding.combo.code, binding.index] as const]
        : []
    )

    expect(slots).toHaveLength(10)
    for (const [code, index] of slots) {
      const digit = Number(code.replace("Digit", ""))
      expect(index).toBe(digit === 0 ? 9 : digit - 1)
    }
  })
})

describe("matchHotkey", () => {
  test("accepts either Ctrl or Meta for ctrlOrMeta bindings", () => {
    expect(matchHotkey(key("KeyF", { ctrlKey: true }))?.action).toBe(
      "search.open"
    )
    expect(matchHotkey(key("KeyF", { metaKey: true }))?.action).toBe(
      "search.open"
    )
  })

  test("matches on physical key code regardless of the produced character", () => {
    expect(matchHotkey(key("KeyT", { altKey: true, key: "†" }))?.action).toBe(
      "channel.add"
    )
  })

  test("requires modifiers to match exactly", () => {
    expect(matchHotkey(key("KeyN", { altKey: true }))?.action).toBe(
      "notifications.open"
    )
    expect(
      matchHotkey(key("KeyN", { altKey: true, shiftKey: true }))?.action
    ).toBe("dnd.toggle")
    expect(matchHotkey(key("KeyF"))).toBeNull()
    expect(matchHotkey(key("KeyF", { ctrlKey: true, altKey: true }))).toBeNull()
    expect(matchHotkey(key("KeyS", { altKey: true, ctrlKey: true }))).toBeNull()
    expect(
      matchHotkey(key("KeyF", { ctrlKey: true, shiftKey: true }))
    ).toBeNull()
  })

  test("returns the sidebar index for digit shortcuts", () => {
    expect(matchHotkey(key("Digit3", { altKey: true }))).toMatchObject({
      action: "sidebar.select",
      index: 2,
    })
    expect(matchHotkey(key("Digit0", { altKey: true }))).toMatchObject({
      action: "sidebar.select",
      index: 9,
    })
    expect(matchHotkey(key("Numpad3", { altKey: true }))).toBeNull()
  })

  test("does not include an index for other actions", () => {
    expect(matchHotkey(key("KeyS", { altKey: true }))).not.toHaveProperty(
      "index"
    )
  })

  test("ignores repeated, composing and already handled events", () => {
    expect(matchHotkey(key("KeyS", { altKey: true, repeat: true }))).toBeNull()
    expect(
      matchHotkey(key("KeyS", { altKey: true, isComposing: true }))
    ).toBeNull()

    const handled = key("KeyS", { altKey: true })
    handled.preventDefault()
    expect(matchHotkey(handled)).toBeNull()
  })
})

describe("overlay surfaces", () => {
  function mount(html: string) {
    document.body.innerHTML = html
  }

  test("treats data-closed and data-state=closed as closed", () => {
    const element = document.createElement("div")

    expect(isOverlayElementOpen(element)).toBe(true)
    element.setAttribute("data-state", "open")
    expect(isOverlayElementOpen(element)).toBe(true)
    element.setAttribute("data-state", "closed")
    expect(isOverlayElementOpen(element)).toBe(false)
    element.removeAttribute("data-state")
    element.setAttribute("data-closed", "")
    expect(isOverlayElementOpen(element)).toBe(false)
  })

  test("returns null when nothing is open", () => {
    mount('<div data-slot="dialog-content" data-state="closed"></div>')

    expect(getOpenHotkeySurface()).toBeNull()
    expect(canRestoreComposerFocus()).toBe(true)
  })

  test("prefers an open marked surface over generic overlays", () => {
    mount(`
      <div data-hotkey-surface="search" data-state="closed"></div>
      <div data-slot="dialog-content"></div>
      <div data-hotkey-surface="settings" data-state="open"></div>
    `)

    expect(getOpenHotkeySurface()).toBe("settings")
    expect(canRestoreComposerFocus()).toBe(false)
  })

  test("falls back to sheet before dialog", () => {
    mount(`
      <div data-slot="dialog-content"></div>
      <div data-slot="sheet-content"></div>
    `)

    expect(getOpenHotkeySurface()).toBe("sheet")
  })

  test("allows restoring composer focus over the viewer list", () => {
    mount('<div data-hotkey-surface="viewer-list"></div>')

    expect(getOpenHotkeySurface()).toBe("viewer-list")
    expect(canRestoreComposerFocus()).toBe(true)
  })
})

describe("isComposerActive", () => {
  test("is true only while focus is inside the chat composer", () => {
    document.body.innerHTML = `
      <div data-chat-composer><textarea id="inside"></textarea></div>
      <input id="outside" />
    `

    document.getElementById("inside")!.focus()
    expect(isComposerActive()).toBe(true)
    document.getElementById("outside")!.focus()
    expect(isComposerActive()).toBe(false)
  })
})

describe("getSearchPrefill", () => {
  function select(text: string) {
    document.body.innerHTML = ""
    const element = document.createElement("p")
    element.textContent = text
    document.body.append(element)
    const range = document.createRange()
    range.selectNodeContents(element)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  }

  test("uses a short single-line trimmed selection", () => {
    select("  Kappa  ")

    expect(getSearchPrefill()).toBe("Kappa")
  })

  test("ignores empty, multi-line and overly long selections", () => {
    expect(getSearchPrefill()).toBeUndefined()
    select("line one\nline two")
    expect(getSearchPrefill()).toBeUndefined()
    select("x".repeat(81))
    expect(getSearchPrefill()).toBeUndefined()
    select("x".repeat(80))
    expect(getSearchPrefill()).toBe("x".repeat(80))
  })
})
