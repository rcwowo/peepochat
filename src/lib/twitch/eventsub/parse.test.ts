import { describe, expect, test } from "bun:test"

import {
  asRecord,
  badgesFromEventSub,
  emotesFromV2Fragments,
  extractModerateTargetNames,
  parseEventSubMessageBody,
} from "@/lib/twitch/eventsub/parse"

function positions(
  emotes: { id: string; code: string; start: number; end: number }[]
) {
  return emotes.map(({ id, code, start, end }) => ({ id, code, start, end }))
}

describe("asRecord", () => {
  test("accepts plain objects only", () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 })
    expect(asRecord(null)).toBeNull()
    expect(asRecord([])).toBeNull()
    expect(asRecord("x")).toBeNull()
  })
})

describe("emotesFromV2Fragments", () => {
  test("builds text and UTF-16 emote positions from fragments", () => {
    const body = emotesFromV2Fragments([
      {
        type: "text",
        text: "😀 hi ",
        cheermote: null,
        emote: null,
        mention: null,
      },
      {
        type: "emote",
        text: "Kappa",
        emote: {
          id: "25",
          emote_set_id: "0",
          owner_id: "0",
          format: ["static"],
        },
      },
      { type: "text", text: " " },
      { type: "mention", text: "@friend", mention: { user_login: "friend" } },
      { type: "text", text: " " },
      { type: "emote", text: "LUL", emote: { id: "425618" } },
    ])

    expect(body.text).toBe("😀 hi Kappa @friend LUL")
    expect(positions(body.emotes)).toEqual([
      { id: "25", code: "Kappa", start: 6, end: 10 },
      { id: "425618", code: "LUL", start: 20, end: 22 },
    ])
    expect(body.text.slice(6, 11)).toBe("Kappa")
    expect(body.emotes[0].provider).toBe("twitch")
    expect(body.emotes[0].imageUrl).toContain("/emoticons/v2/25/")
    expect(body.bits).toBeNull()
  })

  test("sums cheermote bits from numeric and string values", () => {
    const body = emotesFromV2Fragments([
      {
        type: "cheermote",
        text: "Cheer100",
        cheermote: { prefix: "cheer", bits: 100, tier: 100 },
      },
      { type: "text", text: " " },
      {
        type: "cheermote",
        text: "Cheer50",
        cheermote: { prefix: "cheer", bits: "50", tier: 1 },
      },
      { type: "text", text: " " },
      { type: "cheermote", text: "Cheer0", cheermote: { bits: 0 } },
      { type: "cheermote", text: "CheerX", cheermote: { bits: "abc" } },
    ])

    expect(body.text).toBe("Cheer100 Cheer50 Cheer0CheerX")
    expect(body.bits).toBe(150)
    expect(body.emotes).toEqual([])
  })

  test("skips malformed fragments and emotes without ids", () => {
    const body = emotesFromV2Fragments([
      null,
      "text",
      { type: "text" },
      { type: "emote", text: "Kappa", emote: { id: "  " } },
      { type: "emote", text: "Keepo", emote: null },
      { type: "text", text: "!" },
    ])

    expect(body).toEqual({ text: "KappaKeepo!", emotes: [], bits: null })
  })

  test("returns an empty body for non-array input", () => {
    expect(emotesFromV2Fragments(undefined)).toEqual({
      text: "",
      emotes: [],
      bits: null,
    })
  })
})

