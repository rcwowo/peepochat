const DB_NAME = "peepochat-sounds"
const STORE_NAME = "sounds"
const DB_VERSION = 1

export const MAX_CUSTOM_SOUND_BYTES = 1024 * 1024

export type StoredCustomSound = {
  id: string
  name: string
  mimeType: string
  data: ArrayBuffer
  createdAt: string
}

const objectUrlCache = new Map<string, string>()

function openSoundDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open sound database"))
    }

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" })
      }
    }

    request.onsuccess = () => {
      resolve(request.result)
    }
  })
}

function runSoundStoreTransaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openSoundDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode)
        const store = transaction.objectStore(STORE_NAME)
        const request = run(store)

        request.onerror = () => {
          reject(request.error ?? new Error("Sound store transaction failed"))
        }

        transaction.oncomplete = () => {
          resolve(request.result)
        }

        transaction.onerror = () => {
          reject(
            transaction.error ?? new Error("Sound store transaction failed")
          )
        }
      })
  )
}

export function createCustomSoundId() {
  return `sound-${crypto.randomUUID()}`
}

export async function saveCustomSound(
  file: File,
  id = createCustomSoundId()
): Promise<StoredCustomSound> {
  if (!file.type.startsWith("audio/")) {
    throw new Error("Only audio files are supported")
  }

  if (file.size > MAX_CUSTOM_SOUND_BYTES) {
    throw new Error("Sound file must be 1 MB or smaller")
  }

  const data = await file.arrayBuffer()
  const record: StoredCustomSound = {
    id,
    name: file.name.trim() || "Custom sound",
    mimeType: file.type || "audio/mpeg",
    data,
    createdAt: new Date().toISOString(),
  }

  await runSoundStoreTransaction("readwrite", (store) => store.put(record))
  revokeCustomSoundObjectUrl(id)
  return record
}

export async function getCustomSound(
  id: string
): Promise<StoredCustomSound | null> {
  const result = await runSoundStoreTransaction<StoredCustomSound | undefined>(
    "readonly",
    (store) => store.get(id)
  )
  return result ?? null
}

export async function deleteCustomSound(id: string): Promise<void> {
  revokeCustomSoundObjectUrl(id)
  await runSoundStoreTransaction("readwrite", (store) => store.delete(id))
}

export async function getCustomSoundObjectUrl(
  id: string
): Promise<string | null> {
  const cached = objectUrlCache.get(id)
  if (cached) {
    return cached
  }

  const record = await getCustomSound(id)
  if (!record) {
    return null
  }

  const url = URL.createObjectURL(
    new Blob([record.data], { type: record.mimeType })
  )
  objectUrlCache.set(id, url)
  return url
}

export function revokeCustomSoundObjectUrl(id: string) {
  const cached = objectUrlCache.get(id)
  if (!cached) {
    return
  }

  URL.revokeObjectURL(cached)
  objectUrlCache.delete(id)
}

export type EmbeddedCustomSound = {
  id: string
  name: string
  mimeType: string
  data: string
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
    )
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

/** Create a playable object URL from an embedded base64 sound. Caller revokes. */
export function createEmbeddedSoundUrl(
  mimeType: string,
  base64: string
): string {
  const buffer = base64ToArrayBuffer(base64)
  return URL.createObjectURL(new Blob([buffer], { type: mimeType }))
}

export async function listEmbeddedCustomSounds(
  referencedIds: string[]
): Promise<EmbeddedCustomSound[]> {
  const embedded: EmbeddedCustomSound[] = []
  const seen = new Set<string>()

  for (const id of referencedIds) {
    if (!id || seen.has(id)) continue
    seen.add(id)

    const record = await getCustomSound(id)
    if (!record) continue

    embedded.push({
      id: record.id,
      name: record.name,
      mimeType: record.mimeType,
      data: arrayBufferToBase64(record.data),
    })
  }

  return embedded
}

export async function restoreEmbeddedCustomSounds(
  embedded: unknown
): Promise<void> {
  if (!Array.isArray(embedded)) return

  for (const entry of embedded) {
    if (!entry || typeof entry !== "object") continue

    const sound = entry as Partial<EmbeddedCustomSound>
    if (
      typeof sound.id !== "string" ||
      typeof sound.name !== "string" ||
      typeof sound.mimeType !== "string" ||
      typeof sound.data !== "string" ||
      !sound.data
    ) {
      continue
    }

    try {
      const data = base64ToArrayBuffer(sound.data)
      if (data.byteLength > MAX_CUSTOM_SOUND_BYTES) continue

      const record: StoredCustomSound = {
        id: sound.id,
        name: sound.name.trim() || "Custom sound",
        mimeType: sound.mimeType.startsWith("audio/")
          ? sound.mimeType
          : "audio/mpeg",
        data,
        createdAt: new Date().toISOString(),
      }

      await runSoundStoreTransaction("readwrite", (store) =>
        store.put(record)
      )
      revokeCustomSoundObjectUrl(record.id)
    } catch {
      continue
    }
  }
}
