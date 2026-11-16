const SECOND = 1
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY

export const TIMEOUT_MIN_SECONDS = 1
export const TIMEOUT_MAX_SECONDS = 2 * WEEK
export const FOLLOWERS_MIN_MINUTES = 0
export const FOLLOWERS_MAX_MINUTES = (3 * MONTH) / MINUTE
export const SLOW_MIN_SECONDS = 3
export const SLOW_MAX_SECONDS = 120

const UNIT_SECONDS: Record<string, number> = {
  s: SECOND,
  sec: SECOND,
  secs: SECOND,
  second: SECOND,
  seconds: SECOND,
  m: MINUTE,
  min: MINUTE,
  mins: MINUTE,
  minute: MINUTE,
  minutes: MINUTE,
  h: HOUR,
  hr: HOUR,
  hrs: HOUR,
  hour: HOUR,
  hours: HOUR,
  d: DAY,
  day: DAY,
  days: DAY,
  w: WEEK,
  wk: WEEK,
  wks: WEEK,
  week: WEEK,
  weeks: WEEK,
  mo: MONTH,
  mos: MONTH,
  month: MONTH,
  months: MONTH,
}

const PLAIN_INTEGER_PATTERN = /^\d+$/
const DURATION_COMPONENT_PATTERN = /(\d+)\s*([a-z]+)\s*/iy

export type DurationParseResult =
  { ok: true; value: number } | { ok: false; error: "invalid" | "out_of_range" }

function parseUnitDurationSeconds(input: string): number | null {
  const pattern = new RegExp(DURATION_COMPONENT_PATTERN)
  let total = 0
  let components = 0

  while (pattern.lastIndex < input.length) {
    const match = pattern.exec(input)
    if (!match) {
      return null
    }

    const unitSeconds = UNIT_SECONDS[match[2].toLowerCase()]
    if (unitSeconds === undefined) {
      return null
    }

    total += Number(match[1]) * unitSeconds
    components += 1
  }

  return components > 0 ? total : null
}

function parseDurationInUnits(
  input: string,
  plainUnitSeconds: number
): number | null {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  if (PLAIN_INTEGER_PATTERN.test(trimmed)) {
    return Number(trimmed) * plainUnitSeconds
  }

  return parseUnitDurationSeconds(trimmed)
}

function toRangedResult(
  seconds: number | null,
  unitSeconds: number,
  min: number,
  max: number
): DurationParseResult {
  if (seconds === null) {
    return { ok: false, error: "invalid" }
  }

  if (!Number.isSafeInteger(seconds)) {
    return { ok: false, error: "out_of_range" }
  }

  if (seconds % unitSeconds !== 0) {
    return { ok: false, error: "invalid" }
  }

  const value = seconds / unitSeconds
  if (value < min || value > max) {
    return { ok: false, error: "out_of_range" }
  }

  return { ok: true, value }
}

export function looksLikeDuration(token: string): boolean {
  return /^[+-]?\.?\d/.test(token.trim())
}

export function parseTimeoutDuration(input: string): DurationParseResult {
  return toRangedResult(
    parseDurationInUnits(input, SECOND),
    SECOND,
    TIMEOUT_MIN_SECONDS,
    TIMEOUT_MAX_SECONDS
  )
}

export function parseFollowersDuration(input: string): DurationParseResult {
  return toRangedResult(
    parseDurationInUnits(input, MINUTE),
    MINUTE,
    FOLLOWERS_MIN_MINUTES,
    FOLLOWERS_MAX_MINUTES
  )
}

export function parseSlowModeWaitTime(input: string): DurationParseResult {
  const trimmed = input.trim()
  if (!PLAIN_INTEGER_PATTERN.test(trimmed)) {
    return { ok: false, error: "invalid" }
  }

  return toRangedResult(
    Number(trimmed),
    SECOND,
    SLOW_MIN_SECONDS,
    SLOW_MAX_SECONDS
  )
}
