import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { IDBFactory } from "fake-indexeddb"
import { Blob as NativeBlob } from "node:buffer"

import type { TtsVoiceAssignment } from "@/lib/tts/tts-config"
import {
  buildUserDirectoryPage,
  closeTtsDatabase,
  deleteSoundEffectAudio,
  deleteVoiceAssignment,
  getAllVoiceAssignments,
  getSoundEffectAudio,
  getUserDirectoryPage,
  getVoiceAssignment,
  listSoundEffectAudioBackups,
  putSoundEffectAudio,
  putVoiceAssignment,
  replaceTtsData,
  replaceVoiceAssignments,
  restoreSoundEffectAudioBackups,
  type UserDirectoryEntry,
} from "@/lib/tts/tts-db"

const originalIndexedDB = globalThis.indexedDB
const originalBlob = globalThis.Blob

function assignment(
  userName: string,
  voiceProfileId = "voice-default"
): TtsVoiceAssignment {
  return {
    userName,
    displayName: userName.toUpperCase(),
    voiceProfileId,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-02T00:00:00.000Z",
  }
}

function audioBlob(bytes: number[], type = "audio/wav"): Blob {
  return new Blob([new Uint8Array(bytes)], { type })
}

async function blobBytes(blob: Blob): Promise<number[]> {
  return [...new Uint8Array(await blob.arrayBuffer())]
}

beforeEach(() => {
  closeTtsDatabase()
  globalThis.indexedDB = new IDBFactory()
  globalThis.Blob = NativeBlob as unknown as typeof Blob
})

afterEach(() => {
  closeTtsDatabase()
  globalThis.indexedDB = originalIndexedDB
  globalThis.Blob = originalBlob
})

describe("voice assignments", () => {
  test("puts, gets and deletes an assignment", async () => {
    expect(await getVoiceAssignment("alice")).toBeUndefined()

    await putVoiceAssignment(assignment("alice", "v1"))
    expect(await getVoiceAssignment("alice")).toEqual(assignment("alice", "v1"))

    await putVoiceAssignment(assignment("alice", "v2"))
    expect((await getVoiceAssignment("alice"))?.voiceProfileId).toBe("v2")

    await deleteVoiceAssignment("alice")
    expect(await getVoiceAssignment("alice")).toBeUndefined()
  })

  test("replaceVoiceAssignments swaps the whole store", async () => {
    await putVoiceAssignment(assignment("old"))
    await replaceVoiceAssignments([assignment("bob"), assignment("amy")])

    expect(await getAllVoiceAssignments()).toEqual([
      assignment("amy"),
      assignment("bob"),
    ])

    await replaceVoiceAssignments([])
    expect(await getAllVoiceAssignments()).toEqual([])
  })

  test("data persists after the connection is closed and reopened", async () => {
    await putVoiceAssignment(assignment("persist"))
    closeTtsDatabase()

    expect(await getVoiceAssignment("persist")).toEqual(assignment("persist"))
  })

  test("rejects when IndexedDB is unavailable", async () => {
    closeTtsDatabase()
    globalThis.indexedDB = undefined as unknown as IDBFactory

    await expect(getAllVoiceAssignments()).rejects.toThrow(
      "IndexedDB is not available"
    )
  })
})

describe("user directory", () => {
  const includeAll = () => true
  const logins = (entries: UserDirectoryEntry[]) =>
    entries.map((entry) => `${entry.login}${entry.assignment ? "*" : ""}`)

  test("merges extra logins in sorted order without duplicating assigned users", () => {
    const builder = buildUserDirectoryPage(
      0,
      10,
      ["dan", "bob", "bob", "zed"],
      includeAll
    )
    builder.add(assignment("amy"))
    builder.add(assignment("bob"))
    builder.add(assignment("cat"))
    const { items, total } = builder.finish()

    expect(logins(items)).toEqual(["amy*", "bob*", "cat*", "dan", "zed"])
    expect(total).toBe(5)
  })

  test("paginates and reports the filtered total", () => {
    const build = (page: number) => {
      const builder = buildUserDirectoryPage(
        page,
        2,
        ["b", "d"],
        (entry) => entry.login !== "c"
      )
      for (const name of ["a", "c", "e", "f"]) {
        builder.add(assignment(name))
      }
      return builder.finish()
    }

    expect(logins(build(0).items)).toEqual(["a*", "b"])
    expect(logins(build(1).items)).toEqual(["d", "e*"])
    expect(logins(build(2).items)).toEqual(["f*"])
    expect(build(3).items).toEqual([])
    expect(build(0).total).toBe(5)
  })

  test("reads a page from the database", async () => {
    await replaceVoiceAssignments([
      assignment("mia"),
      assignment("ann"),
      assignment("kim"),
    ])

    const page = await getUserDirectoryPage(0, 3, ["bea"], includeAll)
    expect(logins(page.items)).toEqual(["ann*", "bea", "kim*"])
    expect(page.total).toBe(4)
  })
})

