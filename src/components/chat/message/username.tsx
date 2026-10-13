import { useResolvedUsernameColor } from "@/hooks/chat-ui/use-resolved-username-color"
import { useNicknameForLogin } from "@/hooks/chat-ui/use-nickname-for-login"

export function ChatUsername({
  displayName,
  color,
  channelLogin,
  userName,
  className = "font-semibold",
}: {
  displayName: string
  color?: string | null
  channelLogin?: string
  userName?: string | null
  className?: string
}) {
  const nickname = useNicknameForLogin(userName)
  const readableColor = useResolvedUsernameColor({
    channelLogin,
    userName,
    color,
  })

  return (
    <span
      className={className}
      style={readableColor ? { color: readableColor } : undefined}
    >
      {nickname ?? displayName}
    </span>
  )
}
