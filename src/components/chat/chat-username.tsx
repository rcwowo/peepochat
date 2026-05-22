import { getReadableUsernameColor } from "@/lib/chat-username"

export function ChatUsername({
  displayName,
  color,
  className = "font-semibold",
}: {
  displayName: string
  color?: string | null
  className?: string
}) {
  const readableColor = getReadableUsernameColor(color)

  return (
    <span
      className={className}
      style={readableColor ? { color: readableColor } : undefined}
    >
      {displayName}
    </span>
  )
}
