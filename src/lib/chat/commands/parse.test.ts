import { describe, expect, test } from "bun:test"

import { parseSlashCommand, splitFirstToken } from "@/lib/chat/commands/parse"

describe("parseSlashCommand", () => {
  test("returns null for non-command input", () => {
    expect(parseSlashCommand("hello")).toBeNull()
    expect(parseSlashCommand("")).toBeNull()
    expect(parseSlashCommand(" hi /ban")).toBeNull()
  })

  test("lowercases the command name and trims arguments", () => {
    expect(parseSlashCommand("  /BAN  someone   spamming ")).toEqual({
      name: "ban",
      rawArgs: "someone   spamming",
    })
  })

  test("returns empty args for a bare command", () => {
    expect(parseSlashCommand("/Clear")).toEqual({ name: "clear", rawArgs: "" })
    expect(parseSlashCommand("/")).toEqual({ name: "", rawArgs: "" })
  })
})

describe("splitFirstToken", () => {
  test("splits off the first whitespace-delimited token", () => {
    expect(splitFirstToken(" user  10m reason ")).toEqual([
      "user",
      "10m reason",
    ])
  })

  test("handles single tokens and empty input", () => {
    expect(splitFirstToken("user")).toEqual(["user", ""])
    expect(splitFirstToken("   ")).toEqual(["", ""])
  })
})
