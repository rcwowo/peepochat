import { closeTtsDatabase, TTS_DATABASE_NAME } from "@/lib/tts/tts-db"
import { CUSTOM_SOUNDS_DATABASE_NAME } from "@/lib/highlights/custom-sounds"

const DELETE_TIMEOUT_MS = 3000

function deleteIndexedDatabase(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(true)
      return
    }

    let settled = false
    const finish = (deleted: boolean) => {
      if (!settled) {
        settled = true
        window.clearTimeout(timeout)
        resolve(deleted)
      }
    }
    const timeout = window.setTimeout(() => finish(false), DELETE_TIMEOUT_MS)
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => finish(true)
    request.onerror = () => finish(false)
  })
}

export async function deleteAllLocalData(): Promise<boolean> {
  closeTtsDatabase()
  const results = await Promise.all([
    deleteIndexedDatabase(TTS_DATABASE_NAME),
    deleteIndexedDatabase(CUSTOM_SOUNDS_DATABASE_NAME),
  ])
  window.localStorage.clear()
  return results.every(Boolean)
}
