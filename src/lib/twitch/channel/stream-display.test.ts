import { describe, expect, test } from "bun:test"

import {
  formatStreamHeadline,
  formatStreamUptime,
} from "@/lib/twitch/channel/stream-display"

describe("formatStreamHeadline", () => {
  const base = {
    title: "  Speedrunning all day  ",
    gameName: " Celeste ",
    showTitle: true,
    showCategory: true,
    live: true,
  }

  test("joins the trimmed category and title", () => {
    expect(formatStreamHeadline(base)).toBe("Celeste — Speedrunning all day")
  })

  test("respects the visibility toggles", () => {
    expect(formatStreamHeadline({ ...base, showCategory: false })).toBe(
      "Speedrunning all day"
    )
    expect(formatStreamHeadline({ ...base, showTitle: false })).toBe("Celeste")
  })

  test("skips blank parts", () => {
    expect(formatStreamHeadline({ ...base, gameName: "   " })).toBe(
      "Speedrunning all day"
    )
  })

  test("reports offline when there is nothing to show", () => {
    expect(
      formatStreamHeadline({ ...base, title: " ", gameName: "", live: false })
    ).toBe("Offline")
    expect(
      formatStreamHeadline({
        ...base,
        showTitle: false,
        showCategory: false,
        live: false,
      })
    ).toBe("Offline")
  })

  test("uses a placeholder for live streams without a title", () => {
    expect(formatStreamHeadline({ ...base, title: "", gameName: "" })).toBe(
      "Untitled stream"
    )
    expect(
      formatStreamHeadline({
        ...base,
        title: "",
        gameName: "",
        showTitle: false,
      })
    ).toBe("")
  })
})

describe("formatStreamUptime", () => {
  test("formats each magnitude using its two largest units", () => {
    expect(formatStreamUptime(0)).toBe("0s")
    expect(formatStreamUptime(59_999)).toBe("59s")
    expect(formatStreamUptime(60_000)).toBe("1m")
    expect(formatStreamUptime(3_599_000)).toBe("59m")
    expect(formatStreamUptime(3_600_000)).toBe("1h 0m")
    expect(formatStreamUptime((5 * 3600 + 7 * 60 + 30) * 1000)).toBe("5h 7m")
    expect(formatStreamUptime(86_400_000)).toBe("1d 0h")
    expect(formatStreamUptime((2 * 86_400 + 3 * 3600 + 59 * 60) * 1000)).toBe(
      "2d 3h"
    )
  })

  test("clamps negative durations to zero", () => {
    expect(formatStreamUptime(-5_000)).toBe("0s")
  })
})
