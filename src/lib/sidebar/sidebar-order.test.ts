import { describe, expect, test } from "bun:test"

import {
  createChatSplit,
  createDefaultConfig,
  createTwitchChannel,
  type AppConfig,
  type ChatSplit,
} from "@/lib/peepochat/peepochat-config"
import {
  appendChannelToSidebarOrder,
  applySidebarOrder,
  buildSidebarOrder,
  channelOrderKey,
  normalizeSidebarOrder,
  removeKeysFromSidebarOrder,
  reorderSidebarItemIds,
  replaceChannelsWithSplitInOrder,
  resolveFocusAfterChannelRemoval,
  splitOrderKey,
  wasRemovedChannelInView,
} from "@/lib/sidebar/sidebar-order"

function makeConfig({
  channels,
  splits = [],
  sidebarOrder,
  activeChannelLogin = "",
  activeSplitId = null,
}: {
  channels: string[]
  splits?: ChatSplit[]
  sidebarOrder?: string[]
  activeChannelLogin?: string
  activeSplitId?: string | null
}): AppConfig {
  const base = createDefaultConfig()
  return {
    ...base,
    twitch: {
      ...base.twitch,
      channels: channels.map((login) => createTwitchChannel(login)),
      activeChannelLogin,
    },
    layout: {
      ...base.layout,
      activeSplitId,
      splits,
      sidebarOrder,
    },
  }
}

function logins(channels: { login: string }[]) {
  return channels.map((channel) => channel.login)
}

describe("order keys", () => {
  test("normalizes channel logins", () => {
    expect(channelOrderKey(" #Foo ")).toBe("channel:foo")
    expect(splitOrderKey("s1")).toBe("split:s1")
  })
})

describe("buildSidebarOrder", () => {
  test("lists multi-channel splits first, then channels not in a split", () => {
    const config = makeConfig({
      channels: ["a", "b", "c", "d"],
      splits: [createChatSplit(["b", "c"], "s1")],
    })

    expect(buildSidebarOrder(config)).toEqual([
      "split:s1",
      "channel:a",
      "channel:d",
    ])
  })
})

describe("normalizeSidebarOrder", () => {
  test("keeps the stored order, drops stale and duplicate keys, appends new ones", () => {
    const config = makeConfig({
      channels: ["a", "b", "c", "d"],
      splits: [createChatSplit(["b", "c"], "s1")],
      sidebarOrder: [
        "channel:d",
        "channel:gone",
        "split:s1",
        "channel:d",
        "channel:b",
        "bogus",
      ],
    })

    expect(normalizeSidebarOrder(config)).toEqual([
      "channel:d",
      "split:s1",
      "channel:a",
    ])
  })

  test("falls back to the default order when none is stored", () => {
    const config = makeConfig({ channels: ["a", "b"] })

    expect(normalizeSidebarOrder(config)).toEqual(["channel:a", "channel:b"])
  })
})

describe("applySidebarOrder", () => {
  test("reorders splits and channels to follow the sidebar", () => {
    const config = makeConfig({
      channels: ["a", "b", "c", "d", "e"],
      splits: [
        createChatSplit(["b", "c"], "s1"),
        createChatSplit(["d", "e"], "s2"),
      ],
    })

    const result = applySidebarOrder(config, [
      "channel:a",
      "split:s2",
      "split:s1",
    ])

    expect(result.layout.splits.map((split) => split.id)).toEqual(["s2", "s1"])
    expect(logins(result.channels)).toEqual(["d", "e", "b", "c", "a"])
    expect(result.layout.sidebarOrder).toEqual([
      "channel:a",
      "split:s2",
      "split:s1",
    ])
  })

  test("keeps every channel and split even when the order omits them", () => {
    const config = makeConfig({
      channels: ["a", "b", "c", "d"],
      splits: [createChatSplit(["c", "d"], "s1")],
    })

    const result = applySidebarOrder(config, ["channel:b", "channel:zzz"])

    expect(logins(result.channels).sort()).toEqual(["a", "b", "c", "d"])
    expect(result.layout.splits.map((split) => split.id)).toEqual(["s1"])
    expect(result.layout.sidebarOrder).toEqual([
      "channel:b",
      "split:s1",
      "channel:a",
    ])
  })

  test("ignores duplicate keys", () => {
    const config = makeConfig({ channels: ["a", "b"] })
    const result = applySidebarOrder(config, [
      "channel:b",
      "channel:b",
      "channel:a",
    ])

    expect(logins(result.channels)).toEqual(["b", "a"])
    expect(result.layout.sidebarOrder).toEqual(["channel:b", "channel:a"])
  })
})

