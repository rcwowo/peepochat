import { describe, expect, test } from "bun:test"

import { tokenizeMessageBody } from "../src/lib/chat/chat-message-body-tokens"
import type { TwitchEmote } from "../src/lib/twitch/twitch-chat"

function emote(start: number, end: number): TwitchEmote {
  return {
    id: "1",
    code: "Kappa",
    provider: "twitch",
    imageUrl: "https://example.com/kappa.png",
    start,
    end,
  }
}

describe("tokenizeMessageBody", () => {
  test("splits mentions and urls in plain text", () => {
    const tokens = tokenizeMessageBody("hi @foo see https://a.test", [])
    expect(tokens).toEqual([
      { kind: "text", start: 0, end: 3 },
      { kind: "mention", start: 3, end: 7 },
      { kind: "text", start: 7, end: 12 },
      {
        kind: "url",
        start: 12,
        end: 26,
        url: "https://a.test",
      },
    ])
  })

  test("keeps emotes as tokens and tokenizes the gaps", () => {
    const tokens = tokenizeMessageBody("hi Kappa there", [emote(3, 7)])
    expect(tokens.map((token) => token.kind)).toEqual(["text", "emote", "text"])
    expect(tokens[0]).toEqual({ kind: "text", start: 0, end: 3 })
    expect(tokens[2]).toEqual({ kind: "text", start: 8, end: 14 })
  })
})
