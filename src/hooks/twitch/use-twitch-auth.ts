import * as React from "react"
import { toast } from "sonner"

import type { AppConfig, TwitchAccount } from "@/lib/peepochat/peepochat-config"
import { getAccount } from "@/lib/peepochat/peepochat-config"
import { fetchIvrTwitchUserProfile } from "@/lib/ivr/ivr-api"
import {
  TwitchApiError,
  fetchTwitchUser,
  revokeTwitchToken,
  validateTwitchToken,
} from "@/lib/twitch/auth/api"
import {
  clearTwitchOAuthCallbackUrl,
  consumeTwitchOAuthReturnPath,
  consumeTwitchOAuthState,
  formatTwitchOAuthError,
  getTwitchOAuthCallbackInput,
  getTwitchOAuthCallbackParams,
  getTwitchClientId,
  hasRequiredTwitchOAuthScopes,
  hasTwitchOAuthCallback,
  isTwitchOAuthConfigured,
  parseTwitchOAuthCallback,
  startTwitchOAuthLogin,
} from "@/lib/twitch/auth/oauth"

const SESSION_CHECK_INTERVAL_MS = 5 * 60 * 1000
const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000
const TOKEN_EXPIRY_UPDATE_TOLERANCE_MS = 5 * 60 * 1000