describe("order list helpers", () => {
  test("removeKeysFromSidebarOrder drops only the given keys", () => {
    expect(
      removeKeysFromSidebarOrder(["a", "b", "c", "b"], ["b", "zzz"])
    ).toEqual(["a", "c"])
  })

  test("reorderSidebarItemIds moves an item onto another's position", () => {
    const order = ["a", "b", "c", "d"]

    expect(reorderSidebarItemIds(order, "a", "c")).toEqual(["b", "c", "a", "d"])
    expect(reorderSidebarItemIds(order, "d", "b")).toEqual(["a", "d", "b", "c"])
    expect(reorderSidebarItemIds(order, "x", "b")).toBe(order)
  })

  test("appendChannelToSidebarOrder appends once", () => {
    const order = ["channel:a"]

    expect(appendChannelToSidebarOrder(order, "#B")).toEqual([
      "channel:a",
      "channel:b",
    ])
    expect(appendChannelToSidebarOrder(order, "A")).toBe(order)
  })

  test("replaceChannelsWithSplitInOrder puts the split where its first channel was", () => {
    expect(
      replaceChannelsWithSplitInOrder(
        ["channel:a", "channel:b", "channel:c", "channel:d"],
        "s1",
        ["d", "b"]
      )
    ).toEqual(["channel:a", "split:s1", "channel:c"])
  })

  test("replaceChannelsWithSplitInOrder keeps or appends the split when channels are absent", () => {
    expect(
      replaceChannelsWithSplitInOrder(
        ["channel:a", "split:s1", "channel:b"],
        "s1",
        ["x"]
      )
    ).toEqual(["channel:a", "split:s1", "channel:b"])
    expect(replaceChannelsWithSplitInOrder(["channel:a"], "s1", ["x"])).toEqual(
      ["channel:a", "split:s1"]
    )
  })

  test("replaceChannelsWithSplitInOrder moves an existing split rather than duplicating it", () => {
    expect(
      replaceChannelsWithSplitInOrder(
        ["split:s1", "channel:a", "channel:b"],
        "s1",
        ["b"]
      )
    ).toEqual(["channel:a", "split:s1"])
  })
})

describe("wasRemovedChannelInView", () => {
  test("checks the active split when split view is active", () => {
    const config = makeConfig({
      channels: ["a", "b", "c"],
      splits: [createChatSplit(["a", "b"], "s1")],
      activeSplitId: "s1",
      activeChannelLogin: "a",
    })

    expect(wasRemovedChannelInView(config, "b")).toBe(true)
    expect(wasRemovedChannelInView(config, "c")).toBe(false)
  })

  test("checks the active channel otherwise", () => {
    const config = makeConfig({
      channels: ["a", "b"],
      activeChannelLogin: "#A",
    })

    expect(wasRemovedChannelInView(config, "a")).toBe(true)
    expect(wasRemovedChannelInView(config, "b")).toBe(false)
  })
})

describe("resolveFocusAfterChannelRemoval", () => {
  function removeChannel(config: AppConfig, login: string) {
    const remaining = config.twitch.channels.filter(
      (channel) => channel.login !== login
    )
    const splits = config.layout.splits
      .map((split) => ({
        ...split,
        channels: split.channels.filter((entry) => entry !== login),
      }))
      .filter((split) => split.channels.length >= 2)
    const nextConfig: AppConfig = {
      ...config,
      twitch: { ...config.twitch, channels: remaining },
      layout: { ...config.layout, splits },
    }
    return resolveFocusAfterChannelRemoval(config, login, {
      channels: remaining,
      splits,
      sidebarOrder: normalizeSidebarOrder(nextConfig),
    })
  }

  test("focuses the previous sidebar item when the active channel is removed", () => {
    const config = makeConfig({
      channels: ["a", "b", "c"],
      activeChannelLogin: "b",
    })

    expect(removeChannel(config, "b")).toEqual({
      activeChannelLogin: "a",
      activeSplitId: null,
    })
  })

  test("focuses the next item when the first one is removed", () => {
    const config = makeConfig({
      channels: ["a", "b", "c"],
      activeChannelLogin: "a",
    })

    expect(removeChannel(config, "a")).toEqual({
      activeChannelLogin: "b",
      activeSplitId: null,
    })
  })

  test("focuses a preceding split by its first channel", () => {
    const config = makeConfig({
      channels: ["a", "b", "c"],
      splits: [createChatSplit(["a", "b"], "s1")],
      activeChannelLogin: "c",
    })

    expect(removeChannel(config, "c")).toEqual({
      activeChannelLogin: "a",
      activeSplitId: "s1",
    })
  })

  test("clears focus when the last channel is removed", () => {
    const config = makeConfig({ channels: ["a"], activeChannelLogin: "a" })

    expect(removeChannel(config, "a")).toEqual({
      activeChannelLogin: "",
      activeSplitId: null,
    })
  })

  test("keeps the current channel when a background channel is removed", () => {
    const config = makeConfig({
      channels: ["a", "b", "c"],
      activeChannelLogin: "c",
    })

    expect(removeChannel(config, "a")).toEqual({
      activeChannelLogin: "c",
      activeSplitId: null,
    })
  })

  test("keeps the active split when an unrelated channel is removed", () => {
    const config = makeConfig({
      channels: ["a", "b", "c", "d"],
      splits: [createChatSplit(["a", "b", "c"], "s1")],
      activeSplitId: "s1",
      activeChannelLogin: "b",
    })

    expect(removeChannel(config, "d")).toEqual({
      activeChannelLogin: "b",
      activeSplitId: "s1",
    })
  })
})
