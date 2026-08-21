import { useResolvedUsernameColor } from "@/hooks/chat-ui/use-resolved-username-color"

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
      {displayName}
    </span>
  )
}
