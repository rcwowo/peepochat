import { describe, expect, test } from "bun:test"

import {
  formatBackupDate,
  formatBackupMeta,
} from "@/lib/peepochat/backup-format"

describe("formatBackupDate", () => {
  test("returns null for missing or invalid dates", () => {
    expect(formatBackupDate(null)).toBeNull()
    expect(formatBackupDate("")).toBeNull()
    expect(formatBackupDate("not a date")).toBeNull()
  })

  test("formats valid timestamps", () => {
    expect(formatBackupDate("2026-11-22T12:00:00.000Z")).toEqual(
      expect.any(String)
    )
  })
})

describe("formatBackupMeta", () => {
  test("returns null when nothing is known", () => {
    expect(formatBackupMeta(null, null)).toBeNull()
    expect(formatBackupMeta("invalid", null)).toBeNull()
  })

  test("shows the version alone when the date is missing", () => {
    expect(formatBackupMeta(null, "1.4.0")).toBe("v1.4.0")
  })

  test("joins the date and version", () => {
    const date = formatBackupDate("2026-11-22T12:00:00.000Z")
    expect(formatBackupMeta("2026-11-22T12:00:00.000Z", "1.4.0")).toBe(
      `${date} · v1.4.0`
    )
  })
})
