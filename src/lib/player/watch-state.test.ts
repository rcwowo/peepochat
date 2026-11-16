import { describe, expect, test } from "bun:test"

import {
  flattenSplitLayoutChannels,
  type ChatSplitLayoutNode,
} from "@/lib/chat/layout/split-layout"
import type {
  PlayerMode,
  PlayerMultiAudio,
} from "@/lib/peepochat/peepochat-config"
import {
  EMPTY_WATCH_STATE,
  watchReducer,
  type WatchAction,
  type WatchState,
} from "@/lib/player/watch-state"

function shape(node: ChatSplitLayoutNode | undefined): unknown {
  if (!node) return null
  if (node.type === "pane") return node.channel
  return {
    [node.direction]: node.children.map((entry) => shape(entry.node)),
  }
}

function open(
  logins: string[],
  mode: PlayerMode = "multi",
  multiAudio: PlayerMultiAudio = "first",
  initial: WatchState = EMPTY_WATCH_STATE
) {
  return logins.reduce(
    (state, login) =>
      watchReducer(state, { type: "open", login, mode, multiAudio }),
    initial
  )
}

function muted(state: WatchState) {
  return Object.fromEntries(
    state.instances.map((instance) => [instance.login, instance.muted])
  )
}

function expectConsistent(state: WatchState) {
  const logins = state.instances.map((instance) => instance.login)
  expect(new Set(logins).size).toBe(logins.length)
  expect([...flattenSplitLayoutChannels(state.layout)].sort()).toEqual(
    [...logins].sort()
  )
  if (logins.length > 0) {
    expect(logins).toContain(state.chatLogin!)
    expect(logins).toContain(state.focusedLogin!)
  }
}

describe("watchReducer open", () => {
  test("classic mode replaces whatever is playing", () => {
    const state = open(["a", "b"], "classic")

    expect(state).toEqual({
      instances: [{ login: "b", muted: false }],
      layout: { type: "pane", channel: "b" },
      chatLogin: "b",
      focusedLogin: "b",
      viewActive: true,
    })
  })

  test("multi mode places new panes in the largest area", () => {
    const two = open(["a", "b"])
    expect(shape(two.layout)).toEqual({ row: ["a", "b"] })

    const three = open(["c"], "multi", "first", two)
    expect(shape(three.layout)).toEqual({
      row: ["a", { column: ["b", "c"] }],
    })

    const four = open(["d"], "multi", "first", three)
    expect(shape(four.layout)).toEqual({
      row: [{ column: ["a", "d"] }, { column: ["b", "c"] }],
    })
    expectConsistent(four)
  })

  test("multi mode keeps the first stream's chat and focus", () => {
    const state = open(["a", "b", "c"])

    expect(state.chatLogin).toBe("a")
    expect(state.focusedLogin).toBe("a")
    expectConsistent(state)
  })

  test("multi audio controls which new streams start muted", () => {
    expect(muted(open(["a", "b", "c"], "multi", "first"))).toEqual({
      a: false,
      b: true,
      c: true,
    })
    expect(muted(open(["a", "b"], "multi", "all"))).toEqual({
      a: false,
      b: false,
    })
    expect(muted(open(["a", "b"], "multi", "muted"))).toEqual({
      a: true,
      b: true,
    })
  })

  test("sidebar mode mutes older streams and focuses the newest", () => {
    const state = open(["a", "b"], "sidebar")

    expect(muted(state)).toEqual({ a: true, b: false })
    expect(state.focusedLogin).toBe("b")
    expect(state.chatLogin).toBe("a")
  })

  test("reopening an existing stream only reveals it", () => {
    const hidden = watchReducer(open(["a", "b"]), { type: "hide" })
    const multi = watchReducer(hidden, {
      type: "open",
      login: "b",
      mode: "multi",
      multiAudio: "first",
    })

    expect(multi.instances).toBe(hidden.instances)
    expect(multi.viewActive).toBe(true)
    expect(multi.focusedLogin).toBe("a")

    const sidebar = watchReducer(hidden, {
      type: "open",
      login: "b",
      mode: "sidebar",
      multiAudio: "first",
    })
    expect(sidebar.focusedLogin).toBe("b")
  })
})

