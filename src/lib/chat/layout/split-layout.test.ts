import { describe, expect, test } from "bun:test"

import {
  clampAdjacentSplitSizes,
  createDefaultSplitLayout,
  flattenSplitLayoutChannels,
  insertSplitLayoutPane,
  moveSplitLayoutPane,
  normalizeSplitLayout,
  resizeSplitLayoutChildren,
  type ChatSplitLayoutChild,
  type ChatSplitLayoutNode,
  type SplitLayoutDirection,
  type SplitLayoutEdge,
} from "@/lib/chat/layout/split-layout"

function p(channel: string): ChatSplitLayoutNode {
  return { type: "pane", channel }
}

function s(
  direction: SplitLayoutDirection,
  ...children: (ChatSplitLayoutNode | [ChatSplitLayoutNode, number])[]
): ChatSplitLayoutNode {
  return {
    type: "split",
    direction,
    children: children.map((entry): ChatSplitLayoutChild =>
      Array.isArray(entry)
        ? { node: entry[0], size: entry[1] }
        : { node: entry, size: 100 / children.length }
    ),
  }
}

function shape(node: ChatSplitLayoutNode | undefined): unknown {
  if (!node) return null
  if (node.type === "pane") return node.channel
  return {
    [node.direction]: node.children.map((entry) => shape(entry.node)),
  }
}

function sizes(node: ChatSplitLayoutNode | undefined) {
  if (node?.type !== "split") throw new Error("expected a split")
  return node.children.map((entry) => entry.size)
}

function expectValidLayout(
  node: ChatSplitLayoutNode | undefined,
  channels: string[]
) {
  expect(node).toBeDefined()
  const visit = (current: ChatSplitLayoutNode) => {
    if (current.type === "pane") return
    expect(current.children.length).toBeGreaterThanOrEqual(2)
    const total = current.children.reduce((sum, entry) => sum + entry.size, 0)
    expect(total).toBeCloseTo(100, 6)
    for (const entry of current.children) {
      expect(Number.isFinite(entry.size)).toBe(true)
      expect(entry.size).toBeGreaterThan(0)
      visit(entry.node)
    }
  }
  visit(node!)
  expect([...flattenSplitLayoutChannels(node)].sort()).toEqual(
    [...channels].sort()
  )
}

describe("createDefaultSplitLayout", () => {
  test("creates an evenly sized split of normalized channels", () => {
    const layout = createDefaultSplitLayout(["#A", " b ", "", "c"], "column")

    expect(shape(layout)).toEqual({ column: ["a", "b", "c"] })
    expect(sizes(layout)).toEqual([100 / 3, 100 / 3, 100 / 3])
  })

  test("returns a single pane for zero or one channel", () => {
    expect(createDefaultSplitLayout(["#Solo"])).toEqual(p("solo"))
    expect(createDefaultSplitLayout([])).toEqual(p(""))
  })
})

describe("flattenSplitLayoutChannels", () => {
  test("lists panes depth-first and skips empty panes", () => {
    expect(
      flattenSplitLayoutChannels(
        s("row", p("a"), s("column", p("b"), p("")), p("c"))
      )
    ).toEqual(["a", "b", "c"])
    expect(flattenSplitLayoutChannels(undefined)).toEqual([])
  })
})

