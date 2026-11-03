import { usePlayerChannelData } from "@/hooks/twitch/player/use-player-channel-data"
import { usePeepochatSettings } from "@/lib/peepochat/peepochat-context"

export function useWatchedChannel(login: string) {
  const { account, channels } = usePeepochatSettings()
  const data = usePlayerChannelData(login, account)
  const savedChannel = channels.find((channel) => channel.login === login)

  return {
    ...data,
    displayName: data.user?.displayName || savedChannel?.displayName || login,
    profileImageUrl:
      data.user?.profileImageUrl || savedChannel?.profileImageUrl || undefined,
    title: data.stream?.title || data.channel?.title || "",
    gameName: data.stream?.gameName || data.channel?.gameName || "",
  }
}
