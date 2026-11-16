import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  setSystemTime,
  spyOn,
  test,
} from "bun:test"

import {
  RcwMembersApiError,
  fetchRcwMemberAssignments,
  fetchRcwMemberBadgeDefinitions,
} from "@/lib/rcw/rcw-members-api"

const BADGES_KEY = "peepochat::rcw::member-badges"
const MEMBERS_KEY = "peepochat::rcw::member-list"
const NOW = new Date("2026-05-01T12:00:00.000Z")
const HOUR = 60 * 60 * 1000

const badges = [
  { id: 1, name: "OG", description: "Early", image: "https://x/1.png" },
]
const members = [{ userId: "42", badge: "1" }]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function mockFetch(...responses: Response[]) {
  const fetchMock = spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Unexpected fetch")
  )
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(response)
  }
  return fetchMock
}

function cacheAt(key: string, data: unknown, cachedAt: Date) {
  window.localStorage.setItem(
    key,
    JSON.stringify({ cachedAt: cachedAt.toISOString(), data })
  )
}

beforeEach(() => {
  setSystemTime(NOW)
})

afterEach(() => {
  mock.restore()
  setSystemTime()
})

describe("fetchRcwMemberBadgeDefinitions", () => {
  test("fetches and caches badge definitions", async () => {
    const fetchMock = mockFetch(jsonResponse(badges))

    expect(await fetchRcwMemberBadgeDefinitions()).toEqual(badges)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://api.rcw.lol/members/badges"
    )
    expect(JSON.parse(window.localStorage.getItem(BADGES_KEY) ?? "")).toEqual({
      cachedAt: NOW.toISOString(),
      data: badges,
    })

    expect(await fetchRcwMemberBadgeDefinitions()).toEqual(badges)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test("uses the cache for 24 hours", async () => {
    const fetchMock = mockFetch(jsonResponse([]))
    cacheAt(BADGES_KEY, badges, new Date(NOW.getTime() - 23 * HOUR))

    expect(await fetchRcwMemberBadgeDefinitions()).toEqual(badges)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("refetches once the cache has expired", async () => {
    const fetchMock = mockFetch(jsonResponse([]))
    cacheAt(BADGES_KEY, badges, new Date(NOW.getTime() - 25 * HOUR))

    expect(await fetchRcwMemberBadgeDefinitions()).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test("force bypasses a fresh cache", async () => {
    const fetchMock = mockFetch(jsonResponse([]))
    cacheAt(BADGES_KEY, badges, NOW)

    expect(await fetchRcwMemberBadgeDefinitions(true)).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test.each([
    ["{corrupt"],
    [JSON.stringify({ cachedAt: "not a date", data: badges })],
  ])("ignores an unreadable cache entry %p", async (raw) => {
    const fetchMock = mockFetch(jsonResponse(badges))
    window.localStorage.setItem(BADGES_KEY, raw)

    expect(await fetchRcwMemberBadgeDefinitions()).toEqual(badges)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test("throws with the status and leaves the cache untouched on failure", async () => {
    mockFetch(jsonResponse({}, 503))
    const error = await fetchRcwMemberBadgeDefinitions().catch(
      (caught: unknown) => caught
    )

    expect(error).toBeInstanceOf(RcwMembersApiError)
    expect((error as RcwMembersApiError).status).toBe(503)
    expect(window.localStorage.getItem(BADGES_KEY)).toBeNull()
  })
})

describe("fetchRcwMemberAssignments", () => {
  test("caches the member list for 15 minutes", async () => {
    const fetchMock = mockFetch(jsonResponse(members), jsonResponse([]))

    expect(await fetchRcwMemberAssignments()).toEqual(members)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://api.rcw.lol/members/list"
    )
    expect(JSON.parse(window.localStorage.getItem(MEMBERS_KEY) ?? "")).toEqual({
      cachedAt: NOW.toISOString(),
      data: members,
    })

    setSystemTime(new Date(NOW.getTime() + 14 * 60 * 1000))
    expect(await fetchRcwMemberAssignments()).toEqual(members)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    setSystemTime(new Date(NOW.getTime() + 16 * 60 * 1000))
    expect(await fetchRcwMemberAssignments()).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test("throws RcwMembersApiError on failure", async () => {
    mockFetch(jsonResponse({}, 500))
    await expect(fetchRcwMemberAssignments()).rejects.toThrow(
      RcwMembersApiError
    )
  })
})