describe("parseEventSubMessageBody", () => {
  test("parses v2 message objects with fragments", () => {
    const body = parseEventSubMessageBody({
      message: {
        text: "hi Kappa",
        fragments: [
          { type: "text", text: "hi " },
          { type: "emote", text: "Kappa", emote: { id: "25" } },
        ],
      },
    })

    expect(body.text).toBe("hi Kappa")
    expect(positions(body.emotes)).toEqual([
      { id: "25", code: "Kappa", start: 3, end: 7 },
    ])
  })

  test("falls back to fragment text when the message text is missing", () => {
    const body = parseEventSubMessageBody({
      message: { fragments: [{ type: "text", text: "from fragments" }] },
    })

    expect(body.text).toBe("from fragments")
  })

  test("keeps cheer bits when a v2 message has no emotes", () => {
    const body = parseEventSubMessageBody({
      message: {
        text: "Cheer100 gg",
        fragments: [
          { type: "cheermote", text: "Cheer100", cheermote: { bits: 100 } },
          { type: "text", text: " gg" },
        ],
      },
    })

    expect(body).toEqual({ text: "Cheer100 gg", emotes: [], bits: 100 })
  })

  test("locates v1 string-message emotes by searching the text in order", () => {
    const body = parseEventSubMessageBody({
      message: "Kappa hi Kappa LUL",
      fragments: {
        emotes: [
          { text: "Kappa", id: "25", "set-id": "0" },
          { text: "Kappa", id: "25", "set-id": "0" },
          { text: "LUL", id: "425618", "set-id": "0" },
          { text: "Missing", id: "1" },
          { text: "", id: "2" },
          { text: "LUL", id: "" },
        ],
        cheermotes: [],
      },
    })

    expect(body.text).toBe("Kappa hi Kappa LUL")
    expect(positions(body.emotes)).toEqual([
      { id: "25", code: "Kappa", start: 0, end: 4 },
      { id: "25", code: "Kappa", start: 9, end: 13 },
      { id: "425618", code: "LUL", start: 15, end: 17 },
    ])
    expect(body.bits).toBeNull()
  })

  test("uses v1 fragments alongside a v2 message object without emote fragments", () => {
    const body = parseEventSubMessageBody({
      message: { text: "hello Kappa", fragments: [] },
      fragments: { emotes: [{ text: "Kappa", id: "25" }] },
    })

    expect(positions(body.emotes)).toEqual([
      { id: "25", code: "Kappa", start: 6, end: 10 },
    ])
  })

  test("returns an empty body when the message is missing or invalid", () => {
    expect(parseEventSubMessageBody({})).toEqual({
      text: "",
      emotes: [],
      bits: null,
    })
    expect(parseEventSubMessageBody({ message: 42 })).toEqual({
      text: "",
      emotes: [],
      bits: null,
    })
  })
})

describe("extractModerateTargetNames", () => {
  test("returns the deduplicated login and display name of the action target", () => {
    expect(
      extractModerateTargetNames({
        action: "timeout",
        timeout: {
          user_id: "1",
          user_login: "baduser",
          user_name: "BadUser",
          reason: "spam",
          expires_at: "2024-01-01T00:10:00Z",
        },
      })
    ).toEqual(["baduser", "BadUser"])
    expect(
      extractModerateTargetNames({
        action: "ban",
        ban: { user_login: "same", user_name: " same " },
      })
    ).toEqual(["same"])
  })

  test("returns an empty list for unknown or targetless actions", () => {
    expect(extractModerateTargetNames({ action: "" })).toEqual([])
    expect(
      extractModerateTargetNames({ action: "clear", clear: null })
    ).toEqual([])
    expect(
      extractModerateTargetNames({ action: "ban", ban: { user_login: 5 } })
    ).toEqual([])
  })
})

describe("badgesFromEventSub", () => {
  test("maps set_id/id pairs and alternate keys", () => {
    expect(
      badgesFromEventSub([
        { set_id: "moderator", id: "1", info: "" },
        { set_id: "subscriber", id: "3012", info: "14" },
        { setId: "vip", version: "1" },
        { set_id: "premium" },
      ])
    ).toEqual([
      { set: "moderator", version: "1" },
      { set: "subscriber", version: "3012" },
      { set: "vip", version: "1" },
      { set: "premium", version: "1" },
    ])
  })

  test("skips entries without a set and non-array input", () => {
    expect(badgesFromEventSub([{ id: "1" }, null, "x"])).toEqual([])
    expect(badgesFromEventSub({ set_id: "vip" })).toEqual([])
  })
})
