import { afterEach, describe, expect, mock, test } from "bun:test"

import {
  getSharedChatSourceProfile,
  subscribeToSharedChatSourceProfiles,
  upsertSharedChatSourceProfiles,
} from "@/lib/chat/shared-chat/profiles"
import type { SharedChatSourceProfile } from "@/lib/chat/shared-chat/shared-chat"

let nextId = 0
const unsubscribers: Array<() => void> = []

function uniqueId() {
  nextId += 1
  return `profiles-test-${nextId}`
}

function profile(
  userId: string,
  overrides: Partial<SharedChatSourceProfile> = {}
): SharedChatSourceProfile {
  return {
    userId,
    login: "login",
    displayName: "Display",
    profileImageUrl: "https://example.test/avatar.png",
    ...overrides,
  }
}

function subscribe() {
  const listener = mock(() => {})
  unsubscribers.push(subscribeToSharedChatSourceProfiles(listener))
  return listener
}

afterEach(() => {
  for (const unsubscribe of unsubscribers.splice(0)) {
    unsubscribe()
  }
})

describe("shared chat source profiles", () => {
  test("stores profiles and looks them up by trimmed id", () => {
    const id = uniqueId()
    upsertSharedChatSourceProfiles([profile(id)])
    expect(getSharedChatSourceProfile(` ${id} `)).toEqual(profile(id))
  })

  test("returns null for blank or unknown ids", () => {
    expect(getSharedChatSourceProfile(null)).toBeNull()
    expect(getSharedChatSourceProfile("   ")).toBeNull()
    expect(getSharedChatSourceProfile(uniqueId())).toBeNull()
  })

  test("notifies once per batch and skips unchanged profiles", () => {
    const first = uniqueId()
    const second = uniqueId()
    const listener = subscribe()

    upsertSharedChatSourceProfiles([profile(first), profile(second)])
    expect(listener).toHaveBeenCalledTimes(1)

    upsertSharedChatSourceProfiles([profile(first), profile(second)])
    upsertSharedChatSourceProfiles([])
    expect(listener).toHaveBeenCalledTimes(1)

    upsertSharedChatSourceProfiles([
      profile(first),
      profile(second, { displayName: "Changed" }),
    ])
    expect(listener).toHaveBeenCalledTimes(2)
    expect(getSharedChatSourceProfile(second)?.displayName).toBe("Changed")
  })

  test("keeps the previous avatar when an update has none", () => {
    const id = uniqueId()
    upsertSharedChatSourceProfiles([profile(id)])
    upsertSharedChatSourceProfiles([
      profile(id, { login: "renamed", profileImageUrl: "" }),
    ])
    expect(getSharedChatSourceProfile(id)).toEqual(
      profile(id, { login: "renamed" })
    )
  })

  test("stops notifying after unsubscribe", () => {
    const listener = mock(() => {})
    const unsubscribe = subscribeToSharedChatSourceProfiles(listener)
    unsubscribe()
    upsertSharedChatSourceProfiles([profile(uniqueId())])
    expect(listener).not.toHaveBeenCalled()
  })
})
