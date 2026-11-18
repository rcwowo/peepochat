import { describe, expect, test } from "bun:test"

import {
  formatSharedChatParticipantsNotice,
  otherSharedChatParticipants,
  sharedChatNoticeId,
  sharedChatParticipantKey,
  sharedChatSessionsEqual,
  type SharedChatParticipant,
  type SharedChatSession,
} from "@/lib/chat/shared-chat/shared-chat"

function participant(
  userId: string,
  login: string,
  displayName = login
): SharedChatParticipant {
  return { userId, login, displayName }
}

const host = participant("1", "host", "Host")
const guest = participant("2", "guest", "Guest")
const third = participant("3", "third", "ThirdOne")

describe("otherSharedChatParticipants", () => {
  test("removes the current channel", () => {
    expect(otherSharedChatParticipants([host, guest], "1")).toEqual([guest])
  })

  test("keeps everyone when the current id is unknown", () => {
    const participants = [host, guest]
    expect(otherSharedChatParticipants(participants, null)).toBe(participants)
    expect(otherSharedChatParticipants(participants, "  ")).toBe(participants)
  })
})

describe("formatSharedChatParticipantsNotice", () => {
  test("lists the other participants", () => {
    expect(
      formatSharedChatParticipantsNotice([host, guest, third], "1", "active")
    ).toBe("This room is sharing chat with Guest and ThirdOne.")
    expect(
      formatSharedChatParticipantsNotice(
        [host, guest, third, participant("4", "fourth", "Fourth")],
        "1",
        "now"
      )
    ).toBe("This room is now sharing chat with Guest, ThirdOne, and Fourth.")
  })

  test("falls back to the login when the display name is blank", () => {
    expect(
      formatSharedChatParticipantsNotice(
        [host, participant("2", "guest", "   ")],
        "1",
        "active"
      )
    ).toBe("This room is sharing chat with guest.")
  })

  test("returns null when nobody else is in the session", () => {
    expect(formatSharedChatParticipantsNotice([host], "1", "now")).toBeNull()
    expect(
      formatSharedChatParticipantsNotice(
        [host, participant("2", "", "")],
        "1",
        "now"
      )
    ).toBeNull()
  })
})

describe("sharedChatParticipantKey", () => {
  test("is order independent and ignores duplicates and empty ids", () => {
    expect(sharedChatParticipantKey([third, host, guest, host])).toBe("1,2,3")
    expect(sharedChatParticipantKey([participant("", "ghost"), guest])).toBe(
      "2"
    )
  })
})

describe("sharedChatSessionsEqual", () => {
  const session: SharedChatSession = {
    sessionId: "s",
    hostUserId: "1",
    participants: [host, guest],
  }

  test("compares session id and participant set", () => {
    expect(sharedChatSessionsEqual(session, session)).toBe(true)
    expect(
      sharedChatSessionsEqual(session, {
        ...session,
        participants: [{ ...guest, displayName: "Renamed" }, host],
      })
    ).toBe(true)
    expect(
      sharedChatSessionsEqual(session, {
        ...session,
        participants: [host, guest, third],
      })
    ).toBe(false)
    expect(
      sharedChatSessionsEqual(session, { ...session, sessionId: "t" })
    ).toBe(false)
  })

  test("handles missing sessions", () => {
    expect(sharedChatSessionsEqual(null, null)).toBe(true)
    expect(sharedChatSessionsEqual(session, null)).toBe(false)
    expect(sharedChatSessionsEqual(null, session)).toBe(false)
  })
})

describe("sharedChatNoticeId", () => {
  test("normalizes the channel login", () => {
    expect(sharedChatNoticeId(" #Host ", "ended")).toBe(
      "shared-chat:host:ended"
    )
  })
})
