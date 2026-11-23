import { describe, expect, test } from "bun:test"

import {
  FALLBACK_SECTION_BOOST,
  rankPaletteSections,
  scorePaletteQuery,
  scoreTerm,
  type PaletteSection,
} from "@/lib/command-palette/ranking"

type Item = { id: string; title: string; keywords?: string[] }

function section(
  id: string,
  items: Item[],
  options: Partial<PaletteSection<Item>> = {}
): PaletteSection<Item> {
  return { id, order: 0, items, ...options }
}

function ids(
  ranked: ReturnType<typeof rankPaletteSections<Item, PaletteSection<Item>>>
) {
  return ranked.map((entry) => [
    entry.section.id,
    entry.items.map((item) => item.id),
  ])
}

describe("scoreTerm", () => {
  test("ranks exact, prefix, word prefix, substring, then subsequence", () => {
    const scores = [
      scoreTerm("emotes", "emotes"),
      scoreTerm("emo", "emotes"),
      scoreTerm("emo", "reload emotes"),
      scoreTerm("mote", "reload emotes"),
      scoreTerm("rle", "reload emotes"),
    ]
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
    expect(scores.every((score) => score > 0)).toBe(true)
  })

  test("returns zero for unrelated text", () => {
    expect(scoreTerm("xyz", "reload emotes")).toBe(0)
  })

  test("only uses subsequence matching for queries of three or more characters", () => {
    expect(scoreTerm("rl", "reload emotes")).toBe(0)
    expect(scoreTerm("on", "shroud")).toBe(0)
    expect(scoreTerm("rle", "reload emotes")).toBeGreaterThan(0)
  })
})

describe("scorePaletteQuery", () => {
  test("requires every word of a multi-word query to match", () => {
    const watch = { title: "Watch xQc", keywords: ["xqc", "watch"] }
    const goTo = { title: "Go to xQc", keywords: ["xqc"] }
    expect(scorePaletteQuery("watch xqc", watch)).toBeGreaterThan(0)
    expect(scorePaletteQuery("watch xqc", goTo)).toBe(0)
  })

  test("treats an exact keyword hit as a full match", () => {
    expect(
      scorePaletteQuery("xqc", { title: "Go to xQc", keywords: ["xqc"] })
    ).toBe(1)
  })
})

describe("rankPaletteSections", () => {
  const sections = [
    section(
      "general",
      [
        { id: "reload", title: "Reload emotes" },
        { id: "search", title: "Search messages" },
      ],
      { order: 3, showWhenEmpty: true }
    ),
    section(
      "current",
      [
        { id: "viewers", title: "Viewer list" },
        { id: "emotes", title: "Emote picker" },
      ],
      { order: 0, showWhenEmpty: true, keepItemOrder: true, boost: 0.1 }
    ),
    section(
      "xqc",
      [
        { id: "add-to-split", title: "Add xQc to split", keywords: ["xqc"] },
        { id: "go-to", title: "Go to xQc", keywords: ["xqc"] },
      ],
      { order: 1, keepItemOrder: true, kind: "channel", subject: ["xqc"] }
    ),
  ]

  test("shows only empty-state sections in order when there is no query", () => {
    expect(ids(rankPaletteSections(sections, " "))).toEqual([
      ["current", ["viewers", "emotes"]],
      ["general", ["reload", "search"]],
    ])
  })

  test("surfaces channel sections and keeps their contextual item order", () => {
    expect(ids(rankPaletteSections(sections, "xqc"))).toEqual([
      ["xqc", ["add-to-split", "go-to"]],
    ])
  })

  test("prefers context sections over equally matching generic ones", () => {
    expect(ids(rankPaletteSections(sections, "emote"))).toEqual([
      ["current", ["emotes"]],
      ["general", ["reload"]],
    ])
  })

  test("sorts items within generic sections by score", () => {
    expect(ids(rankPaletteSections(sections, "search"))[0]).toEqual([
      "general",
      ["search"],
    ])
  })

  test("hides channel sections unless the query names the channel", () => {
    expect(
      rankPaletteSections(sections, "split").map((entry) => entry.section.id)
    ).not.toContain("xqc")
    expect(ids(rankPaletteSections(sections, "split xqc"))).toEqual([
      ["xqc", ["add-to-split"]],
    ])
  })

  test("caps the number of channel sections", () => {
    const many = Array.from({ length: 10 }, (_, index) =>
      section(
        `channel-${index}`,
        [{ id: `go-${index}`, title: `Go to streamer${index}` }],
        { order: 1, kind: "channel" }
      )
    )
    expect(rankPaletteSections(many, "streamer")).toHaveLength(6)
  })

  test("ignores a single leading # in the query", () => {
    expect(ids(rankPaletteSections(sections, "#xqc"))).toEqual(
      ids(rankPaletteSections(sections, "xqc"))
    )
    expect(ids(rankPaletteSections(sections, "#"))).toEqual(
      ids(rankPaletteSections(sections, ""))
    )
  })
})

