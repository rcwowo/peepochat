import { describe, expect, test } from "bun:test"

import {
  createChatSplit,
  createTwitchChannel,
} from "@/lib/peepochat/peepochat-config"
import { getSidebarEntries } from "@/lib/sidebar/sidebar-entries"

describe("getSidebarEntries", () => {
  const channels = [
    createTwitchChannel("a", { displayName: "A" }),
    createTwitchChannel("b"),
    createTwitchChannel("c"),
  ]

  test("resolves keys in order into split and channel entries", () => {
    const split = createChatSplit(["b", "ghost"], "s1")
    const entries = getSidebarEntries(
      ["channel:c", "split:s1", "channel:a"],
      [split],
      channels,
      new Set(["b", "ghost"])
    )

    expect(entries.map((entry) => entry.key)).toEqual([
      "channel:c",
      "split:s1",
      "channel:a",
    ])
    expect(entries[1]).toEqual({
      key: "split:s1",
      kind: "split",
      split,
      channels: [channels[1]!, { login: "ghost" }],
    })
  })

  test("skips unknown keys, single-channel splits and channels shown in a split", () => {
    const solo = { ...createChatSplit(["a"], "solo") }
    const entries = getSidebarEntries(
      [
        "split:missing",
        "split:solo",
        "channel:missing",
        "channel:b",
        "nonsense",
        "channel:c",
      ],
      [solo],
      channels,
      new Set(["b"])
    )

    expect(entries.map((entry) => entry.key)).toEqual(["channel:c"])
  })
})
