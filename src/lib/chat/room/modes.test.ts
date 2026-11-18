import { describe, expect, test } from "bun:test"

import {
  DEFAULT_CHAT_MODES,
  durationOptionsWithCurrent,
  FOLLOWERS_ONLY_DURATION_OPTIONS,
  formatChatModesNotice,
  formatFollowersOnlyDuration,
  formatSlowModeDuration,
  hasAnyChatModeEnabled,
  mergeChatModes,
  shouldShowChatModesMenu,
  SLOW_MODE_DURATION_OPTIONS,
  type TwitchChatModes,
} from "@/lib/chat/room/modes"

function modes(patch: Partial<TwitchChatModes>): TwitchChatModes {
  return { ...DEFAULT_CHAT_MODES, ...patch }
}

describe("mergeChatModes", () => {
  test("applies a patch on top of the defaults when there is no current state", () => {
    expect(
      mergeChatModes(null, { slowMode: true, slowModeSeconds: 5 })
    ).toEqual(modes({ slowMode: true, slowModeSeconds: 5 }))
  })

  test("preserves unpatched fields and does not mutate inputs", () => {
    const current = modes({ emoteOnly: true, followersOnly: true })
    const merged = mergeChatModes(current, { emoteOnly: false })
    expect(merged).toEqual(modes({ followersOnly: true }))
    expect(current.emoteOnly).toBe(true)
    expect(mergeChatModes(undefined, {})).not.toBe(DEFAULT_CHAT_MODES)
  })
})

describe("shouldShowChatModesMenu", () => {
  test("respects the visibility setting", () => {
    expect(shouldShowChatModesMenu("always", false)).toBe(true)
    expect(shouldShowChatModesMenu("hidden", true)).toBe(false)
    expect(shouldShowChatModesMenu("when-permitted", true)).toBe(true)
    expect(shouldShowChatModesMenu("when-permitted", false)).toBe(false)
  })
})

describe("hasAnyChatModeEnabled", () => {
  test("ignores durations when their mode is off", () => {
    expect(
      hasAnyChatModeEnabled(
        modes({ slowModeSeconds: 30, followersOnlyMinutes: 10 })
      )
    ).toBe(false)
    expect(hasAnyChatModeEnabled(modes({ uniqueMode: true }))).toBe(true)
  })
})

describe("formatChatModesNotice", () => {
  test("returns null when no mode is active", () => {
    expect(formatChatModesNotice(DEFAULT_CHAT_MODES)).toBeNull()
  })

  test("formats one, two and many modes as an English list", () => {
    expect(formatChatModesNotice(modes({ emoteOnly: true }))).toBe(
      "This room is in emote-only mode."
    )
    expect(
      formatChatModesNotice(modes({ emoteOnly: true, uniqueMode: true }))
    ).toBe("This room is in emote-only mode and unique chat mode.")
    expect(
      formatChatModesNotice({
        emoteOnly: true,
        subscribersOnly: true,
        followersOnly: true,
        followersOnlyMinutes: 0,
        slowMode: true,
        slowModeSeconds: 30,
        uniqueMode: true,
      })
    ).toBe(
      "This room is in emote-only mode, subscribers-only mode, followers-only mode, slow mode (30 seconds), and unique chat mode."
    )
  })

  test("includes a followers-only duration only when it is positive", () => {
    expect(
      formatChatModesNotice(
        modes({ followersOnly: true, followersOnlyMinutes: 1440 })
      )
    ).toBe("This room is in followers-only mode (1 day).")
  })
})

describe("duration formatting", () => {
  test.each([
    [1, "1 minute"],
    [45, "45 minutes"],
    [60, "1 hour"],
    [90, "90 minutes"],
    [120, "2 hours"],
    [2880, "2 days"],
    [4320, "3 days"],
    [10080, "1 week"],
    [129600, "3 months"],
  ])("followers-only %p minutes -> %p", (minutes, label) => {
    expect(formatFollowersOnlyDuration(minutes)).toBe(label)
  })

  test.each([
    [1, "1 second"],
    [45, "45 seconds"],
    [60, "1 minute"],
    [90, "90 seconds"],
    [180, "3 minutes"],
  ])("slow mode %p seconds -> %p", (seconds, label) => {
    expect(formatSlowModeDuration(seconds)).toBe(label)
  })

  test("formatted labels agree with the preset option labels", () => {
    for (const option of FOLLOWERS_ONLY_DURATION_OPTIONS) {
      expect(formatFollowersOnlyDuration(option.value)).toBe(option.label)
    }
    for (const option of SLOW_MODE_DURATION_OPTIONS) {
      expect(formatSlowModeDuration(option.value)).toBe(option.label)
    }
  })
})

describe("durationOptionsWithCurrent", () => {
  test("returns the presets as strings when the current value is a preset", () => {
    const options = durationOptionsWithCurrent(
      SLOW_MODE_DURATION_OPTIONS,
      30,
      formatSlowModeDuration
    )
    expect(options).toHaveLength(SLOW_MODE_DURATION_OPTIONS.length)
    expect(options[0]).toEqual({ value: "3", label: "3 seconds" })
  })

  test("prepends a custom current value", () => {
    const options = durationOptionsWithCurrent(
      SLOW_MODE_DURATION_OPTIONS,
      45,
      formatSlowModeDuration
    )
    expect(options[0]).toEqual({ value: "45", label: "45 seconds" })
    expect(options).toHaveLength(SLOW_MODE_DURATION_OPTIONS.length + 1)
  })
})
