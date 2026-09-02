import { describe, expect, test } from "bun:test"

import {
  applyEnsureRooms,
  applyRoomUpdate,
  computeRoomIdsKey,
} from "../src/hooks/twitch/chat/use-room-store"
import { createEmptyRoom } from "../src/lib/twitch/chat-timeline"

describe("applyEnsureRooms", () => {
  test("creates missing rooms without copying existing ones", () => {
    const existing = createEmptyRoom("foo")
    const current = { foo: existing }

    const next = applyEnsureRooms(current, ["foo", "bar"])

    expect(next).not.toBe(current)
    expect(next.foo).toBe(existing)
    expect(next.bar?.login).toBe("bar")
  })

  test("returns the same object when every room is already ensured", () => {
    const foo = createEmptyRoom("foo")
    const current = { foo }

    expect(applyEnsureRooms(current, ["foo"])).toBe(current)
  })

  test("only copies rooms whose joining flag is stale", () => {
    const joining = createEmptyRoom("joining")
    const joined = {
      ...createEmptyRoom("joined"),
      joined: true,
      joining: true,
    }
    const current = { joining, joined }

    const next = applyEnsureRooms(current, ["joining", "joined"])

    expect(next).not.toBe(current)
    expect(next.joining).toBe(joining)
    expect(next.joined).not.toBe(joined)
    expect(next.joined?.joining).toBe(false)
  })
})

describe("applyRoomUpdate", () => {
  test("returns the same rooms object when the updater returns the same room", () => {
    const foo = createEmptyRoom("foo")
    const current = { foo }

    const next = applyRoomUpdate(current, "foo", (room) => room)

    expect(next).toBe(current)
    expect(next.foo).toBe(foo)
  })

  test("copies rooms when the updater returns a new room", () => {
    const foo = createEmptyRoom("foo")
    const current = { foo }

    const next = applyRoomUpdate(current, "foo", (room) => ({
      ...room,
      roomId: "123",
    }))

    expect(next).not.toBe(current)
    expect(next.foo).not.toBe(foo)
    expect(next.foo.roomId).toBe("123")
  })
})

describe("computeRoomIdsKey", () => {
  test("ignores timeline identity and tracks room ids", () => {
    const foo = { ...createEmptyRoom("foo"), roomId: "1" }
    const bar = createEmptyRoom("bar")

    expect(computeRoomIdsKey({ foo, bar })).toBe("bar:|foo:1")
    expect(
      computeRoomIdsKey({
        foo: { ...foo, timeline: [] },
        bar,
      })
    ).toBe("bar:|foo:1")
  })
})
