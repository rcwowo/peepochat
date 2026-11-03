import { getTwitchOAuthCallbackParams } from "@/lib/twitch/auth/oauth"

const POCKET_STATE_PREFIX = "pocket-"
const POCKET_CALLBACK_URL = "peepochat://oauth"

const POCKET_CALLBACK_PARAM_KEYS = [
  "access_token",
  "scope",
  "token_type",
  "expires_in",
  "state",
  "error",
  "error_description",
] as const

export type PocketHandoff = {
  url: string
  failed: boolean
}

export function getPocketHandoff(): PocketHandoff | null {
  const params = getTwitchOAuthCallbackParams()
  const state = params?.get("state")
  if (!params || !state?.startsWith(POCKET_STATE_PREFIX)) {
    return null
  }

  const forwarded = new URLSearchParams()
  for (const key of POCKET_CALLBACK_PARAM_KEYS) {
    const value = params.get(key)
    if (value !== null) {
      forwarded.set(key, value)
    }
  }

  return {
    url: `${POCKET_CALLBACK_URL}?${forwarded.toString()}`,
    failed: !params.get("access_token"),
  }
}
