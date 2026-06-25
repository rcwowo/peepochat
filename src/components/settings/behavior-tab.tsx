import {
  CopyIcon,
  CornerUpLeftIcon,
  EyeIcon,
  HistoryIcon,
  LayersIcon,
  Layers2Icon,
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
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="Message quick actions"
        description="Buttons shown when you hover a message."
      >
        <SettingsGroup>
          <SettingsSwitchRow
            icon={CopyIcon}
            title="Copy message"
            description="Copy the message text to your clipboard."
            checked={config.chat.messageQuickActions.copyEnabled}
            onCheckedChange={(copyEnabled) =>
              updateConfig((current) => ({
                ...current,
                chat: {
                  ...current.chat,
                  messageQuickActions: {
                    ...current.chat.messageQuickActions,
                    copyEnabled,
                  },
                },
              }))
            }
          />
          <SettingsSwitchRow
            icon={CornerUpLeftIcon}
            title="Reply"
            description="Start a threaded reply in the composer."
            checked={config.chat.messageQuickActions.replyEnabled}
            onCheckedChange={(replyEnabled) =>
              updateConfig((current) => ({
                ...current,
                chat: {
                  ...current.chat,
                  messageQuickActions: {
                    ...current.chat.messageQuickActions,
                    replyEnabled,
                  },
                },
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
          </SettingsGroup>
        </SettingsSection>
      ) : null}

      <SettingsDivider />

      <SettingsSection
        title="Performance"
        description="Make the app more performant on lower-end devices."
      >
        <SettingsGroup>
          <SettingsSwitchRow
            icon={LayersIcon}
            title="Keep chat views mounted"
            description="Leaves channels loaded but hidden in the DOM. Switching channels is instant, but uses more memory on busy channels."
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
