import { describe, expect, test } from "bun:test"

import {
  CHANGELOG,
  getAppVersion,
  hasNewVersion,
  initLastSeenVersion,
  markVersionSeen,
} from "@/lib/changelog"

const LAST_SEEN_KEY = "peepochat::last-seen-version"

function compareVersions(left: string, right: string) {
  const a = left.split(".").map(Number)
  const b = right.split(".").map(Number)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

describe("CHANGELOG", () => {
  test("lists unique, well-formed entries newest first", () => {
    expect(CHANGELOG.length).toBeGreaterThan(0)

    for (const entry of CHANGELOG) {
      expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(entry.items.length).toBeGreaterThan(0)
    }

    for (let index = 1; index < CHANGELOG.length; index += 1) {
      const newer = CHANGELOG[index - 1]!
      const older = CHANGELOG[index]!
      expect(compareVersions(newer.version, older.version)).toBeGreaterThan(0)
    }
  })
})

describe("version tracking", () => {
  test("reports the injected app version", () => {
    expect(getAppVersion()).toBe(__APP_VERSION__)
  })

  test("does not flag a new version on the first visit", () => {
    expect(hasNewVersion()).toBe(false)
  })

  test("initLastSeenVersion only seeds an empty value", () => {
    initLastSeenVersion()
    expect(localStorage.getItem(LAST_SEEN_KEY)).toBe(getAppVersion())
    expect(hasNewVersion()).toBe(false)

    localStorage.setItem(LAST_SEEN_KEY, "0.0.1")
    initLastSeenVersion()
    expect(localStorage.getItem(LAST_SEEN_KEY)).toBe("0.0.1")
  })

  test("flags a differing stored version until markVersionSeen silences the session", () => {
    localStorage.setItem(LAST_SEEN_KEY, "0.0.1")
    expect(hasNewVersion()).toBe(true)

    markVersionSeen()

    expect(localStorage.getItem(LAST_SEEN_KEY)).toBe(getAppVersion())
    localStorage.setItem(LAST_SEEN_KEY, "0.0.1")
    expect(hasNewVersion()).toBe(false)
  })
})
