import type { TtsVoiceAssignment } from "@/lib/tts/tts-config"

export const TTS_DATABASE_NAME = "peepochat-tts"
const DB_NAME = TTS_DATABASE_NAME
const DB_VERSION = 1
const ASSIGNMENTS_STORE = "assignments"
const SOUND_EFFECTS_STORE = "soundEffects"

export type TtsSoundEffectAudioRecord = {
  id: string
  blob: Blob
  fileName: string
  mimeType: string
  size: number
}

export type TtsSoundEffectAudioBackup = {
  id: string
  fileName: string
  mimeType: string
  data: string
}

let databasePromise: Promise<IDBDatabase> | null = null

export function closeTtsDatabase() {
  const pending = databasePromise
  databasePromise = null
  void pending?.then(
    (database) => database.close(),
    () => undefined
  )
}

function openTtsDatabase(): Promise<IDBDatabase> {
  if (databasePromise) {
    return databasePromise
  }

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this browser"))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains(ASSIGNMENTS_STORE)) {
        const store = database.createObjectStore(ASSIGNMENTS_STORE, {
          keyPath: "userName",
        })
        store.createIndex("lastSeenAt", "lastSeenAt", { unique: false })
      }

      if (!database.objectStoreNames.contains(SOUND_EFFECTS_STORE)) {
        database.createObjectStore(SOUND_EFFECTS_STORE, { keyPath: "id" })
      }
    }

    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => {
        database.close()
        databasePromise = null
      }
      database.onclose = () => {
        databasePromise = null
      }
      resolve(database)
    }

    request.onerror = () => {
      databasePromise = null
      reject(request.error ?? new Error("Failed to open TTS database"))
    }

    request.onblocked = () => {
      databasePromise = null
      reject(new Error("TTS database is blocked by another tab"))
    }
  })

  return databasePromise
}

function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openTtsDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(storeName, mode)
        const request = run(transaction.objectStore(storeName))

        transaction.oncomplete = () => resolve(request.result)
        transaction.onerror = () =>
          reject(
            request.error ?? transaction.error ?? new Error("TTS store error")
          )
        transaction.onabort = () =>
          reject(
            request.error ??
              transaction.error ??
              new Error("TTS store transaction aborted")
          )
      })
  )
}

function replaceStore<T>(storeName: string, records: T[]): Promise<void> {
  return openTtsDatabase().then(
    (database) =>
      new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(storeName, "readwrite")
        const store = transaction.objectStore(storeName)

        store.clear()
        for (const record of records) {
          store.put(record)
        }

        transaction.oncomplete = () => resolve()
        transaction.onerror = () =>
          reject(transaction.error ?? new Error("TTS store error"))
        transaction.onabort = () =>
          reject(
            transaction.error ?? new Error("TTS store transaction aborted")
          )
      })
  )
}

export function getVoiceAssignment(
  userName: string
): Promise<TtsVoiceAssignment | undefined> {
  return withStore(ASSIGNMENTS_STORE, "readonly", (store) =>
    store.get(userName)
  )
}

export function putVoiceAssignment(
  assignment: TtsVoiceAssignment
): Promise<IDBValidKey> {
  return withStore(ASSIGNMENTS_STORE, "readwrite", (store) =>
    store.put(assignment)
  )
}

export function deleteVoiceAssignment(userName: string): Promise<undefined> {
  return withStore(ASSIGNMENTS_STORE, "readwrite", (store) =>
    store.delete(userName)
  )
}

export function getAllVoiceAssignments(): Promise<TtsVoiceAssignment[]> {
  return withStore(ASSIGNMENTS_STORE, "readonly", (store) => store.getAll())
}

export function replaceVoiceAssignments(
  assignments: TtsVoiceAssignment[]
): Promise<void> {
  return replaceStore(ASSIGNMENTS_STORE, assignments)
}

export async function getVoiceAssignmentPage(
  page: number,
  pageSize: number,
  options: { exclude?: Set<string>; query?: string } = {}
): Promise<{ items: TtsVoiceAssignment[]; total: number }> {
  const database = await openTtsDatabase()
  const query = options.query?.trim().toLowerCase() ?? ""

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(ASSIGNMENTS_STORE, "readonly")
    const index = transaction.objectStore(ASSIGNMENTS_STORE).index("lastSeenAt")
    const request = index.openCursor(null, "prev")
    const items: TtsVoiceAssignment[] = []
    const skip = page * pageSize
    let matched = 0

    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve({ items, total: matched })
        return
      }

      const assignment = cursor.value as TtsVoiceAssignment
      const excluded = options.exclude?.has(assignment.userName) ?? false
      const matchesQuery =
        !query ||
        assignment.userName.includes(query) ||
        assignment.displayName.toLowerCase().includes(query)

      if (!excluded && matchesQuery) {
        if (matched >= skip && items.length < pageSize) {
          items.push(assignment)
        }
        matched += 1
      }

      cursor.continue()
    }

    request.onerror = () =>
      reject(request.error ?? new Error("Failed to read voice assignments"))
  })
}

export function getSoundEffectAudio(
  id: string
): Promise<TtsSoundEffectAudioRecord | undefined> {
  return withStore(SOUND_EFFECTS_STORE, "readonly", (store) => store.get(id))
}

export function putSoundEffectAudio(
  record: TtsSoundEffectAudioRecord
): Promise<IDBValidKey> {
  return withStore(SOUND_EFFECTS_STORE, "readwrite", (store) =>
    store.put(record)
  )
}

export function deleteSoundEffectAudio(id: string): Promise<undefined> {
  return withStore(SOUND_EFFECTS_STORE, "readwrite", (store) =>
    store.delete(id)
  )
}

function getAllSoundEffectAudio(): Promise<TtsSoundEffectAudioRecord[]> {
  return withStore(SOUND_EFFECTS_STORE, "readonly", (store) => store.getAll())
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const chunkSize = 0x8000
  let binary = ""

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }

  return btoa(binary)
}

function base64ToBlob(data: string, mimeType: string): Blob {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new Blob([bytes], { type: mimeType })
}

export async function listSoundEffectAudioBackups(
  ids: string[]
): Promise<TtsSoundEffectAudioBackup[]> {
  const wanted = new Set(ids)
  const records = await getAllSoundEffectAudio()

  return Promise.all(
    records
      .filter((record) => wanted.has(record.id))
      .map(async (record) => ({
        id: record.id,
        fileName: record.fileName,
        mimeType: record.mimeType,
        data: await blobToBase64(record.blob),
      }))
  )
}

export function restoreSoundEffectAudioBackups(
  backups: TtsSoundEffectAudioBackup[]
): Promise<void> {
  return replaceStore(
    SOUND_EFFECTS_STORE,
    backups.map((entry) => {
      const blob = base64ToBlob(entry.data, entry.mimeType)
      return {
        id: entry.id,
        blob,
        fileName: entry.fileName,
        mimeType: entry.mimeType,
        size: blob.size,
      } satisfies TtsSoundEffectAudioRecord
    })
  )
}
