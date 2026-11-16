import { describe, expect, test } from "bun:test"

import {
  applyCommandSuggestion,
  findCommandSuggestions,
  getCommandSuggestionIndices,
  shouldCompleteCommandOnSubmit,
  shouldSuppressEmoteCompletion,
} from "@/lib/chat/commands/completion"
import {
  CHAT_COMMAND_DEFINITIONS,
  resolveCommandDefinition,
} from "@/lib/chat/commands/definitions"

function names(text: string, cursor = text.length) {
  return findCommandSuggestions(text, cursor).suggestions.map(
    (suggestion) => suggestion.name
  )
}

describe("findCommandSuggestions", () => {
  test("is inactive for non-command text", () => {
    expect(findCommandSuggestions("hello /ban", 10)).toMatchObject({
      active: false,
      replaceRange: null,
      suggestions: [],
      usageHint: null,
    })
  })

  test("lists every command for a bare slash", () => {
    expect(names("/")).toEqual(
      CHAT_COMMAND_DEFINITIONS.map((command) => command.name)
    )
  })

  test("filters by prefix case-insensitively", () => {
    expect(names("/UNB")).toEqual(["unban", "unblock"])
    expect(names("/emote")).toEqual(["emoteonly", "emoteonlyoff"])
  })

  test("matches aliases by prefix", () => {
    expect(names("/so")).toEqual(["shoutout"])
  })

  test("returns no suggestions for an unmatched prefix", () => {
    const result = findCommandSuggestions("/zzz", 4)

    expect(result.active).toBe(true)
    expect(result.suggestions).toEqual([])
  })

  test("uses the whole command token as query and replace range", () => {
    const result = findCommandSuggestions("/ban someone", 2)

    expect(result.query).toBe("/ban")
    expect(result.replaceRange).toEqual({ start: 0, end: 4 })
    expect(result.suggestions.map((suggestion) => suggestion.name)).toEqual([
      "ban",
    ])
  })

  test("still completes when the cursor is right before the first space", () => {
    expect(findCommandSuggestions("/ba x", 3).replaceRange).toEqual({
      start: 0,
      end: 3,
    })
  })

  test("builds suggestion display data", () => {
    const [suggestion] = findCommandSuggestions("/timeout", 8).suggestions

    expect(suggestion).toEqual({
      type: "command",
      name: "timeout",
      display: "/timeout",
      usage: "<username> [duration] [reason]",
      description: "Timeout a user",
    })
  })

  test("shows a usage hint once the cursor moves past the command", () => {
    expect(findCommandSuggestions("/ban someone", 12)).toEqual({
      query: "/ban",
      replaceRange: null,
      active: true,
      suggestions: [],
      current: 0,
      usageHint: "Usage: /ban <username> [reason]",
      usageHintDetail: null,
    })
  })

  test("omits usage arguments for commands without any", () => {
    expect(findCommandSuggestions("/CLEAR ", 7).usageHint).toBe("Usage: /clear")
  })

  test("resolves aliases and usage details in the hint", () => {
    expect(findCommandSuggestions("/so x", 5)).toMatchObject({
      query: "/shoutout",
      usageHint: "Usage: /shoutout <username>",
    })
    expect(
      findCommandSuggestions("/announce hi", 12).usageHintDetail
    ).toContain("Colors: primary, blue, green, orange, purple")
  })

  test("is inactive past an unknown command", () => {
    expect(findCommandSuggestions("/nope x", 7)).toMatchObject({
      active: false,
      usageHint: null,
    })
  })
})

describe("shouldCompleteCommandOnSubmit", () => {
  test("completes a partial command with suggestions", () => {
    const text = "/ba"
    expect(
      shouldCompleteCommandOnSubmit(text, findCommandSuggestions(text, 3))
    ).toBe(true)
  })

  test("submits a fully typed command or alias", () => {
    for (const text of ["/ban", "/BAN", "/so"]) {
      expect(
        shouldCompleteCommandOnSubmit(
          text,
          findCommandSuggestions(text, text.length)
        )
      ).toBe(false)
    }
  })

  test("submits when there is nothing to complete", () => {
    expect(
      shouldCompleteCommandOnSubmit("/zzz", findCommandSuggestions("/zzz", 4))
    ).toBe(false)
    expect(
      shouldCompleteCommandOnSubmit(
        "/ban x",
        findCommandSuggestions("/ban x", 6)
      )
    ).toBe(false)
  })
})

describe("applyCommandSuggestion", () => {
  test("replaces the input with the command and a trailing space", () => {
    const [suggestion] = findCommandSuggestions("/so", 3).suggestions

    expect(
      applyCommandSuggestion("/so", { start: 0, end: 3 }, suggestion!)
    ).toEqual({ value: "/shoutout ", caret: 10 })
  })
})

describe("getCommandSuggestionIndices", () => {
  test("wraps in both directions", () => {
    expect(getCommandSuggestionIndices(2, 3, "next")).toBe(0)
    expect(getCommandSuggestionIndices(0, 3, "prev")).toBe(2)
    expect(getCommandSuggestionIndices(0, 0, "next")).toBe(0)
  })
})

describe("shouldSuppressEmoteCompletion", () => {
  test("suppresses only while typing a slash command", () => {
    expect(shouldSuppressEmoteCompletion("/me :Kap")).toBe(true)
    expect(shouldSuppressEmoteCompletion(" /me :Kap")).toBe(false)
  })
})

describe("resolveCommandDefinition", () => {
  test("resolves names and aliases case-insensitively", () => {
    expect(resolveCommandDefinition("BAN")?.name).toBe("ban")
    expect(resolveCommandDefinition("So")?.name).toBe("shoutout")
  })

  test("returns null for empty or unknown tokens", () => {
    expect(resolveCommandDefinition("")).toBeNull()
    expect(resolveCommandDefinition("ba")).toBeNull()
  })
})
