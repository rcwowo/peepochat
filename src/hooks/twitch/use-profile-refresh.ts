import * as React from "react"

import type { AppConfig, TwitchAccount } from "@/lib/peepochat/peepochat-config"
import {
  applyAccountBanner,
  applyProfileRefresh,
  fetchAccountBannerImageUrl,
  fetchProfileRefresh,
} from "@/lib/twitch/channel/profile-refresh"

const RETRY_BASE_MS = 5_000
const RETRY_MAX_MS = 5 * 60_000

export function useProfileRefresh({
  account,
  channelLogins,
  updateConfig,
}: {
  account: TwitchAccount | null
  channelLogins: string[]
  updateConfig: (
    updater: AppConfig | ((current: AppConfig) => AppConfig)
  ) => void
}) {
  const channelLoginsRef = React.useRef(channelLogins)
  React.useEffect(() => {
    channelLoginsRef.current = channelLogins
  }, [channelLogins])

  const refreshedTokenRef = React.useRef<string | null>(null)
  const accessToken = account?.accessToken ?? null
  const clientId = account?.clientId ?? null

  React.useEffect(() => {
    if (!accessToken || !clientId) {
      return
    }
    if (refreshedTokenRef.current === accessToken) {
      return
    }

    const auth = { accessToken, clientId }
    const matchesSession = (current: AppConfig) =>
      current.twitch.account?.accessToken === accessToken
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let failures = 0

    const run = async (includeAccount: boolean, logins: string[]) => {
      timer = null
      const outcome = await fetchProfileRefresh(auth, {
        includeAccount,
        channelLogins: logins,
      })
      if (cancelled) {
        return
      }

      updateConfig((current) =>
        matchesSession(current)
          ? applyProfileRefresh(current, outcome.refresh)
          : current
      )

      const refreshedAccount = outcome.refresh.account
      if (refreshedAccount) {
        void fetchAccountBannerImageUrl(refreshedAccount.login).then(
          (bannerImageUrl) => {
            if (cancelled) {
              return
            }
            updateConfig((current) =>
              matchesSession(current)
                ? applyAccountBanner(
                    current,
                    refreshedAccount.id,
                    bannerImageUrl
                  )
                : current
            )
          }
        )
      }

      if (
        outcome.unauthorized ||
        (!outcome.retryAccount && outcome.retryLogins.length === 0)
      ) {
        refreshedTokenRef.current = accessToken
        return
      }

      const delay = Math.min(RETRY_BASE_MS * 2 ** failures, RETRY_MAX_MS)
      failures += 1
      timer = setTimeout(() => {
        void run(outcome.retryAccount, outcome.retryLogins)
      }, delay)
    }

    timer = setTimeout(() => {
      void run(true, channelLoginsRef.current)
    }, 0)

    return () => {
      cancelled = true
      if (timer !== null) {
        clearTimeout(timer)
      }
    }
  }, [accessToken, clientId, updateConfig])
}
