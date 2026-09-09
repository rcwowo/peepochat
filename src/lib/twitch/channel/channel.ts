/** Normalize a Twitch channel login (`#Foo` → `foo`). */
export function normalizeChannelLogin(channel: string): string {
  return channel.trim().replace(/^#/, "").toLowerCase()
}
