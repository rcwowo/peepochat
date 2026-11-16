import { describe, expect, test } from "bun:test"

import { TWITCH_OAUTH_SCOPES } from "@/lib/twitch/auth/oauth"
import { TWITCH_OAUTH_SCOPE_GROUPS } from "@/lib/twitch/auth/oauth-scopes"

describe("TWITCH_OAUTH_SCOPE_GROUPS", () => {
  const described = TWITCH_OAUTH_SCOPE_GROUPS.flatMap((group) =>
    group.scopes.map((info) => info.scope)
  )

  test("describes every requested scope exactly once", () => {
    expect(new Set(described).size).toBe(described.length)
    expect([...described].sort()).toEqual([...TWITCH_OAUTH_SCOPES].sort())
  })

  test("has unique group ids and non-empty copy", () => {
    const ids = TWITCH_OAUTH_SCOPE_GROUPS.map((group) => group.id)
    expect(new Set(ids).size).toBe(ids.length)

    for (const group of TWITCH_OAUTH_SCOPE_GROUPS) {
      expect(group.title.trim()).not.toBe("")
      expect(group.scopes.length).toBeGreaterThan(0)
      for (const info of group.scopes) {
        expect(info.label.trim()).not.toBe("")
        expect(info.description.trim()).not.toBe("")
      }
    }
  })
})
