import { afterEach, describe, expect, test } from "bun:test"

import {
  TWITCH_OAUTH_RETURN_KEY,
  TWITCH_OAUTH_SCOPES,
  TWITCH_OAUTH_STATE_KEY,
  buildTwitchAuthorizeUrl,
  clearTwitchOAuthCallbackUrl,
  consumeTwitchOAuthReturnPath,
  consumeTwitchOAuthState,
  formatTwitchOAuthError,
  getMissingTwitchOAuthScopes,
  getTwitchOAuthCallbackInput,
  getTwitchRedirectUri,
  hasRequiredTwitchOAuthScopes,
  parseTwitchOAuthCallback,
} from "@/lib/twitch/auth/oauth"

function navigate(path: string) {
  window.history.replaceState(null, "", path)
}

afterEach(() => {
  navigate("/")
})

describe("parseTwitchOAuthCallback", () => {
  test("parses a successful implicit-grant hash", () => {
    expect(
      parseTwitchOAuthCallback(
        "#access_token=abc123&expires_in=14400&scope=chat%3Aread+chat%3Aedit&state=s&token_type=bearer"
      )
    ).toEqual({
      accessToken: "abc123",
      expiresIn: 14400,
      scope: ["chat:read", "chat:edit"],
      tokenType: "bearer",
    })
  })

  test("handles missing or invalid optional fields", () => {
    expect(
      parseTwitchOAuthCallback("access_token=abc&expires_in=soon")
    ).toEqual({
      accessToken: "abc",
      expiresIn: null,
      scope: [],
      tokenType: "bearer",
    })
  })

  test("returns the error from a query string callback", () => {
    expect(
      parseTwitchOAuthCallback(
        "?error=access_denied&error_description=The+user+denied+you+access"
      )
    ).toEqual({
      error: "access_denied",
      errorDescription: "The user denied you access",
    })
  })

  test("prefers the error when both an error and a token are present", () => {
    expect(
      parseTwitchOAuthCallback("#access_token=abc&error=server_error")
    ).toEqual({ error: "server_error", errorDescription: null })
  })

  test.each([[""], ["#"], ["#state=only"], ["#access_token="], ["no-equals"]])(
    "returns null for %p",
    (input) => {
      expect(parseTwitchOAuthCallback(input)).toBeNull()
    }
  )
})

describe("formatTwitchOAuthError", () => {
  test("prefers the description, then the code", () => {
    expect(
      formatTwitchOAuthError({
        error: "access_denied",
        errorDescription: "Denied",
      })
    ).toBe("Denied")
    expect(
      formatTwitchOAuthError({ error: "access_denied", errorDescription: null })
    ).toBe("access_denied")
  })

  test("explains redirect mismatches using the active redirect URI", () => {
    const message = formatTwitchOAuthError({
      error: "redirect_mismatch",
      errorDescription: null,
    })
    expect(message).toContain(`"${getTwitchRedirectUri()}"`)
  })
})

describe("OAuth state", () => {
  test("buildTwitchAuthorizeUrl stores a state that validates exactly once", () => {
    navigate("/app/settings?tab=chat")
    const url = new URL(buildTwitchAuthorizeUrl("my-client"))

    expect(url.origin + url.pathname).toBe(
      "https://id.twitch.tv/oauth2/authorize"
    )
    expect(url.searchParams.get("client_id")).toBe("my-client")
    expect(url.searchParams.get("response_type")).toBe("token")
    expect(url.searchParams.get("redirect_uri")).toBe(getTwitchRedirectUri())
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([
      ...TWITCH_OAUTH_SCOPES,
    ])

    const state = url.searchParams.get("state")
    expect(state).toBeTruthy()
    expect(window.sessionStorage.getItem(TWITCH_OAUTH_STATE_KEY)).toBe(state)
    expect(consumeTwitchOAuthReturnPath()).toBe("/app/settings?tab=chat")

    expect(consumeTwitchOAuthState(state)).toBe(true)
    expect(consumeTwitchOAuthState(state)).toBe(false)
  })

  test("rejects a mismatched or missing state and still clears the stored one", () => {
    window.sessionStorage.setItem(TWITCH_OAUTH_STATE_KEY, "expected")
    expect(consumeTwitchOAuthState("forged")).toBe(false)
    expect(window.sessionStorage.getItem(TWITCH_OAUTH_STATE_KEY)).toBeNull()

    expect(consumeTwitchOAuthState(null)).toBe(false)
    expect(consumeTwitchOAuthState("anything")).toBe(false)
  })

  test("return path defaults to /app and is consumed", () => {
    expect(consumeTwitchOAuthReturnPath()).toBe("/app")

    window.sessionStorage.setItem(TWITCH_OAUTH_RETURN_KEY, "/somewhere")
    expect(consumeTwitchOAuthReturnPath()).toBe("/somewhere")
    expect(consumeTwitchOAuthReturnPath()).toBe("/app")
  })
})

describe("scopes", () => {
  test("lists the missing scopes", () => {
    expect(getMissingTwitchOAuthScopes(null)).toEqual([...TWITCH_OAUTH_SCOPES])
    expect(getMissingTwitchOAuthScopes(TWITCH_OAUTH_SCOPES.slice(1))).toEqual([
      TWITCH_OAUTH_SCOPES[0],
    ])
    expect(
      hasRequiredTwitchOAuthScopes([...TWITCH_OAUTH_SCOPES, "extra"])
    ).toBe(true)
    expect(hasRequiredTwitchOAuthScopes([])).toBe(false)
  })
})

describe("callback URL handling", () => {
  test("reads the callback from the hash, then the query string", () => {
    navigate("/app#access_token=abc&state=s")
    expect(getTwitchOAuthCallbackInput()).toBe("#access_token=abc&state=s")

    navigate("/app?error=access_denied&state=s")
    expect(getTwitchOAuthCallbackInput()).toBe("?error=access_denied&state=s")

    navigate("/app?tab=chat#section")
    expect(getTwitchOAuthCallbackInput()).toBeNull()
  })

  test("clears OAuth params but keeps unrelated query params", () => {
    navigate("/app?error=access_denied&state=s&keep=1#access_token=abc")
    clearTwitchOAuthCallbackUrl()

    expect(window.location.pathname).toBe("/app")
    expect(window.location.search).toBe("?keep=1")
    expect(window.location.hash).toBe("")
  })
})
