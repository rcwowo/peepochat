import * as React from "react"
import { useLocation, useNavigate } from "react-router-dom"

import { hasTwitchOAuthCallback } from "@/lib/twitch/twitch-oauth"

export function OAuthCallbackRedirect() {
  const location = useLocation()
  const navigate = useNavigate()

  React.useEffect(() => {
    if (!hasTwitchOAuthCallback()) {
      return
    }

    if (location.pathname.startsWith("/app")) {
      return
    }

    navigate(`/app${location.search}${location.hash}`, { replace: true })
  }, [location.hash, location.pathname, location.search, navigate])

  return null
}
