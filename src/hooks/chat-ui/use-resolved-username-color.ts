import { getReadableUsernameColor } from "@/lib/chat/chat-username"

import { useChatterByLogin } from "@/hooks/chat-ui/use-chatter-by-login"

function normalizeLogin(
  userName: string | null | undefined
): string | undefined {
  const normalized = userName?.replace(/^@/, "").trim().toLowerCase()
  return normalized || undefined
}

export function useResolvedUsernameColor({
  channelLogin,
  userName,
  color,
}: {
  channelLogin?: string | null
  userName?: string | null
  color?: string | null
}): string | undefined {
  const hasColor = Boolean(color)
  const login = hasColor ? undefined : normalizeLogin(userName)
  const chatter = useChatterByLogin(channelLogin ?? undefined, login)
  return getReadableUsernameColor(color ?? chatter?.color ?? null)
}
