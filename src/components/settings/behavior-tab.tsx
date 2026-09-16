import {
  EraserIcon,
  EyeIcon,
  HistoryIcon,
  LayersIcon,
  Layers2Icon,
  PlayIcon,
  RadioIcon,
  ShieldAlertIcon,
  UserXIcon,
} from "lucide-react"
import {
  LIVE_MESSAGES_PER_CHANNEL_MAX,
  LIVE_MESSAGES_PER_CHANNEL_MIN,
} from "@/lib/peepochat/peepochat-config"
import { usePeepochatSettings } from "@/lib/peepochat/peepochat-context"
import {
  SettingsDivider,
  SettingsGroup,
  SettingsSection,
  SettingsSliderRow,
  SettingsSwitchRow,
  SettingsTab,
} from "@/components/settings/settings-primitives"

const EMOTE_PROVIDER_ROWS = [
  {
    provider: "bttvEnabled" as const,
    title: "BetterTTV",
    description: "Emotes via betterttv.com",
    iconSrc: "/icons/bttv.svg",
  },
  {
    provider: "ffzEnabled" as const,
    title: "FrankerFaceZ",
    description: "Emotes via frankerfacez.com",
    iconSrc: "/icons/ffz.svg",
  },
  {
    provider: "seventvEnabled" as const,
    title: "7TV",
    description: "Emotes via 7tv.app",
    iconSrc: "/icons/7tv.svg",
  },
]

