import { describe, expect, test } from "bun:test"

import {
  getMessageBodyTokens,
  tokenizeMessageBody,
  type MessageBodyToken,
} from "@/lib/chat/presentation/message-body-tokens"
import type { TwitchChatGif, TwitchEmote } from "@/lib/twitch/chat/chat"

function emoteAt(text: string, code: string, from = 0): TwitchEmote {
  const start = text.indexOf(code, from)
  if (start < 0) {
    throw new Error(`${code} not found`)
  }
  return {
    id: code,
    code,
    provider: "7tv",
    imageUrl: `https://example.test/${code}`,
    start,
    end: start + code.length - 1,
  }
}

function render(text: string, tokens: MessageBodyToken[]) {
  return tokens.map((token) => {
    switch (token.kind) {
      case "emote":
        return `emote:${token.emote.code}`
      case "gif":
        return `gif:${token.gif.id}`
      case "url":
        return `url:${token.url}`
      default:
        return `${token.kind}:${text.slice(token.start, token.end)}`
    }
  })
}

describe("tokenizeMessageBody", () => {
  test("returns no tokens for empty text", () => {
    expect(tokenizeMessageBody("", [])).toEqual([])
  })

  test("splits plain text into text and mention tokens", () => {
    const text = "hi @alice and @bob"
    expect(render(text, tokenizeMessageBody(text, []))).toEqual([
      "text:hi ",
      "mention:@alice",
      "text: and ",
      "mention:@bob",
    ])
  })

  test("extracts urls and does not treat @ inside them as mentions", () => {
    const text = "see https://x.test/@bob ok @carol"
    expect(render(text, tokenizeMessageBody(text, []))).toEqual([
      "text:see ",
      "url:https://x.test/@bob",
      "text: ok ",
      "mention:@carol",
    ])
  })

  test("interleaves emotes with text, urls and mentions in order", () => {
    const text = "Kappa @alice https://a.test Kappa end"
    const emotes = [emoteAt(text, "Kappa", 1), emoteAt(text, "Kappa")]
    const tokens = tokenizeMessageBody(text, emotes)

    expect(render(text, tokens)).toEqual([
      "emote:Kappa",
      "text: ",
      "mention:@alice",
      "text: ",
      "url:https://a.test",
      "text: ",
      "emote:Kappa",
      "text: end",
    ])

    const textTokens = tokens.filter(
      (token): token is Extract<MessageBodyToken, { kind: "text" }> =>
        token.kind === "text"
    )
    expect(textTokens.at(-1)).toEqual({
      kind: "text",
      start: text.length - 4,
      end: text.length,
    })
  })

  test("skips overlapping emotes and consumes zero-width overlay ranges", () => {
    const text = "PogU RainTime tail"
    const base = emoteAt(text, "PogU")
    const overlay = emoteAt(text, "RainTime")
    const overlapping = { ...emoteAt(text, "PogU"), id: "dup", code: "dup" }
    const tokens = tokenizeMessageBody(text, [
      { ...base, overlays: [overlay] },
      overlapping,
    ])

    expect(render(text, tokens)).toEqual(["emote:PogU", "text: tail"])
  })

  test("places gifs alongside emotes by position", () => {
    const text = "Kappa gifcode after"
    const gif: TwitchChatGif = {
      id: "g1",
      url: "https://example.test/g1.gif",
      start: 6,
      end: 12,
    }
    const tokens = tokenizeMessageBody(text, [emoteAt(text, "Kappa")], [gif])
    expect(render(text, tokens)).toEqual([
      "emote:Kappa",
      "text: ",
      "gif:g1",
      "text: after",
    ])
  })

  test("uses UTF-16 offsets for text around emotes", () => {
    const text = "😀 Kappa ✨"
    const tokens = tokenizeMessageBody(text, [emoteAt(text, "Kappa")])
    expect(render(text, tokens)).toEqual([
      "text:😀 ",
      "emote:Kappa",
      "text: ✨",
    ])
  })
})

describe("getMessageBodyTokens", () => {
  test("caches tokens per emote array and text", () => {
    const text = "Kappa hi"
    const emotes = [emoteAt(text, "Kappa")]
    const first = getMessageBodyTokens(text, emotes)

    expect(getMessageBodyTokens(text, emotes)).toBe(first)
    const changed = getMessageBodyTokens("Kappa yo", emotes)
    expect(changed).not.toBe(first)
    expect(render("Kappa yo", changed)).toEqual(["emote:Kappa", "text: yo"])
  })

  test("invalidates the cache when the gif array changes", () => {
    const text = "Kappa gif"
    const emotes = [emoteAt(text, "Kappa")]
    const first = getMessageBodyTokens(text, emotes, [])
    const gifs: TwitchChatGif[] = [
      { id: "g", url: "https://example.test/g.gif", start: 6, end: 8 },
    ]
    expect(render(text, getMessageBodyTokens(text, emotes, gifs))).toEqual([
      "emote:Kappa",
      "text: ",
      "gif:g",
    ])
    expect(first).toHaveLength(2)
  })
})
