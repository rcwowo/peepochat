import { describe, expect, test } from "bun:test"

import {
  adjustHighlightRangesForReplyStrip,
  getReplyDisplayContent,
} from "@/lib/chat/threads/strip-reply-mention"
import type {
  TwitchChatGif,
  TwitchChatReply,
  TwitchEmote,
} from "@/lib/twitch/chat/chat"

function reply(overrides: Partial<TwitchChatReply> = {}): TwitchChatReply {
  return {
    parentMessageId: "parent",
    threadRootMessageId: "parent",
    parentDisplayName: "Alice",
    parentUserName: "alice",
    parentBody: "hello",
    parentColor: null,
    ...overrides,
  }
}

function emote(
  code: string,
  start: number,
  overlays?: TwitchEmote[]
): TwitchEmote {
  return {
    id: code,
    code,
    provider: "twitch",
    imageUrl: `https://example.test/${code}`,
    start,
    end: start + code.length - 1,
    ...(overlays ? { overlays } : {}),
  }
}

function gif(start: number, end: number): TwitchChatGif {
  return { id: "g", url: "https://example.test/g.gif", start, end }
}

describe("getReplyDisplayContent", () => {
  test("returns the original content untouched without a reply", () => {
    const emotes = [emote("Kappa", 0)]
    const gifs = [gif(6, 8)]
    const result = getReplyDisplayContent("Kappa gif", emotes, null, gifs)
    expect(result.text).toBe("Kappa gif")
    expect(result.emotes).toBe(emotes)
    expect(result.gifs).toBe(gifs)
    expect(result.stripOffset).toBe(0)
  })

  test("strips a leading mention of the parent case-insensitively", () => {
    expect(getReplyDisplayContent("@ALICE hi there", [], reply())).toEqual({
      text: "hi there",
      emotes: [],
      gifs: [],
      stripOffset: 7,
    })
  })

  test("falls back to the login when the display name is localized", () => {
    const localized = reply({
      parentDisplayName: "日本語",
      parentUserName: "nihongo",
    })
    expect(getReplyDisplayContent("@nihongo yo", [], localized).text).toBe("yo")
    const byDisplayName = getReplyDisplayContent("@日本語 yo", [], localized)
    expect(byDisplayName.text).toBe("yo")
    expect(byDisplayName.stripOffset).toBe(5)
  })

  test("only strips a mention that is followed by a space", () => {
    expect(getReplyDisplayContent("@alice", [], reply()).stripOffset).toBe(0)
    expect(getReplyDisplayContent("@alice, hi", [], reply()).stripOffset).toBe(
      0
    )
    expect(getReplyDisplayContent("@alicex hi", [], reply()).stripOffset).toBe(
      0
    )
  })

  test("does not strip mentions that are not at the very start", () => {
    expect(getReplyDisplayContent(" @alice hi", [], reply()).text).toBe(
      " @alice hi"
    )
    expect(getReplyDisplayContent("hi @alice ok", [], reply()).text).toBe(
      "hi @alice ok"
    )
  })

  test("only strips a single space after the mention", () => {
    expect(getReplyDisplayContent("@alice  hi", [], reply()).text).toBe(" hi")
  })

  test("ignores empty parent names", () => {
    const anonymous = reply({ parentDisplayName: "", parentUserName: "" })
    expect(getReplyDisplayContent("@ hi", [], anonymous).stripOffset).toBe(0)
  })

  test("shifts emotes and overlays and drops ones inside the mention", () => {
    const overlay = { ...emote("RainTime", 13), end: 16 }
    const emotes = [
      emote("alice", 1),
      emote("Kappa", 7),
      emote("PogU", 13, [overlay]),
    ]
    const result = getReplyDisplayContent("@alice Kappa PogU", emotes, reply())

    expect(result.text).toBe("Kappa PogU")
    expect(result.emotes.map((e) => [e.code, e.start, e.end])).toEqual([
      ["Kappa", 0, 4],
      ["PogU", 6, 9],
    ])
    expect(result.emotes[1]!.overlays?.map((o) => [o.start, o.end])).toEqual([
      [6, 9],
    ])
  })

  test("shifts gifs and drops ones that start inside the mention", () => {
    const result = getReplyDisplayContent("@alice gif", [], reply(), [
      gif(0, 5),
      gif(7, 9),
    ])
    expect(result.gifs.map((g) => [g.start, g.end])).toEqual([[0, 2]])
  })
})

describe("adjustHighlightRangesForReplyStrip", () => {
  test("passes ranges through when nothing was stripped", () => {
    const ranges = [{ start: 0, end: 3 }]
    expect(adjustHighlightRangesForReplyStrip(ranges, 0)).toBe(ranges)
    expect(adjustHighlightRangesForReplyStrip(null, 5)).toBeNull()
    expect(adjustHighlightRangesForReplyStrip(undefined, 0)).toBeNull()
  })

  test("shifts, clamps and drops ranges relative to the strip offset", () => {
    expect(
      adjustHighlightRangesForReplyStrip(
        [
          { start: 1, end: 6 },
          { start: 4, end: 10 },
          { start: 7, end: 12 },
        ],
        7
      )
    ).toEqual([
      { start: 0, end: 3 },
      { start: 0, end: 5 },
    ])
  })

  test("returns null when every range was inside the stripped mention", () => {
    expect(
      adjustHighlightRangesForReplyStrip([{ start: 1, end: 6 }], 7)
    ).toBeNull()
    expect(
      adjustHighlightRangesForReplyStrip([{ start: 0, end: 7 }], 7)
    ).toBeNull()
  })
})