export function BehaviorTab() {
  const { config, updateConfig } = usePeepochatSettings()

  const setEmoteProvider = (
    provider: "bttvEnabled" | "ffzEnabled" | "seventvEnabled",
    checked: boolean
  ) => {
    updateConfig((current) => ({
      ...current,
      chat: {
        ...current.chat,
        emotes: { ...current.chat.emotes, [provider]: checked },
      },
    }))
  }

  return (
    <SettingsTab
      title="Behavior"
      description="Feature toggles and preferences for how Peepochat works."
    >
      <SettingsDivider className="mt-4 mb-4" />

      <SettingsSection
        title="Chatbox"
        description="Behavior of the chatbox and how messages are displayed."
      >
        <SettingsGroup>
          <SettingsSliderRow
            title="Max messages"
            description="Number of messages to display per channel."
            value={config.chat.maxLiveMessagesPerChannel}
            min={LIVE_MESSAGES_PER_CHANNEL_MIN}
            max={LIVE_MESSAGES_PER_CHANNEL_MAX}
            onChange={(maxLiveMessagesPerChannel) =>
              updateConfig((current) => ({
                ...current,
                chat: { ...current.chat, maxLiveMessagesPerChannel },
              }))
            }
          />
          <SettingsSwitchRow
            icon={HistoryIcon}
            title="Show recent messages"
            description="Fetch messages sent before you connected to the channel."
            checked={config.chat.recentMessagesEnabled}
            onCheckedChange={(checked) =>
              updateConfig((current) => ({
                ...current,
                chat: {
                  ...current.chat,
                  recentMessagesEnabled: checked,
                },
              }))
            }
          />
          <SettingsSwitchRow
            icon={EraserIcon}
            title="Clear chat when instructed"
            description="Remove all messages in a channel when instructed. Moderators are exempt from this."
            checked={config.chat.clearChatWhenInstructed}
            onCheckedChange={(clearChatWhenInstructed) =>
              updateConfig((current) => ({
                ...current,
                chat: { ...current.chat, clearChatWhenInstructed },
              }))
            }
          />
          <SettingsSwitchRow
            icon={UserXIcon}
            title="Hide blocked users"
            description="Do not show messages from users you have blocked on Twitch."
            checked={config.chat.hideBlockedUsers}
            onCheckedChange={(hideBlockedUsers) =>
              updateConfig((current) => ({
                ...current,
                chat: { ...current.chat, hideBlockedUsers },
              }))
            }
          />
          <SettingsSwitchRow
            icon={ShieldAlertIcon}
            title="Show suspicious activity"
            description="Show monitored or restricted messages in applicable channels."
            checked={config.chat.showSuspiciousActivity}
            onCheckedChange={(showSuspiciousActivity) =>
              updateConfig((current) => ({
                ...current,
                chat: { ...current.chat, showSuspiciousActivity },
              }))
            }
          />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="Emote services"
        description="Third-party emote providers loaded per channel."
      >
        <SettingsGroup>
          {EMOTE_PROVIDER_ROWS.map((row) => (
            <SettingsSwitchRow
              key={row.provider}
              title={row.title}
              description={row.description}
              iconSrc={row.iconSrc}
              checked={config.chat.emotes[row.provider]}
              onCheckedChange={(checked) =>
                setEmoteProvider(row.provider, checked)
              }
            />
          ))}
        </SettingsGroup>
      </SettingsSection>

      {config.chat.emotes.seventvEnabled ? (
        <SettingsSection title="7TV" description="7TV-specific emote behavior.">
          <SettingsGroup>
            <SettingsSwitchRow
              icon={EyeIcon}
              title="Show unlisted emotes"
              description="Render 7TV emotes that are not yet approved for listing on 7tv.app."
              checked={config.chat.emotes.showUnlistedEmotes}
              onCheckedChange={(showUnlistedEmotes) =>
                updateConfig((current) => ({
                  ...current,
                  chat: {
                    ...current.chat,
                    emotes: { ...current.chat.emotes, showUnlistedEmotes },
                  },
                }))
              }
            />
            <SettingsSwitchRow
              icon={Layers2Icon}
              title="Enable zero-width emotes"
              description="Overlay 7TV zero-width emotes on the emote before them in chat."
              checked={config.chat.emotes.zeroWidthEmotesEnabled}
              onCheckedChange={(zeroWidthEmotesEnabled) =>
                updateConfig((current) => ({
                  ...current,
                  chat: {
                    ...current.chat,
                    emotes: { ...current.chat.emotes, zeroWidthEmotesEnabled },
                  },
                }))
              }
            />
            <SettingsSwitchRow
              icon={RadioIcon}
              title="Real-time emote updates"
              description="Apply 7TV channel emote changes as they happen, without refreshing."
              checked={config.chat.emotes.liveEmoteUpdatesEnabled}
              onCheckedChange={(liveEmoteUpdatesEnabled) =>
                updateConfig((current) => ({
                  ...current,
                  chat: {
                    ...current.chat,
                    emotes: { ...current.chat.emotes, liveEmoteUpdatesEnabled },
                  },
                }))
              }
            />
          </SettingsGroup>
        </SettingsSection>
      ) : null}

      <SettingsDivider />

      <SettingsSection
        title="Player"
        description="Playback behavior for the Peepochat Player."
      >
        <SettingsGroup>
          <SettingsSwitchRow
            icon={PlayIcon}
            title="Continue playback in background"
            description="Keep the stream playing when you switch back to a channel or split."
            checked={config.player.backgroundPlaybackEnabled}
            onCheckedChange={(backgroundPlaybackEnabled) =>
              updateConfig((current) => ({
                ...current,
                player: { ...current.player, backgroundPlaybackEnabled },
              }))
            }
          />
        </SettingsGroup>
      </SettingsSection>

      <SettingsDivider />

      <SettingsSection
        title="Performance"
        description="Make the app more performant on lower-end devices."
      >
        <SettingsGroup>
          <SettingsSwitchRow
            icon={LayersIcon}
            title="Keep chat views mounted"
            description="Leaves channel and split views loaded and laid out in the DOM. Switching is instant, but uses more memory on busy channels."
            checked={config.chat.keepChatViewsMounted}
            onCheckedChange={(checked) =>
              updateConfig((current) => ({
                ...current,
                chat: {
                  ...current.chat,
                  keepChatViewsMounted: checked,
                },
              }))
            }
          />
        </SettingsGroup>
      </SettingsSection>
    </SettingsTab>
  )
}
