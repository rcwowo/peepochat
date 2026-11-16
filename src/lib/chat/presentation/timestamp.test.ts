import { describe, expect, test } from "bun:test"

import { formatMessageTimestamp } from "@/lib/chat/presentation/timestamp"

const AFTERNOON = "2024-01-01T15:04:00.000Z"
const MORNING = "2024-01-01T03:04:00.000Z"

function dayPeriodOf(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .formatToParts(new Date(value))
    .find((part) => part.type === "dayPeriod")?.value
}

describe("formatMessageTimestamp", () => {
  test("hides timestamps when disabled", () => {
    expect(formatMessageTimestamp(AFTERNOON, "none")).toBeNull()
  })

  test("returns unparseable values unchanged", () => {
    expect(formatMessageTimestamp("not a date", "24-hour")).toBe("not a date")
    expect(formatMessageTimestamp("", "12-hour")).toBe("")
  })

  test("24-hour output has no day period", () => {
    for (const value of [AFTERNOON, MORNING]) {
      const dayPeriod = dayPeriodOf(value)
      const formatted = formatMessageTimestamp(value, "24-hour")!
      if (dayPeriod) {
        expect(formatted).not.toContain(dayPeriod)
      }
    }
  })

  test("12-hour output is the meridiem output without its day period", () => {
    for (const value of [AFTERNOON, MORNING]) {
      const dayPeriod = dayPeriodOf(value)!
      const withMeridiem = formatMessageTimestamp(value, "12-hour-meridiem")!
      const withoutMeridiem = formatMessageTimestamp(value, "12-hour")!

      expect(withMeridiem).toContain(dayPeriod)
      expect(withoutMeridiem).not.toContain(dayPeriod)
      expect(withoutMeridiem).toBe(withoutMeridiem.trim())
      expect(withMeridiem.replace(dayPeriod, "").trim()).toBe(withoutMeridiem)
    }
  })
})
