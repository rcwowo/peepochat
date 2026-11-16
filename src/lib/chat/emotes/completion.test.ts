import { describe, expect, test } from "bun:test"

import type { ComposerEmote } from "@/lib/chat/emotes/catalog"
import {
  applyEmoteSuggestion,
  findColonEmoteSuggestions,
  findTabEmoteMatches,
  getSearchRange,
  getWordAtCursor,
  insertEmoteAtEnd,
  isTabStateCurrent,
  nextSuggestionIndex,
  prevSuggestionIndex,
  shouldResetTabState,
} from "@/lib/chat/emotes/completion"

function emote(
  code: string,
  provider: ComposerEmote["provider"] = "twitch"
): ComposerEmote {
  return {
    id: `${provider}-${code}`,
    code,
    provider,
    imageUrl: `https://example.com/${code}.png`,
  }
}

const EMOTES = [
  emote("KappaPride", "ffz"),
  emote("OkayChamp", "7tv"),
  emote("KEKW", "bttv"),
  emote("Kappa", "twitch"),
  emote("catJAM", "7tv"),
]

function codes(suggestions: { value: string }[]) {
  return suggestions.map((suggestion) => suggestion.value)
}

describe("getSearchRange", () => {
  test("finds the word around the cursor", () => {
    expect(getSearchRange("hello world", 8)).toEqual({ start: 6, end: 11 })
    expect(getSearchRange("hello world", 0)).toEqual({ start: 0, end: 5 })
    expect(getSearchRange("hello world", 11)).toEqual({ start: 6, end: 11 })
  })

  test("handles empty text", () => {
    expect(getSearchRange("", 0)).toEqual({ start: 0, end: 0 })
  })
})

describe("getWordAtCursor", () => {
  test("returns the word and its bounds", () => {
    expect(getWordAtCursor("say :kap now", 8)).toEqual({
      word: ":kap",
      start: 4,
      end: 8,
    })
  })

  test("returns null when there is no word", () => {
    expect(getWordAtCursor("", 0)).toBeNull()
    expect(getWordAtCursor(" ", 1)).toBeNull()
  })

  test("keeps the trailing space when the cursor follows a word", () => {
    expect(getWordAtCursor("hello ", 6)).toEqual({
      word: "hello ",
      start: 0,
      end: 6,
    })
  })
})

describe("findColonEmoteSuggestions", () => {
  test("is inactive unless the word at the cursor starts with a colon", () => {
    for (const [text, cursor] of [
      ["kap", 3],
      ["x:kap", 5],
      [":kap other", 10],
    ] as const) {
      expect(findColonEmoteSuggestions(text, cursor, EMOTES)).toEqual({
        query: "",
        replaceRange: null,
        prefixed: false,
        suggestions: [],
        current: 0,
      })
    }
  })

  test("waits for the minimum query length", () => {
    expect(findColonEmoteSuggestions("hi :k", 5, EMOTES)).toEqual({
      query: ":k",
      replaceRange: { start: 3, end: 5 },
      prefixed: true,
      suggestions: [],
      current: 0,
    })
  })

  test("matches substrings case-insensitively, sorted by provider", () => {
    const result = findColonEmoteSuggestions("hi :KA", 6, EMOTES)

    expect(result.replaceRange).toEqual({ start: 3, end: 6 })
    expect(codes(result.suggestions)).toEqual([
      "Kappa",
      "OkayChamp",
      "KappaPride",
    ])
  })

  test("supports prefix search and a custom minimum length", () => {
    expect(
      codes(
        findColonEmoteSuggestions(":ka", 3, EMOTES, {
          searchMode: "startsWith",
        }).suggestions
      )
    ).toEqual(["Kappa", "KappaPride"])
    expect(
      findColonEmoteSuggestions(":", 1, EMOTES, { minQueryLength: 0 })
        .suggestions
    ).toHaveLength(EMOTES.length)
  })

  test("builds suggestion display data", () => {
    const [suggestion] = findColonEmoteSuggestions(
      ":catj",
      5,
      EMOTES
    ).suggestions

    expect(suggestion).toEqual({
      type: "emote",
      value: "catJAM",
      display: "catJAM",
      imageUrl: "https://example.com/catJAM.png",
      provider: "7tv",
    })
  })

  test("sorts by name within a provider and deduplicates codes", () => {
    const emotes = [
      emote("zeta"),
      emote("Alpha"),
      emote("beta"),
      emote("Alpha", "bttv"),
    ]

    expect(
      codes(
        findColonEmoteSuggestions(":a", 2, emotes, { minQueryLength: 1 })
          .suggestions
      )
    ).toEqual(["Alpha", "beta", "zeta"])
  })

  test("caps the number of suggestions", () => {
    const emotes = Array.from({ length: 40 }, (_, index) =>
      emote(`pog${String(index).padStart(2, "0")}`)
    )
    const suggestions = findColonEmoteSuggestions(":pog", 4, emotes).suggestions

    expect(suggestions).toHaveLength(25)
    expect(suggestions[0]?.value).toBe("pog00")
    expect(suggestions[24]?.value).toBe("pog24")
  })
})