describe("watchReducer close", () => {
  test("hands chat and focus to the previous stream", () => {
    const state = watchReducer(
      watchReducer(open(["a", "b", "c"]), { type: "setChat", login: "b" }),
      { type: "show", login: "b" }
    )
    const closed = watchReducer(state, { type: "close", login: "b" })

    expect(closed.chatLogin).toBe("a")
    expect(closed.focusedLogin).toBe("a")
    expectConsistent(closed)
  })

  test("hands chat to the next stream when the first is closed", () => {
    const closed = watchReducer(open(["a", "b", "c"]), {
      type: "close",
      login: "a",
    })

    expect(closed.chatLogin).toBe("b")
    expect(closed.focusedLogin).toBe("b")
    expectConsistent(closed)
  })

  test("keeps chat and focus when another stream is closed", () => {
    const closed = watchReducer(open(["a", "b", "c"]), {
      type: "close",
      login: "c",
    })

    expect(closed.chatLogin).toBe("a")
    expect(shape(closed.layout)).toEqual({ row: ["a", "b"] })
  })

  test("returns the empty state after the last stream closes", () => {
    expect(watchReducer(open(["a"]), { type: "close", login: "a" })).toBe(
      EMPTY_WATCH_STATE
    )
    expect(watchReducer(open(["a", "b"]), { type: "closeAll" })).toBe(
      EMPTY_WATCH_STATE
    )
  })

  test("ignores unknown streams", () => {
    const state = open(["a"])

    expect(watchReducer(state, { type: "close", login: "zzz" })).toBe(state)
  })
})

describe("watchReducer collapse", () => {
  test("keeps the requested stream, unmuted", () => {
    const state = watchReducer(open(["a", "b", "c"]), {
      type: "collapse",
      login: "c",
    })

    expect(state).toMatchObject({
      instances: [{ login: "c", muted: false }],
      layout: { type: "pane", channel: "c" },
      chatLogin: "c",
      focusedLogin: "c",
    })
  })

  test("falls back to the focused stream", () => {
    const focused = watchReducer(open(["a", "b"]), { type: "show", login: "b" })

    expect(
      watchReducer(focused, { type: "collapse", login: "zzz" }).instances
    ).toEqual([{ login: "b", muted: false }])
    expect(
      watchReducer(focused, { type: "collapse", login: null }).instances
    ).toEqual([{ login: "b", muted: false }])
  })

  test("is a no-op with a single stream", () => {
    const state = open(["a"])

    expect(watchReducer(state, { type: "collapse", login: "a" })).toBe(state)
  })
})

describe("watchReducer state identity", () => {
  const state = open(["a", "b"])
  const unchanged: WatchAction[] = [
    { type: "show" },
    { type: "show", login: "a" },
    { type: "show", login: "zzz" },
    { type: "setChat", login: "a" },
    { type: "setChat", login: "zzz" },
    { type: "reportMuted", login: "b", muted: true },
    { type: "reportMuted", login: "zzz", muted: true },
  ]

  for (const action of unchanged) {
    test(`returns the same state for ${JSON.stringify(action)}`, () => {
      expect(watchReducer(state, action)).toBe(state)
    })
  }

  test("show and hide toggle visibility", () => {
    const hidden = watchReducer(state, { type: "hide" })

    expect(hidden.viewActive).toBe(false)
    expect(watchReducer(hidden, { type: "hide" })).toBe(hidden)
    expect(watchReducer(hidden, { type: "show" }).viewActive).toBe(true)
    expect(watchReducer(EMPTY_WATCH_STATE, { type: "show" })).toBe(
      EMPTY_WATCH_STATE
    )
  })

  test("reportMuted updates only the reported stream", () => {
    expect(
      muted(
        watchReducer(state, { type: "reportMuted", login: "a", muted: true })
      )
    ).toEqual({ a: true, b: true })
  })
})

describe("watchReducer layout actions", () => {
  test("move rearranges panes", () => {
    const moved = watchReducer(open(["a", "b", "c"]), {
      type: "move",
      sourceLogin: "a",
      targetLogin: "c",
      edge: "bottom",
    })

    expect(shape(moved.layout)).toEqual({ column: ["b", "c", "a"] })
    expectConsistent(moved)
  })

  test("resize updates child sizes", () => {
    const resized = watchReducer(open(["a", "b"]), {
      type: "resize",
      path: [],
      sizes: [3, 1],
    })

    expect(
      resized.layout?.type === "split"
        ? resized.layout.children.map((entry) => entry.size)
        : null
    ).toEqual([75, 25])
  })
})
