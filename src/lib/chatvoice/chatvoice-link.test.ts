import { afterEach, describe, expect, test } from "bun:test"

import {
  captureChatvoiceImportLink,
  clearChatvoiceImportPending,
  isChatvoiceImportPending,
} from "@/lib/chatvoice/chatvoice-link"

function visit(path: string) {
  window.history.replaceState(null, "", path)
}

afterEach(() => {
  visit("/")
})

describe("captureChatvoiceImportLink", () => {
  test("marks the import as pending and strips the parameter", () => {
    visit("/app?cv_import=1&channel=foo#top")

    expect(captureChatvoiceImportLink()).toBe(true)
    expect(isChatvoiceImportPending()).toBe(true)
    expect(window.location.pathname).toBe("/app")
    expect(window.location.search).toBe("?channel=foo")
    expect(window.location.hash).toBe("#top")
  })

  test("keeps the pending flag across later visits without the parameter", () => {
    visit("/app?cv_import=true")
    captureChatvoiceImportLink()

    visit("/app?code=oauth-code")
    expect(captureChatvoiceImportLink()).toBe(true)
    expect(window.location.search).toBe("?code=oauth-code")
  })

  test("ignores disabled parameter values but still strips them", () => {
    visit("/app?cv_import=0")

    expect(captureChatvoiceImportLink()).toBe(false)
    expect(window.location.search).toBe("")
  })

  test("does nothing for regular visits", () => {
    visit("/app")
    expect(captureChatvoiceImportLink()).toBe(false)
  })

  test("can be cleared once handled", () => {
    visit("/app?cv_import=1")
    captureChatvoiceImportLink()
    clearChatvoiceImportPending()
    expect(isChatvoiceImportPending()).toBe(false)
  })
})