describe("rankPaletteSections typed channel fallback", () => {
  function channelSection(login: string) {
    const terms = [login]
    return section(
      `channel:${login}`,
      [
        {
          id: `${login}:go-to`,
          title: `Go to ${login}`,
          keywords: [...terms, "go to", "switch", "open"],
        },
        {
          id: `${login}:watch`,
          title: `Watch ${login}`,
          keywords: [...terms, "player", "stream", "video"],
        },
        {
          id: `${login}:open-page`,
          title: "Open channel page",
          keywords: [...terms, "twitch", "browser", "external"],
        },
      ],
      { order: 2, keepItemOrder: true, kind: "channel", subject: terms }
    )
  }

  function typedSection(login: string) {
    return section(
      `typed:${login}`,
      [
        {
          id: "typed:add",
          title: `Add ${login}`,
          keywords: [login, "add", "join", "new"],
        },
        {
          id: "typed:add-watch",
          title: `Add and watch ${login}`,
          keywords: [login, "add", "watch", "player"],
        },
      ],
      {
        order: 3,
        keepItemOrder: true,
        subject: [login],
        boost: FALLBACK_SECTION_BOOST,
      }
    )
  }

  const general = section(
    "general",
    [
      { id: "reload", title: "Reload emotes", keywords: ["refresh", "7tv"] },
      { id: "search", title: "Search messages", keywords: ["find"] },
    ],
    { order: 5, showWhenEmpty: true }
  )
  const theme = section(
    "theme",
    [
      { id: "dark", title: "Dark", keywords: ["theme", "mode", "appearance"] },
      {
        id: "light",
        title: "Light",
        keywords: ["theme", "mode", "appearance"],
      },
    ],
    { order: 8 }
  )

  function sectionIds(query: string, typed: string) {
    return rankPaletteSections(
      [
        general,
        theme,
        channelSection("shroud"),
        channelSection("xqc"),
        typedSection(typed),
      ],
      query
    ).map((entry) => entry.section.id)
  }

  test("ranks a partially matching added channel above the typed section", () => {
    expect(sectionIds("shr", "shr")).toEqual(["channel:shroud", "typed:shr"])
  })

  test("ranks a substring-matching added channel above the typed section", () => {
    expect(sectionIds("roud", "roud")).toEqual(["channel:shroud", "typed:roud"])
  })

  test("ranks matching commands above the typed section", () => {
    expect(sectionIds("reload", "reload")).toEqual(["general", "typed:reload"])
    expect(sectionIds("theme", "theme")).toEqual(["theme", "typed:theme"])
  })

  test("does not count the typed section toward the channel cap", () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      channelSection(`streamer${index}`)
    )
    const ranked = rankPaletteSections(
      [...many, typedSection("streamer")],
      "streamer"
    ).map((entry) => entry.section.id)
    expect(ranked).toHaveLength(7)
    expect(ranked.at(-1)).toBe("typed:streamer")
  })
})