export function useTwitchAuth({
  config,
  updateConfig,
}: {
  config: AppConfig
  updateConfig: (
    updater: AppConfig | ((current: AppConfig) => AppConfig)
  ) => void
}) {
  const [oauthBusy, setOauthBusy] = React.useState(false)
  const oauthHandledRef = React.useRef(false)
  const sessionCheckInFlightRef = React.useRef(false)

  const account = React.useMemo(() => {
    const stored = getAccount(config)
    if (!stored || stored.accessToken.trim().length === 0) {
      return null
    }
    return stored
  }, [config])

  const [expiredToken, setExpiredToken] = React.useState<string | null>(null)
  const sessionExpired =
    expiredToken !== null && account?.accessToken === expiredToken
  const sessionExpiredRef = React.useRef(sessionExpired)
  const accountRef = React.useRef(account)
  React.useEffect(() => {
    accountRef.current = account
    sessionExpiredRef.current = sessionExpired
  }, [account, sessionExpired])

  const revokeAccountToken = React.useCallback(() => {
    const current = accountRef.current
    if (!current) {
      return
    }

    void revokeTwitchToken(current.accessToken, current.clientId)
  }, [])

  const clearAccount = React.useCallback(() => {
    updateConfig((current) => {
      if (!current.twitch.account) {
        return current
      }
      return {
        ...current,
        twitch: {
          ...current.twitch,
          account: null,
        },
      }
    })
  }, [updateConfig])

  const login = React.useCallback(() => {
    if (!isTwitchOAuthConfigured()) {
      toast.error("Set VITE_TWITCH_CLIENT_ID to enable Twitch login.")
      return
    }

    startTwitchOAuthLogin()
  }, [])

  const markSessionExpired = React.useCallback(() => {
    if (sessionExpiredRef.current) {
      return
    }
    const token = accountRef.current?.accessToken?.trim()
    if (!token) {
      return
    }

    sessionExpiredRef.current = true
    setExpiredToken(token)
    toast.error(
      "Your session has expired, please log back in to send messages.",
      {
        id: "twitch-session-expired",
        duration: Infinity,
        action: {
          label: "Log back in",
          onClick: () => login(),
        },
      }
    )
  }, [login])

  const invalidateSession = React.useCallback(
    (reason: "expired" | "scopes") => {
      if (reason !== "scopes") {
        markSessionExpired()
        return
      }

      clearAccount()
      revokeAccountToken()
      toast.error(
        "Required Twitch permissions were updated. Please sign in again to continue.",
        { id: "twitch-session-relogin" }
      )
    },
    [clearAccount, markSessionExpired, revokeAccountToken]
  )

  const setAccountFromToken = React.useCallback(
    async (accessToken: string) => {
      const clientId = getTwitchClientId()
      if (!clientId) {
        throw new Error(
          "Twitch Client ID is not configured. Set VITE_TWITCH_CLIENT_ID."
        )
      }

      const validated = await validateTwitchToken(accessToken)
      if (validated.clientId !== clientId) {
        throw new Error(
          "This token was issued for a different Twitch application."
        )
      }

      if (!hasRequiredTwitchOAuthScopes(validated.scopes)) {
        throw new Error(
          "Something went wrong during the login process. Please try signing in again."
        )
      }

      const user = await fetchTwitchUser(accessToken, clientId)
      const ivrProfile = await fetchIvrTwitchUserProfile({
        userLogin: user.login,
      }).catch(() => null)
      const nextAccount: TwitchAccount = {
        id: user.id,
        login: user.login,
        displayName: user.displayName,
        profileImageUrl: user.profileImageUrl,
        bannerImageUrl: ivrProfile?.bannerImageUrl ?? "",
        accessToken,
        clientId,
        scopes: validated.scopes,
        accessTokenExpiresAt: Date.now() + validated.expiresIn * 1000,
      }

      updateConfig((current) => ({
        ...current,
        twitch: {
          ...current.twitch,
          account: nextAccount,
        },
      }))

      return nextAccount
    },
    [updateConfig]
  )

  const verifyStoredSession = React.useCallback(
    async (current: TwitchAccount) => {
      if (sessionCheckInFlightRef.current || sessionExpiredRef.current) {
        return
      }
      sessionCheckInFlightRef.current = true
      try {
        const expiresAt = current.accessTokenExpiresAt
        if (
          typeof expiresAt === "number" &&
          Date.now() >= expiresAt - TOKEN_EXPIRY_BUFFER_MS
        ) {
          invalidateSession("expired")
          return
        }

        if (!hasRequiredTwitchOAuthScopes(current.scopes)) {
          invalidateSession("scopes")
          return
        }

        const validationStartedAt = Date.now()
        const validated = await validateTwitchToken(current.accessToken)
        if (validated.clientId !== current.clientId) {
          invalidateSession("expired")
          return
        }

        if (!hasRequiredTwitchOAuthScopes(validated.scopes)) {
          invalidateSession("scopes")
          return
        }

        const scopesChanged =
          validated.scopes.length !== current.scopes.length ||
          validated.scopes.some((scope) => !current.scopes.includes(scope))

        const validatedLogin = validated.login.trim().toLowerCase()
        const loginChanged =
          validatedLogin.length > 0 &&
          validatedLogin !== current.login.trim().toLowerCase()

        const nextExpiresAt = validationStartedAt + validated.expiresIn * 1000
        const storedExpiresAt = current.accessTokenExpiresAt
        const expiryChanged =
          typeof storedExpiresAt !== "number" ||
          Math.abs(nextExpiresAt - storedExpiresAt) >
            TOKEN_EXPIRY_UPDATE_TOLERANCE_MS

        if (scopesChanged || loginChanged || expiryChanged) {
          updateConfig((configValue) => {
            const existing = configValue.twitch.account
            if (!existing || existing.accessToken !== current.accessToken) {
              return configValue
            }
            return {
              ...configValue,
              twitch: {
                ...configValue.twitch,
                account: {
                  ...existing,
                  login: loginChanged ? validated.login : existing.login,
                  scopes: scopesChanged ? validated.scopes : existing.scopes,
                  accessTokenExpiresAt: nextExpiresAt,
                },
              },
            }
          })
        }
      } catch (error) {
        if (error instanceof TwitchApiError && error.status === 401) {
          invalidateSession("expired")
          return
        }
        if (
          error instanceof Error &&
          /invalid or expired/i.test(error.message)
        ) {
          invalidateSession("expired")
        }
      } finally {
        sessionCheckInFlightRef.current = false
      }
    },
    [invalidateSession, updateConfig]
  )

  React.useEffect(() => {
    if (oauthHandledRef.current || typeof window === "undefined") {
      return
    }

    if (!hasTwitchOAuthCallback()) {
      return
    }

    const callbackInput = getTwitchOAuthCallbackInput()
    const callbackParams = getTwitchOAuthCallbackParams()
    if (!callbackInput || !callbackParams) {
      return
    }

    oauthHandledRef.current = true
    queueMicrotask(() => setOauthBusy(true))

    const returnedState = callbackParams.get("state")

    void (async () => {
      try {
        if (!consumeTwitchOAuthState(returnedState)) {
          throw new Error("OAuth state mismatch. Please try signing in again.")
        }

        const parsed = parseTwitchOAuthCallback(callbackInput)
        if (!parsed) {
          throw new Error("No Twitch login response was found.")
        }

        if ("error" in parsed) {
          throw new Error(formatTwitchOAuthError(parsed))
        }

        await setAccountFromToken(parsed.accessToken)
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Twitch login failed"
        )
      } finally {
        clearTwitchOAuthCallbackUrl()
        const returnPath = consumeTwitchOAuthReturnPath()
        const currentPath = `${window.location.pathname}${window.location.search}`
        if (returnPath && returnPath !== currentPath) {
          window.history.replaceState(null, "", returnPath)
        }
        setOauthBusy(false)
      }
    })()
  }, [setAccountFromToken])

  React.useEffect(() => {
    if (!account || sessionExpired || hasTwitchOAuthCallback()) {
      return
    }

    void verifyStoredSession(account)

    const intervalId = window.setInterval(() => {
      void verifyStoredSession(account)
    }, SESSION_CHECK_INTERVAL_MS)

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void verifyStoredSession(account)
      }
    }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [account, sessionExpired, verifyStoredSession])

  React.useEffect(() => {
    if (!sessionExpired) {
      toast.dismiss("twitch-session-expired")
    }
  }, [sessionExpired])

  const logout = React.useCallback(() => {
    clearAccount()
    revokeAccountToken()
  }, [clearAccount, revokeAccountToken])

  return {
    account,
    oauthBusy,
    login,
    logout,
    invalidateSession,
    sessionExpired,
    isOAuthConfigured: isTwitchOAuthConfigured(),
  }
}
