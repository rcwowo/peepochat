import { describe, expect, test } from "bun:test"

import { isPrivilegedChannelSender } from "@/lib/chat/send/send"

const NO_ROLES = { isBroadcaster: false, isModerator: false, isVip: false }

describe("isPrivilegedChannelSender", () => {
  test("treats the channel owner as privileged regardless of self state", () => {
    expect(isPrivilegedChannelSender("#SomeRoom", "someroom", null)).toBe(true)
    expect(isPrivilegedChannelSender("someroom", " SomeRoom ", NO_ROLES)).toBe(
      true
    )
  })

  test("grants privileges to broadcasters, moderators and VIPs", () => {
    for (const role of ["isBroadcaster", "isModerator", "isVip"] as const) {
      expect(
        isPrivilegedChannelSender("room", "viewer", {
          ...NO_ROLES,
          [role]: true,
        })
      ).toBe(true)
    }
  })

  test("treats regular and anonymous users as unprivileged", () => {
    expect(isPrivilegedChannelSender("room", "viewer", NO_ROLES)).toBe(false)
    expect(isPrivilegedChannelSender("room", null, null)).toBe(false)
    expect(isPrivilegedChannelSender("", "", null)).toBe(false)
  })
})
