import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { IDBFactory } from "fake-indexeddb"

import {
  MAX_CUSTOM_SOUND_BYTES,
  deleteCustomSound,
  getCustomSound,
  listEmbeddedCustomSounds,
  restoreEmbeddedCustomSounds,
  saveCustomSound,
} from "@/lib/highlights/custom-sounds"

const originalIndexedDB = globalThis.indexedDB

function bytesOf(buffer: ArrayBuffer): number[] {
  return [...new Uint8Array(buffer)]
}

function base64OfSize(size: number): string {
  return btoa("\0".repeat(size))
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

afterEach(() => {
  globalThis.indexedDB = originalIndexedDB
})

describe("saveCustomSound", () => {
  test("stores an audio file and reads it back", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "  ding.mp3 ", {
      type: "audio/mpeg",
    })
    const saved = await saveCustomSound(file, "sound-1")

    expect(saved).toMatchObject({
      id: "sound-1",
      name: "ding.mp3",
      mimeType: "audio/mpeg",
    })

    const stored = await getCustomSound("sound-1")
    expect(stored?.name).toBe("ding.mp3")
    expect(bytesOf(stored!.data)).toEqual([1, 2, 3])
  })

  test("rejects non-audio files", async () => {
    const file = new File(["hello"], "notes.txt", { type: "text/plain" })
    await expect(saveCustomSound(file, "x")).rejects.toThrow(
      "Only audio files are supported"
    )
    expect(await getCustomSound("x")).toBeNull()
  })

  test("rejects files over the size limit", async () => {
    const file = new File(
      [new Uint8Array(MAX_CUSTOM_SOUND_BYTES + 1)],
      "huge.wav",
      { type: "audio/wav" }
    )
    await expect(saveCustomSound(file, "x")).rejects.toThrow("1 MB")
  })

  test("deleteCustomSound removes the sound", async () => {
    await saveCustomSound(
      new File([new Uint8Array([1])], "a.wav", { type: "audio/wav" }),
      "gone"
    )
    await deleteCustomSound("gone")
    expect(await getCustomSound("gone")).toBeNull()
  })
})

describe("embedded custom sounds", () => {
  test("restore then list round-trips sound data", async () => {
    await restoreEmbeddedCustomSounds([
      { id: "a", name: "Alpha", mimeType: "audio/ogg", data: "AAH+/w==" },
      { id: "b", name: "Beta", mimeType: "audio/wav", data: "AQ==" },
    ])

    expect(
      await listEmbeddedCustomSounds(["b", "a", "a", "", "missing"])
    ).toEqual([
      { id: "b", name: "Beta", mimeType: "audio/wav", data: "AQ==" },
      { id: "a", name: "Alpha", mimeType: "audio/ogg", data: "AAH+/w==" },
    ])
  })

  test("skips malformed, corrupt and oversized entries", async () => {
    await restoreEmbeddedCustomSounds([
      null,
      "sound",
      { id: "no-data", name: "x", mimeType: "audio/ogg", data: "" },
      { id: 5, name: "x", mimeType: "audio/ogg", data: "AQ==" },
      { id: "corrupt", name: "x", mimeType: "audio/ogg", data: "%%%" },
      {
        id: "too-big",
        name: "x",
        mimeType: "audio/ogg",
        data: base64OfSize(MAX_CUSTOM_SOUND_BYTES + 1),
      },
      { id: "ok", name: "Ok", mimeType: "audio/ogg", data: "AQ==" },
    ])

    expect(await getCustomSound("no-data")).toBeNull()
    expect(await getCustomSound("corrupt")).toBeNull()
    expect(await getCustomSound("too-big")).toBeNull()
    expect(await getCustomSound("ok")).not.toBeNull()
  })

  test("sanitizes names and non-audio mime types", async () => {
    await restoreEmbeddedCustomSounds([
      { id: "a", name: "   ", mimeType: "text/html", data: "AQ==" },
    ])

    const stored = await getCustomSound("a")
    expect(stored?.name).toBe("Custom sound")
    expect(stored?.mimeType).toBe("audio/mpeg")
  })

  test("ignores non-array input", async () => {
    await restoreEmbeddedCustomSounds({ id: "a" })
    await restoreEmbeddedCustomSounds(null)
    expect(await listEmbeddedCustomSounds(["a"])).toEqual([])
  })
})
