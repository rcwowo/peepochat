import { describe, expect, test } from "bun:test"

import {
  buildMemberBadgeCatalog,
  buildMemberBadgeIndex,
  resolveMemberBadge,
} from "@/lib/rcw/badges"

const catalog = buildMemberBadgeCatalog([
  {
    id: 1,
    name: "OG",
    description: "Early supporter",
    image: "https://x/1.png",
  },
  { id: 2, name: "Dev", description: "Developer", image: "https://x/2.png" },
])

describe("member badges", () => {
  test("builds a catalog keyed by numeric id", () => {
    expect(catalog.get(1)).toEqual({
      id: "1",
      title: "OG",
      description: "Early supporter",
      imageUrl: "https://x/1.png",
    })
    expect(catalog.size).toBe(2)
  })

  test("indexes assignments and skips missing, invalid or unknown badges", () => {
    const index = buildMemberBadgeIndex(
      [
        { userId: "a", badge: "1" },
        { userId: "b", badge: "2" },
        { userId: "c", badge: null },
        { userId: "d", badge: "abc" },
        { userId: "e", badge: "99" },
      ],
      catalog
    )

    expect([...index.keys()]).toEqual(["a", "b"])
    expect(resolveMemberBadge("b", index)?.title).toBe("Dev")
    expect(resolveMemberBadge("c", index)).toBeNull()
    expect(resolveMemberBadge(null, index)).toBeNull()
  })
})
