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
          reject(transaction.error ?? new Error("Sound store transaction failed"))
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

  const url = URL.createObjectURL(new Blob([record.data], { type: record.mimeType }))
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