describe("sound effect audio", () => {
  test("stores, reads and deletes audio", async () => {
    await putSoundEffectAudio({
      id: "fx",
      blob: audioBlob([1, 2, 3]),
      fileName: "fx.wav",
      mimeType: "audio/wav",
      size: 3,
    })

    const record = await getSoundEffectAudio("fx")
    expect(record?.fileName).toBe("fx.wav")
    expect(await blobBytes(record!.blob)).toEqual([1, 2, 3])

    await deleteSoundEffectAudio("fx")
    expect(await getSoundEffectAudio("fx")).toBeUndefined()
  })

  test("backs up only the requested sounds as base64", async () => {
    await putSoundEffectAudio({
      id: "a",
      blob: audioBlob([0, 1, 254, 255]),
      fileName: "a.wav",
      mimeType: "audio/wav",
      size: 4,
    })
    await putSoundEffectAudio({
      id: "b",
      blob: audioBlob([9]),
      fileName: "b.wav",
      mimeType: "audio/wav",
      size: 1,
    })

    expect(await listSoundEffectAudioBackups(["a", "missing"])).toEqual([
      { id: "a", fileName: "a.wav", mimeType: "audio/wav", data: "AAH+/w==" },
    ])
  })

  test("backup then restore round-trips audio and replaces existing sounds", async () => {
    const bytes = Array.from({ length: 70_000 }, (_, index) => index % 256)
    await putSoundEffectAudio({
      id: "big",
      blob: audioBlob(bytes, "audio/ogg"),
      fileName: "big.ogg",
      mimeType: "audio/ogg",
      size: bytes.length,
    })
    const backups = await listSoundEffectAudioBackups(["big"])

    await deleteSoundEffectAudio("big")
    await putSoundEffectAudio({
      id: "stale",
      blob: audioBlob([1]),
      fileName: "stale.wav",
      mimeType: "audio/wav",
      size: 1,
    })

    await restoreSoundEffectAudioBackups([
      ...backups,
      { id: "corrupt", fileName: "x.wav", mimeType: "audio/wav", data: "%%%" },
    ])

    expect(await getSoundEffectAudio("stale")).toBeUndefined()
    expect(await getSoundEffectAudio("corrupt")).toBeUndefined()

    const restored = await getSoundEffectAudio("big")
    expect(restored).toMatchObject({
      id: "big",
      fileName: "big.ogg",
      mimeType: "audio/ogg",
      size: bytes.length,
    })
    expect(restored?.blob.type).toBe("audio/ogg")
    expect(await blobBytes(restored!.blob)).toEqual(bytes)
  })
})

describe("replaceTtsData", () => {
  async function seed() {
    await putVoiceAssignment(assignment("old"))
    await putSoundEffectAudio({
      id: "old-sound",
      blob: audioBlob([9]),
      fileName: "old.wav",
      mimeType: "audio/wav",
      size: 1,
    })
  }

  test("replaces assignments and sound audio together", async () => {
    await seed()

    await replaceTtsData({
      assignments: [assignment("new")],
      soundEffectAudio: [
        {
          id: "new-sound",
          fileName: "new.wav",
          mimeType: "audio/wav",
          data: "AQI=",
        },
      ],
    })

    expect(
      (await getAllVoiceAssignments()).map((entry) => entry.userName)
    ).toEqual(["new"])
    expect(await getSoundEffectAudio("old-sound")).toBeUndefined()
    const sound = await getSoundEffectAudio("new-sound")
    expect(await blobBytes(sound!.blob)).toEqual([1, 2])
  })

  test("leaves both stores untouched when any write fails", async () => {
    await seed()

    await expect(
      replaceTtsData({
        assignments: [{} as TtsVoiceAssignment],
        soundEffectAudio: [
          {
            id: "new-sound",
            fileName: "new.wav",
            mimeType: "audio/wav",
            data: "AQI=",
          },
        ],
      })
    ).rejects.toBeDefined()

    expect(
      (await getAllVoiceAssignments()).map((entry) => entry.userName)
    ).toEqual(["old"])
    expect(await getSoundEffectAudio("old-sound")).toBeDefined()
    expect(await getSoundEffectAudio("new-sound")).toBeUndefined()
  })
})