describe("findTabEmoteMatches", () => {
  test("matches by prefix and ignores a trailing space", () => {
    expect(codes(findTabEmoteMatches(EMOTES, "kap "))).toEqual([
      "Kappa",
      "KappaPride",
    ])
  })

  test("supports substring search", () => {
    expect(
      codes(findTabEmoteMatches(EMOTES, "jam", { searchMode: "includes" }))
    ).toEqual(["catJAM"])
  })

  test("returns nothing for blank words", () => {
    expect(findTabEmoteMatches(EMOTES, "")).toEqual([])
    expect(findTabEmoteMatches(EMOTES, " ")).toEqual([])
  })
})

describe("tab state helpers", () => {
  const tab = { replaceRange: { start: 3, end: 8 }, expectedWord: "Kappa" }

  test("resets when there is no state or the word start moves", () => {
    expect(shouldResetTabState(null, { start: 3, end: 5 })).toBe(true)
    expect(shouldResetTabState(tab, null)).toBe(true)
    expect(shouldResetTabState(tab, { start: 4, end: 8 })).toBe(true)
    expect(shouldResetTabState(tab, { start: 3, end: 10 })).toBe(false)
  })

  test("is current only while the cursor and word are unchanged", () => {
    expect(isTabStateCurrent(null, "hi Kappa", 8)).toBe(false)
    expect(isTabStateCurrent(tab, "hi Kappa", 8)).toBe(true)
    expect(isTabStateCurrent(tab, "hi Kappa", 2)).toBe(false)
    expect(isTabStateCurrent(tab, "hi Kappa more", 9)).toBe(false)
    expect(isTabStateCurrent(tab, "hi KappX", 8)).toBe(false)
  })
})

describe("suggestion index helpers", () => {
  test("wrap around in both directions", () => {
    expect(nextSuggestionIndex(0, 3)).toBe(1)
    expect(nextSuggestionIndex(2, 3)).toBe(0)
    expect(prevSuggestionIndex(0, 3)).toBe(2)
    expect(prevSuggestionIndex(2, 3)).toBe(1)
  })

  test("return zero for empty lists", () => {
    expect(nextSuggestionIndex(4, 0)).toBe(0)
    expect(prevSuggestionIndex(4, 0)).toBe(0)
  })
})

describe("applyEmoteSuggestion", () => {
  test("replaces the range and places the caret after the suffix", () => {
    expect(
      applyEmoteSuggestion("hi :ka", { start: 3, end: 6 }, "Kappa")
    ).toEqual({ value: "hi Kappa ", caret: 9 })
    expect(
      applyEmoteSuggestion("hi :ka", { start: 3, end: 6 }, "Kappa", {
        trailingSpace: false,
      })
    ).toEqual({ value: "hi Kappa", caret: 8 })
  })

  test("keeps text after the replaced range", () => {
    expect(
      applyEmoteSuggestion(":ka!", { start: 0, end: 3 }, "Kappa", {
        trailingSpace: false,
      })
    ).toEqual({ value: "Kappa!", caret: 5 })
  })

  test("appends with a separating space when there is no range", () => {
    expect(applyEmoteSuggestion("hi", null, "Kappa")).toEqual({
      value: "hi Kappa ",
      caret: 9,
    })
    expect(applyEmoteSuggestion("hi ", null, "Kappa")).toEqual({
      value: "hi Kappa ",
      caret: 9,
    })
    expect(
      applyEmoteSuggestion("", null, "Kappa", { trailingSpace: false })
    ).toEqual({ value: "Kappa", caret: 5 })
  })
})

describe("insertEmoteAtEnd", () => {
  test("separates the emote from existing text", () => {
    expect(insertEmoteAtEnd("", "Kappa")).toBe("Kappa ")
    expect(insertEmoteAtEnd("hi", "Kappa")).toBe("hi Kappa ")
    expect(insertEmoteAtEnd("hi ", "Kappa")).toBe("hi Kappa ")
  })
})
