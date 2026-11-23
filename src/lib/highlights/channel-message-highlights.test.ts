import { describe, expect, test } from "bun:test"
import { createElement } from "react"
import { renderToString } from "react-dom/server"

import {
  addChannelMessageHighlight,
  removeChannelMessageHighlight,
  useChannelMessageHighlights,
  type ChannelMessageHighlight,
} from "@/lib/highlights/channel-message-highlights"

function highlight(messageId: string): ChannelMessageHighlight {
  return {
    messageId,
    ruleId: "rule",
    matchPattern: "pattern",
    matchRange: { start: 0, end: 1 },
  }
}

function readHighlights(login: string) {
  let snapshot: ReadonlyMap<string, ChannelMessageHighlight> = new Map()
  function Probe() {
    snapshot = useChannelMessageHighlights(login)
    return null
  }
  renderToString(createElement(Probe))
  return snapshot
}

describe("channel message highlights", () => {
  test("starts empty for unknown channels", () => {
    expect(readHighlights("never-used").size).toBe(0)
  })

  test("adds highlights and rejects duplicate message ids", () => {
    expect(addChannelMessageHighlight("dupes", highlight("a"))).toBe(true)
    expect(addChannelMessageHighlight("dupes", highlight("a"))).toBe(false)
    expect(addChannelMessageHighlight("dupes", highlight("b"))).toBe(true)

    expect([...readHighlights("dupes").keys()]).toEqual(["a", "b"])
  })

  test("normalizes channel logins", () => {
    addChannelMessageHighlight("#MixedCase ", highlight("a"))

    expect(addChannelMessageHighlight("mixedcase", highlight("a"))).toBe(false)
    expect(readHighlights("#MIXEDCASE").get("a")).toEqual(highlight("a"))
  })

  test("keeps channels isolated", () => {
    addChannelMessageHighlight("iso-one", highlight("a"))

    expect(addChannelMessageHighlight("iso-two", highlight("a"))).toBe(true)
    expect(readHighlights("iso-one").size).toBe(1)
  })

  test("evicts the oldest highlights beyond 250 per channel", () => {
    for (let index = 0; index < 252; index += 1) {
      addChannelMessageHighlight("capped", highlight(`m${index}`))
    }

    const highlights = readHighlights("capped")
    expect(highlights.size).toBe(250)
    expect(highlights.has("m0")).toBe(false)
    expect(highlights.has("m1")).toBe(false)
    expect(highlights.has("m2")).toBe(true)
    expect(highlights.has("m251")).toBe(true)
  })

  test("removes highlights so they can be added again", () => {
    addChannelMessageHighlight("removal", highlight("a"))
    addChannelMessageHighlight("removal", highlight("b"))

    removeChannelMessageHighlight("REMOVAL", "a")
    expect([...readHighlights("removal").keys()]).toEqual(["b"])
    expect(addChannelMessageHighlight("removal", highlight("a"))).toBe(true)

    removeChannelMessageHighlight("removal", "a")
    removeChannelMessageHighlight("removal", "b")
    expect(readHighlights("removal").size).toBe(0)
  })

  test("ignores removal of unknown highlights", () => {
    addChannelMessageHighlight("unknown-removal", highlight("a"))
    const before = readHighlights("unknown-removal")

    removeChannelMessageHighlight("unknown-removal", "missing")
    removeChannelMessageHighlight("no-such-channel", "a")

    expect(readHighlights("unknown-removal")).toBe(before)
  })

  test("produces a new snapshot after each change", () => {
    addChannelMessageHighlight("snapshots", highlight("a"))
    const first = readHighlights("snapshots")

    addChannelMessageHighlight("snapshots", highlight("b"))
    const second = readHighlights("snapshots")

    expect(second).not.toBe(first)
    expect(first.size).toBe(1)
    expect(second.size).toBe(2)
  })
})
