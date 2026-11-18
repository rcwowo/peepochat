import { describe, expect, test } from "bun:test"

import {
  parseTtsChatCommand,
  TTS_COMMAND_CATALOG,
  TTS_COMMAND_ORDER,
  type TtsChatCommand,
} from "@/lib/tts/chat-commands"

describe("parseTtsChatCommand", () => {
  test.each([
    ["!tts on", { id: "queue", enabled: true }],
    ["!tts off", { id: "queue", enabled: false }],
    ["!tts pause", { id: "playback", playing: false }],
    ["!tts play", { id: "playback", playing: true }],
    ["!tts skip", { id: "skip" }],
    ["!tts clear", { id: "clear" }],
    ["!newvoice", { id: "newVoice" }],
  ] satisfies [string, TtsChatCommand][])("%p", (text, expected) => {
    expect(parseTtsChatCommand(text)).toEqual(expected)
  })

  test("is case-insensitive and tolerates extra whitespace", () => {
    expect(parseTtsChatCommand("  !TTS \t SKIP  ")).toEqual({ id: "skip" })
    expect(parseTtsChatCommand("!NewVoice")).toEqual({ id: "newVoice" })
  })

  test("ignores trailing arguments", () => {
    expect(parseTtsChatCommand("!tts off for now")).toEqual({
      id: "queue",
      enabled: false,
    })
    expect(parseTtsChatCommand("!newvoice please")).toEqual({ id: "newVoice" })
  })

  test.each([
    "",
    "   ",
    "!tts",
    "!tts resume",
    "!ttson",
    "tts on",
    "hello !tts on",
    "!newvoices",
  ])("rejects %p", (text) => {
    expect(parseTtsChatCommand(text)).toBeNull()
  })
})

describe("TTS command catalog", () => {
  test("every trigger parses to its own command", () => {
    for (const id of TTS_COMMAND_ORDER) {
      for (const trigger of TTS_COMMAND_CATALOG[id].triggers) {
        expect(parseTtsChatCommand(trigger)?.id).toBe(id)
      }
    }
  })
})