describe("normalizeSplitLayout", () => {
  test("returns undefined without channels", () => {
    expect(normalizeSplitLayout(p("a"), [" ", "#"])).toBeUndefined()
  })

  test("builds a default layout when none is stored", () => {
    expect(shape(normalizeSplitLayout(undefined, ["a", "b"]))).toEqual({
      row: ["a", "b"],
    })
  })

  test("drops unknown and duplicate panes and collapses single-child splits", () => {
    const layout = normalizeSplitLayout(
      s("row", p("#A"), s("column", p("gone"), p("b")), p("a")),
      ["a", "b"]
    )

    expect(shape(layout)).toEqual({ row: ["a", "b"] })
    expectValidLayout(layout, ["a", "b"])
  })

  test("appends missing channels with an even share", () => {
    const layout = normalizeSplitLayout(
      s("column", [p("a"), 75], [p("b"), 25]),
      ["a", "b", "c", "d"]
    )

    expect(shape(layout)).toEqual({ column: ["a", "b", "c", "d"] })
    expect(sizes(layout)).toEqual([37.5, 12.5, 25, 25])
    expectValidLayout(layout, ["a", "b", "c", "d"])
  })

  test("wraps a lone pane when channels are added", () => {
    const layout = normalizeSplitLayout(p("a"), ["a", "b"])

    expect(shape(layout)).toEqual({ row: ["a", "b"] })
    expect(sizes(layout)).toEqual([50, 50])
  })

  test("rescales sizes proportionally to sum to 100", () => {
    const layout = normalizeSplitLayout(
      s("row", [p("a"), 1], [p("b"), 1], [p("c"), 2]),
      ["a", "b", "c"]
    )

    expect(sizes(layout)).toEqual([25, 25, 50])
  })

  test("splits evenly when every size is invalid", () => {
    for (const invalid of [0, -5, Number.NaN, Infinity]) {
      expect(
        sizes(
          normalizeSplitLayout(s("row", [p("a"), invalid], [p("b"), invalid]), [
            "a",
            "b",
          ])
        )
      ).toEqual([50, 50])
    }
  })

  test("coerces unknown directions to row", () => {
    const layout = normalizeSplitLayout(
      {
        type: "split",
        direction: "diagonal" as SplitLayoutDirection,
        children: [
          { node: p("a"), size: 50 },
          { node: p("b"), size: 50 },
        ],
      },
      ["a", "b"]
    )

    expect(shape(layout)).toEqual({ row: ["a", "b"] })
  })

  test("is idempotent", () => {
    const channels = ["a", "b", "c"]
    const once = normalizeSplitLayout(
      s("row", [p("a"), 3], [s("column", [p("b"), 1], [p("x"), 1]), 1]),
      channels
    )

    expect(normalizeSplitLayout(once, channels)).toEqual(once!)
  })
})

describe("moveSplitLayoutPane", () => {
  const channels = ["a", "b", "c"]
  const base = s("row", p("a"), p("b"), p("c"))

  function move(
    layout: ChatSplitLayoutNode | undefined,
    sourceChannel: string,
    targetChannel: string,
    edge: SplitLayoutEdge,
    list = channels
  ) {
    const result = moveSplitLayoutPane({
      layout,
      channels: list,
      sourceChannel,
      targetChannel,
      edge,
    })
    expectValidLayout(result, list)
    return result
  }

  test("reorders within a split along the same axis", () => {
    expect(shape(move(base, "a", "c", "right"))).toEqual({
      row: ["b", "c", "a"],
    })
    expect(shape(move(base, "c", "a", "left"))).toEqual({
      row: ["c", "a", "b"],
    })
  })

  test("nests a perpendicular split around the target", () => {
    expect(shape(move(base, "a", "b", "bottom"))).toEqual({
      row: [{ column: ["b", "a"] }, "c"],
    })
    expect(shape(move(base, "c", "a", "top"))).toEqual({
      row: [{ column: ["c", "a"] }, "b"],
    })
  })

  test("collapses the split the source leaves behind", () => {
    const nested = s("row", s("column", p("a"), p("b")), p("c"))

    expect(shape(move(nested, "b", "c", "right"))).toEqual({
      row: ["a", "c", "b"],
    })
  })

  test("turns two panes into a split along the dropped edge", () => {
    expect(
      shape(move(s("row", p("a"), p("b")), "a", "b", "bottom", ["a", "b"]))
    ).toEqual({ column: ["b", "a"] })
  })

  test("normalizes channel names", () => {
    expect(shape(move(base, "#A", " C ", "right"))).toEqual({
      row: ["b", "c", "a"],
    })
  })

  test("leaves the layout unchanged for self-moves and unknown panes", () => {
    const sized = s("row", [p("a"), 60], [p("b"), 30], [p("c"), 10])

    expect(move(sized, "a", "a", "left")).toEqual(sized)
    expect(move(sized, "zzz", "a", "left")).toEqual(sized)
    expect(move(sized, "a", "zzz", "left")).toEqual(sized)
  })

  test("returns undefined without channels", () => {
    expect(
      moveSplitLayoutPane({
        layout: base,
        channels: [],
        sourceChannel: "a",
        targetChannel: "b",
        edge: "left",
      })
    ).toBeUndefined()
  })
})

