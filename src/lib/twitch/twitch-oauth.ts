export const TWITCH_OAUTH_STATE_KEY = "peepochat::twitch_oauth_state"
export const TWITCH_OAUTH_RETURN_KEY = "peepochat::twitch_oauth_return"

const OAUTH_CALLBACK_PARAM_KEYS = [
  "access_token",
  "error",
  "error_description",
  "state",
  "scope",
  "token_type",
  "expires_in",
] as const

/** Scopes for implicit grant (token in redirect fragment). */
export const TWITCH_OAUTH_SCOPES = [
  "user:read:email",
  "user:read:emotes",
  "chat:read",
  "chat:edit",
] as const

export type TwitchOAuthResult = {
  accessToken: string
  expiresIn: number | null
  scope: string[]
  tokenType: string
}

export type TwitchOAuthError = {
  error: string
  errorDescription: string | null
}

export function getTwitchClientId(): string {
  return import.meta.env.VITE_TWITCH_CLIENT_ID?.trim() ?? ""
}

/**
 * Must match a Twitch console OAuth redirect URL exactly (character-for-character).
 * Defaults to `window.location.origin` (e.g. `http://localhost:5173` without a trailing slash).
 * Override with VITE_TWITCH_REDIRECT_URI if your registered URI differs.
 */
export function getTwitchRedirectUri(): string {
  const fromEnv = import.meta.env.VITE_TWITCH_REDIRECT_URI?.trim()
  if (fromEnv) {
    return fromEnv
  }

  if (typeof window === "undefined") {
    return ""
  }

  return window.location.origin
}

export function isTwitchOAuthConfigured(): boolean {
  return getTwitchClientId().length > 0
}

export function buildTwitchAuthorizeUrl(clientId: string): string {
  const state = crypto.randomUUID()
  sessionStorage.setItem(TWITCH_OAUTH_STATE_KEY, state)
  sessionStorage.setItem(
    TWITCH_OAUTH_RETURN_KEY,
    `${window.location.pathname}${window.location.search}`
  )

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getTwitchRedirectUri(),
    response_type: "token",
    scope: TWITCH_OAUTH_SCOPES.join(" "),
    state,
  })

  return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`
}

export function startTwitchOAuthLogin(): void {
  const clientId = getTwitchClientId()
  if (!clientId) {
    throw new Error(
      "Twitch Client ID is not configured. Set VITE_TWITCH_CLIENT_ID in your environment."
    )
  }

  window.location.assign(buildTwitchAuthorizeUrl(clientId))
}

function parseOAuthParams(input: string): URLSearchParams {
  const normalized = input.startsWith("#")
    ? input.slice(1)
    : input.startsWith("?")
      ? input.slice(1)
      : input
  return new URLSearchParams(normalized)
}

/** Implicit-grant success uses the hash; authorize errors often use the query string. */
export function getTwitchOAuthCallbackInput(): string | null {
  if (typeof window === "undefined") {
    return null
  }

  const hash = window.location.hash
  if (hashIncludesOAuthCallback(hash)) {
    return hash
  }

  const search = window.location.search
  if (searchIncludesOAuthCallback(search)) {
    return search
  }

  return null
}

export function hasTwitchOAuthCallback(): boolean {
  return getTwitchOAuthCallbackInput() !== null
}

function hashIncludesOAuthCallback(hash: string): boolean {
  return hash.includes("access_token") || hash.includes("error=")
}

function searchIncludesOAuthCallback(search: string): boolean {
  return search.includes("error=") || search.includes("access_token=")
}

export function getTwitchOAuthCallbackParams(): URLSearchParams | null {
  const input = getTwitchOAuthCallbackInput()
  if (!input) {
    return null
  }

  return parseOAuthParams(input)
}

export function parseTwitchOAuthCallback(
  input: string
): TwitchOAuthResult | TwitchOAuthError | null {
  if (!input || !input.includes("=")) {
    return null
  }

  const params = parseOAuthParams(input)
  const error = params.get("error")
  if (error) {
    return {
      error,
      errorDescription: params.get("error_description"),
    }
  }

  const accessToken = params.get("access_token")
  if (!accessToken) {
    return null
  }

  const expiresRaw = params.get("expires_in")
  const expiresIn = expiresRaw ? Number.parseInt(expiresRaw, 10) : null

  return {
    accessToken,
    expiresIn: Number.isFinite(expiresIn) ? expiresIn : null,
    scope: (params.get("scope") ?? "")
      .split(/[\s+]+/)
      .map((entry) => entry.trim())
      .filter(Boolean),
    tokenType: params.get("token_type") ?? "bearer",
  }
}

export function formatTwitchOAuthError(error: TwitchOAuthError): string {
  if (error.error === "redirect_mismatch") {
    const registered = getTwitchRedirectUri()
    return (
      error.errorDescription ??
      `Redirect URI mismatch. Peepochat is using "${registered}". Add that exact URL in the Twitch Developer Console (OAuth Redirect URLs).`
    )
  }

  return error.errorDescription ?? error.error ?? "Twitch login failed."
}

export function consumeTwitchOAuthState(returnedState: string | null): boolean {
  const expected = sessionStorage.getItem(TWITCH_OAUTH_STATE_KEY)
  sessionStorage.removeItem(TWITCH_OAUTH_STATE_KEY)
  return Boolean(expected && returnedState && expected === returnedState)
}

export function consumeTwitchOAuthReturnPath(): string {
  const path = sessionStorage.getItem(TWITCH_OAUTH_RETURN_KEY) ?? "/"
  sessionStorage.removeItem(TWITCH_OAUTH_RETURN_KEY)
  return path
}

export function clearTwitchOAuthCallbackUrl(): void {
  if (typeof window === "undefined") {
    return
  }

  const url = new URL(window.location.href)
  for (const key of OAUTH_CALLBACK_PARAM_KEYS) {
    url.searchParams.delete(key)
  }
  url.hash = ""

  const next = `${url.pathname}${url.search}`
  window.history.replaceState(null, "", next || "/")
}
