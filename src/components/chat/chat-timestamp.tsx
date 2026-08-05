import type { MessageTimestampFormat } from "@/lib/peepochat/peepochat-config"
import { formatMessageTimestamp } from "@/lib/peepochat/peepochat-context"

export function ChatTimestamp({
  receivedAt,
  timestampFormat,
  className = "chat-timestamp mr-1.5 inline-block align-top text-xs tabular-nums select-none",
}: {
  receivedAt: string
  timestampFormat: MessageTimestampFormat
  className?: string
}) {
  const timestamp = formatMessageTimestamp(receivedAt, timestampFormat)
  if (!timestamp) {
    return null
  }

  return (
    <time className={className} dateTime={receivedAt}>
      {timestamp}
    </time>
  )
}
