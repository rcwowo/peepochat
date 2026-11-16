import { describe, expect, test } from "bun:test"

import {
  chatlogsUserUrl,
  twitchViewerCardUrl,
} from "@/lib/chat/moderation/tools"

describe("external moderation tool urls", () => {
  test("builds a Twitch popout viewer card url", () => {
    expect(twitchViewerCardUrl("streamer", "viewer_1")).toBe(
      "https://www.twitch.tv/popout/streamer/viewercard/viewer_1"
    )
  })

  test("encodes path segments", () => {
    const url = new URL(twitchViewerCardUrl("a/b", "日本 語"))
    expect(url.pathname).toBe(
      `/popout/a%2Fb/viewercard/${encodeURIComponent("日本 語")}`
    )
  })

  test("encodes chatlogs query parameters so they round-trip", () => {
    const url = new URL(chatlogsUserUrl("room&x=1", "user#2"))
    expect(url.searchParams.get("channel")).toBe("room&x=1")
    expect(url.searchParams.get("user")).toBe("user#2")
    expect(url.hash).toBe("")
  })
})
