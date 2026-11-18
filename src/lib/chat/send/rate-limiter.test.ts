import { describe, expect, test } from "bun:test"

import { ChatRateLimiter } from "@/lib/chat/send/rate-limiter"

const T0 = 1_700_000_000_000

function recordMany(
  limiter: ChatRateLimiter,
  channels: string[],
  count: number,
  start = T0,
  step = 1_000
) {
  for (let index = 0; index < count; index += 1) {
    limiter.record(channels[index % channels.length]!, start + index * step)
  }
  return start + (count - 1) * step
}

describe("ChatRateLimiter (regular users)", () => {
  test("enforces a one second gap per channel", () => {
    const limiter = new ChatRateLimiter()
    expect(limiter.check("a", false, T0)).toBe("ok")
    limiter.record("a", T0)

    expect(limiter.check("a", false, T0 + 999)).toBe("too_fast")
    expect(limiter.check("b", false, T0 + 1)).toBe("ok")
    expect(limiter.check("a", false, T0 + 1_000)).toBe("ok")
  })

  test("caps sends across all channels at 20 per 30 seconds", () => {
    const limiter = new ChatRateLimiter()
    const last = recordMany(limiter, ["a", "b", "c"], 20, T0, 100)

    expect(limiter.check("d", false, last + 1)).toBe("too_many")
    expect(limiter.check("d", false, T0 + 30_000)).toBe("too_many")
    expect(limiter.check("d", false, T0 + 30_001)).toBe("ok")
  })
})

describe("ChatRateLimiter (privileged users)", () => {
  test("skips the per-channel interval", () => {
    const limiter = new ChatRateLimiter()
    limiter.record("a", T0)
    expect(limiter.check("a", true, T0)).toBe("ok")
  })

  test("is held to the global limit while its channel is under 20 sends", () => {
    const limiter = new ChatRateLimiter()
    recordMany(limiter, ["other"], 20, T0, 10)
    expect(limiter.check("mine", true, T0 + 500)).toBe("too_many")
  })

  test("allows up to 100 sends in a privileged channel per window", () => {
    const limiter = new ChatRateLimiter()
    const last = recordMany(limiter, ["mine"], 99, T0, 10)
    expect(limiter.check("mine", true, last + 10)).toBe("ok")

    limiter.record("mine", last + 10)
    expect(limiter.check("mine", true, last + 20)).toBe("too_many")
    expect(limiter.check("mine", true, T0 + 30_001)).toBe("ok")
  })
})

describe("ChatRateLimiter.unrecordLast", () => {
  test("rolls back a failed send so the user is not throttled", () => {
    const limiter = new ChatRateLimiter()
    limiter.record("a", T0)
    limiter.unrecordLast("a", T0)
    expect(limiter.check("a", false, T0 + 1)).toBe("ok")
  })

  test("restores the previous send time for the interval check", () => {
    const limiter = new ChatRateLimiter()
    limiter.record("a", T0)
    limiter.record("a", T0 + 1_500)
    limiter.unrecordLast("a", T0 + 1_500)

    expect(limiter.check("a", false, T0 + 999)).toBe("too_fast")
    expect(limiter.check("a", false, T0 + 1_600)).toBe("ok")
  })

  test("releases global capacity", () => {
    const limiter = new ChatRateLimiter()
    const last = recordMany(limiter, ["a", "b"], 20, T0, 10)
    expect(limiter.check("c", false, last + 1)).toBe("too_many")

    limiter.unrecordLast("b", last)
    expect(limiter.check("c", false, last + 1)).toBe("ok")
  })

  test("is a no-op for an unknown channel with no history", () => {
    const limiter = new ChatRateLimiter()
    expect(() => limiter.unrecordLast("nobody", T0)).not.toThrow()
    expect(limiter.check("nobody", false, T0)).toBe("ok")
  })
})

describe("ChatRateLimiter.reset", () => {
  test("clears every window", () => {
    const limiter = new ChatRateLimiter()
    const last = recordMany(limiter, ["a"], 20, T0, 10)
    limiter.reset()
    expect(limiter.check("a", false, last)).toBe("ok")
    expect(limiter.check("a", true, last)).toBe("ok")
  })
})
