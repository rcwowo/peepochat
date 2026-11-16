import { describe, expect, test } from "bun:test"

import {
  looksLikeDuration,
  type DurationParseResult,
  parseFollowersDuration,
  parseSlowModeWaitTime,
  parseTimeoutDuration,
} from "@/lib/chat/commands/durations"

const invalid: DurationParseResult = { ok: false, error: "invalid" }
const outOfRange: DurationParseResult = { ok: false, error: "out_of_range" }

describe("looksLikeDuration", () => {
  test.each(["10", "10m", "10x", "0", "-5", "+5", ".5", "3w"])(
    "%p looks like a duration",
    (token) => {
      expect(looksLikeDuration(token)).toBe(true)
    }
  )

  test.each(["", "spam", "m10", "@user", "-", "x10"])(
    "%p does not look like a duration",
    (token) => {
      expect(looksLikeDuration(token)).toBe(false)
    }
  )
})

describe("parseTimeoutDuration", () => {
  test.each([
    ["1", 1],
    ["600", 600],
    ["30s", 30],
    ["10m", 600],
    ["10M", 600],
    ["1h", 3600],
    ["1d", 86400],
    ["1w", 604800],
    ["2w", 1209600],
    ["1d2h", 93600],
    ["1w7d", 1209600],
    ["10min", 600],
    ["1209600", 1209600],
  ])("%p is %p seconds", (input, seconds) => {
    expect(parseTimeoutDuration(input)).toEqual({ ok: true, value: seconds })
  })

  test.each(["10x", "abc", "", "-5", "+5", "1.5h", "m", "10m5", "10 m x"])(
    "%p is invalid",
    (input) => {
      expect(parseTimeoutDuration(input)).toEqual(invalid)
    }
  )

  test.each(["0", "0s", "3w", "1209601", "15d", "1mo", "99999999999999999999"])(
    "%p is out of range",
    (input) => {
      expect(parseTimeoutDuration(input)).toEqual(outOfRange)
    }
  )
})

describe("parseFollowersDuration", () => {
  test.each([
    ["0", 0],
    ["30", 30],
    ["30m", 30],
    ["1h", 60],
    ["1H", 60],
    ["1d", 1440],
    ["1w", 10080],
    ["1 week", 10080],
    ["5 days 12 hours", 7920],
    ["1mo", 43200],
    ["3 months", 129600],
    ["120s", 2],
    ["129600", 129600],
  ])("%p is %p minutes", (input, minutes) => {
    expect(parseFollowersDuration(input)).toEqual({ ok: true, value: minutes })
  })

  test.each(["soon", "", "-5", "10x", "90s", "1.5h", "10 foo"])(
    "%p is invalid",
    (input) => {
      expect(parseFollowersDuration(input)).toEqual(invalid)
    }
  )

  test.each(["129601", "4mo", "13w"])("%p is out of range", (input) => {
    expect(parseFollowersDuration(input)).toEqual(outOfRange)
  })
})

describe("parseSlowModeWaitTime", () => {
  test.each([
    ["3", 3],
    ["30", 30],
    ["120", 120],
  ])("%p is %p seconds", (input, seconds) => {
    expect(parseSlowModeWaitTime(input)).toEqual({ ok: true, value: seconds })
  })

  test.each(["abc", "10abc", "10s", "", "-5", "1.5"])(
    "%p is invalid",
    (input) => {
      expect(parseSlowModeWaitTime(input)).toEqual(invalid)
    }
  )

  test.each(["0", "2", "121"])("%p is out of range", (input) => {
    expect(parseSlowModeWaitTime(input)).toEqual(outOfRange)
  })
})
