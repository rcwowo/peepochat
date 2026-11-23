import { describe, expect, test } from "bun:test"

import {
  TTS_SIDEBAR_DEFAULT_WIDTH,
  TTS_SIDEBAR_MAX_WIDTH,
  TTS_SIDEBAR_MIN_WIDTH,
  clampTtsSidebarWidth,
  loadStoredTtsChannel,
  loadTtsUiPrefs,
  saveStoredTtsChannel,
  saveTtsUiPrefs,
} from "@/lib/tts/tts-ui-prefs"

const UI_KEY = "peepochat::tts-ui"
const CHANNEL_KEY = "peepochat::tts-channel"

describe("TTS sidebar prefs", () => {
  test("defaults to a collapsed sidebar at the default width", () => {
    expect(loadTtsUiPrefs()).toEqual({
      collapsed: true,
      width: TTS_SIDEBAR_DEFAULT_WIDTH,
    })
  })

  test("round-trips saved prefs", () => {
    saveTtsUiPrefs({ collapsed: false, width: 400 })
    expect(loadTtsUiPrefs()).toEqual({ collapsed: false, width: 400 })
  })

  test.each([["{broken"], ["null"], ["[]"], ['"str"']])(
    "falls back to defaults for malformed storage %p",
    (raw) => {
      window.localStorage.setItem(UI_KEY, raw)
      expect(loadTtsUiPrefs()).toEqual({
        collapsed: true,
        width: TTS_SIDEBAR_DEFAULT_WIDTH,
      })
    }
  )

  test("only expands when collapsed is explicitly false", () => {
    window.localStorage.setItem(UI_KEY, JSON.stringify({ collapsed: "false" }))
    expect(loadTtsUiPrefs().collapsed).toBe(true)
    window.localStorage.setItem(UI_KEY, JSON.stringify({ collapsed: false }))
    expect(loadTtsUiPrefs().collapsed).toBe(false)
  })

  test("clamps and rounds stored widths", () => {
    const widthFor = (width: unknown) => {
      window.localStorage.setItem(UI_KEY, JSON.stringify({ width }))
      return loadTtsUiPrefs().width
    }

    expect(widthFor(10)).toBe(TTS_SIDEBAR_MIN_WIDTH)
    expect(widthFor(10_000)).toBe(TTS_SIDEBAR_MAX_WIDTH)
    expect(widthFor(300.6)).toBe(301)
    expect(widthFor("400")).toBe(TTS_SIDEBAR_DEFAULT_WIDTH)
    expect(widthFor(null)).toBe(TTS_SIDEBAR_DEFAULT_WIDTH)
  })

  test("clampTtsSidebarWidth handles non-finite input", () => {
    expect(clampTtsSidebarWidth(Number.NaN)).toBe(TTS_SIDEBAR_DEFAULT_WIDTH)
    expect(clampTtsSidebarWidth(Number.POSITIVE_INFINITY)).toBe(
      TTS_SIDEBAR_DEFAULT_WIDTH
    )
    expect(clampTtsSidebarWidth(0)).toBe(TTS_SIDEBAR_MIN_WIDTH)
  })
})

describe("stored TTS channel", () => {
  test("saves, loads and clears the channel", () => {
    expect(loadStoredTtsChannel()).toBeNull()

    saveStoredTtsChannel("streamer")
    expect(loadStoredTtsChannel()).toBe("streamer")

    saveStoredTtsChannel(null)
    expect(window.localStorage.getItem(CHANNEL_KEY)).toBeNull()
    expect(loadStoredTtsChannel()).toBeNull()
  })

  test("treats an empty stored value as no channel", () => {
    window.localStorage.setItem(CHANNEL_KEY, "")
    expect(loadStoredTtsChannel()).toBeNull()
  })
})
