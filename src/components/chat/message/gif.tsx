import type { TwitchChatGif } from "@/lib/twitch/chat/chat"

export function ChatGif({ gif, label }: { gif: TwitchChatGif; label: string }) {
  return (
    <span className="chat-gif">
      <img src={gif.url} alt={label} loading="eager" decoding="async" />
    </span>
  )
}