describe("insertSplitLayoutPane", () => {
  test("inserts a new pane next to the target", () => {
    const layout = insertSplitLayoutPane({
      layout: s("row", p("a"), p("b")),
      channels: ["a", "b", "c"],
      channel: "#C",
      targetChannel: "a",
      edge: "bottom",
    })

    expect(shape(layout)).toEqual({ row: [{ column: ["a", "c"] }, "b"] })
    expectValidLayout(layout, ["a", "b", "c"])
  })

  test("moves an existing pane rather than duplicating it", () => {
    const layout = insertSplitLayoutPane({
      layout: s("row", p("a"), p("b"), p("c")),
      channels: ["a", "b", "c"],
      channel: "a",
      targetChannel: "c",
      edge: "left",
    })

    expect(shape(layout)).toEqual({ row: ["b", "a", "c"] })
  })

  test("appends the pane when the target is unknown", () => {
    const layout = insertSplitLayoutPane({
      layout: s("column", p("a"), p("b")),
      channels: ["a", "b", "c"],
      channel: "c",
      targetChannel: "missing",
      edge: "left",
    })

    expect(shape(layout)).toEqual({ column: ["a", "b", "c"] })
    expectValidLayout(layout, ["a", "b", "c"])
  })

  test("builds a layout when it is the first pane", () => {
    expect(
      insertSplitLayoutPane({
        layout: undefined,
        channels: ["a"],
        channel: "a",
        targetChannel: "",
        edge: "right",
      })
    ).toEqual(p("a"))
  })
})

describe("resizeSplitLayoutChildren", () => {
  const channels = ["a", "b", "c"]
  const nested = s("row", p("a"), s("column", p("b"), p("c")))

  test("updates sizes at the given path and rescales to 100", () => {
    const layout = resizeSplitLayoutChildren({
      layout: nested,
      channels,
      path: [1],
      sizes: [1, 3],
    })

    expectValidLayout(layout, channels)
    if (layout?.type !== "split") throw new Error("expected a split")
    expect(sizes(layout)).toEqual([50, 50])
    expect(sizes(layout.children[1]!.node)).toEqual([25, 75])
  })

  test("updates the root when the path is empty", () => {
    expect(
      sizes(
        resizeSplitLayoutChildren({
          layout: nested,
          channels,
          path: [],
          sizes: [70, 30],
        })
      )
    ).toEqual([70, 30])
  })

  test("ignores mismatched size lists and invalid paths", () => {
    const expected = normalizeSplitLayout(nested, channels)

    for (const input of [
      { path: [], sizes: [100] },
      { path: [5], sizes: [50, 50] },
      { path: [-1], sizes: [50, 50] },
      { path: [0], sizes: [50, 50] },
    ]) {
      expect(
        resizeSplitLayoutChildren({ layout: nested, channels, ...input })
      ).toEqual(expected!)
    }
  })
})

describe("clampAdjacentSplitSizes", () => {
  test("keeps both neighbours above the minimum while preserving their total", () => {
    expect(clampAdjacentSplitSizes([0.5, 49.5, 50], 0)).toEqual([2, 48, 50])
    expect(clampAdjacentSplitSizes([20, 79, 1], 1)).toEqual([20, 78, 2])
  })

  test("leaves valid sizes alone", () => {
    expect(clampAdjacentSplitSizes([30, 70], 0)).toEqual([30, 70])
  })

  test("splits evenly when the pair is smaller than twice the minimum", () => {
    expect(clampAdjacentSplitSizes([0.5, 2.5], 0)).toEqual([1.5, 1.5])
  })

  test("returns the input for out-of-range indices or an empty pair", () => {
    const input = [50, 50]

    expect(clampAdjacentSplitSizes(input, 1)).toBe(input)
    expect(clampAdjacentSplitSizes(input, -1)).toBe(input)
    const empty = [0, 0]
    expect(clampAdjacentSplitSizes(empty, 0)).toBe(empty)
  })

  test("respects a custom minimum", () => {
    expect(clampAdjacentSplitSizes([5, 95], 0, 10)).toEqual([10, 90])
  })
})
