import * as React from "react"
import { toast } from "sonner"

import type { AppConfig, TwitchAccount } from "@/lib/peepochat-config"
import { getAccount } from "@/lib/peepochat-config"
import { fetchTwitchUser, validateTwitchToken } from "@/lib/twitch-api"
import {
  clearTwitchOAuthCallbackUrl,
  consumeTwitchOAuthReturnPath,
  consumeTwitchOAuthState,
  formatTwitchOAuthError,
  getTwitchOAuthCallbackInput,
  getTwitchOAuthCallbackParams,
  getTwitchClientId,
  hasTwitchOAuthCallback,
  isTwitchOAuthConfigured,
  parseTwitchOAuthCallback,
  startTwitchOAuthLogin,
} from "@/lib/twitch-oauth"

export function useTwitchAuth({
  config,
  updateConfig,
}: {
  config: AppConfig
  updateConfig: (updater: AppConfig | ((current: AppConfig) => AppConfig)) => void
}) {
  const [oauthBusy, setOauthBusy] = React.useState(false)
  const oauthHandledRef = React.useRef(false)

  const account = React.useMemo(() => getAccount(config), [config])

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
        throw new Error("This token was issued for a different Twitch application.")
      }

      const user = await fetchTwitchUser(accessToken, clientId)
      const nextAccount: TwitchAccount = {
        id: user.id,
        login: user.login,
        displayName: user.displayName,
        profileImageUrl: user.profileImageUrl,
        bannerImageUrl: user.bannerImageUrl,
        accessToken,
        clientId,
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
    setOauthBusy(true)

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

  const login = React.useCallback(() => {
    if (!isTwitchOAuthConfigured()) {
      toast.error("Set VITE_TWITCH_CLIENT_ID to enable Twitch login.")
      return
    }

    startTwitchOAuthLogin()
  }, [])

  const logout = React.useCallback(() => {
    updateConfig((current) => ({
      ...current,
      twitch: {
        ...current.twitch,
        account: null,
      },
    }))
  }, [updateConfig])

  return {
    account,
    oauthBusy,
    login,
    logout,
    isOAuthConfigured: isTwitchOAuthConfigured(),
  }
}
