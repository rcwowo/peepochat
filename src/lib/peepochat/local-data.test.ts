import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { IDBFactory } from "fake-indexeddb"

import {
  getCustomSound,
  restoreEmbeddedCustomSounds,
} from "@/lib/highlights/custom-sounds"
import { deleteAllLocalData } from "@/lib/peepochat/local-data"
import {
  closeTtsDatabase,
  getVoiceAssignment,
  putVoiceAssignment,
} from "@/lib/tts/tts-db"

const originalIndexedDB = globalThis.indexedDB

beforeEach(() => {
  closeTtsDatabase()
  globalThis.indexedDB = new IDBFactory()
})

afterEach(() => {
  closeTtsDatabase()
  globalThis.indexedDB = originalIndexedDB
})

describe("deleteAllLocalData", () => {
  test("wipes localStorage and both IndexedDB databases", async () => {
    window.localStorage.setItem("peepochat::config", "{}")
    await putVoiceAssignment({
      userName: "alice",
      displayName: "Alice",
      voiceProfileId: "v1",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
    })
    await restoreEmbeddedCustomSounds([
      { id: "s", name: "S", mimeType: "audio/ogg", data: "AQ==" },
    ])

    expect(await deleteAllLocalData()).toBe(true)

    expect(window.localStorage.length).toBe(0)
    expect(await getVoiceAssignment("alice")).toBeUndefined()
    expect(await getCustomSound("s")).toBeNull()
  })

  test("still clears localStorage when IndexedDB is unavailable", async () => {
    globalThis.indexedDB = undefined as unknown as IDBFactory
    window.localStorage.setItem("peepochat::config", "{}")

    expect(await deleteAllLocalData()).toBe(true)
    expect(window.localStorage.length).toBe(0)
  })
})
