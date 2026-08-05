import {
  BanIcon,
  ClockIcon,
  CopyIcon,
  CornerUpLeftIcon,
  EraserIcon,
  EyeIcon,
  HistoryIcon,
  LayersIcon,
  Layers2Icon,
  RadioIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  Trash2Icon,
  UserXIcon,
} from "lucide-react"

import {
  canBanOrTimeoutUsers,
  canDeleteChatMessages,
} from "@/lib/chat/moderation-permissions"
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
  const { config, updateConfig, account } = usePeepochatSettings()
  const canConfigureDelete = canDeleteChatMessages(account)
  const canConfigureBanOrTimeout = canBanOrTimeoutUsers(account)

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
          <SettingsSwitchRow
            icon={RefreshCwIcon}
            title="Show channel updates"
            description="Show updates for when a channel's stream title or category changes."
            checked={config.chat.showChannelUpdates}
            onCheckedChange={(showChannelUpdates) =>
              updateConfig((current) => ({
                ...current,
                chat: { ...current.chat, showChannelUpdates },
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
            description="Start a threaded reply to the message."
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
          {canConfigureDelete ? (
            <SettingsSwitchRow
              icon={Trash2Icon}
              title="Delete message"
              description="Deletes the message in chats you have permissions for."
              checked={config.chat.messageQuickActions.deleteEnabled}
              onCheckedChange={(deleteEnabled) =>
                updateConfig((current) => ({
                  ...current,
                  chat: {
                    ...current.chat,
                    messageQuickActions: {
                      ...current.chat.messageQuickActions,
                      deleteEnabled,
                    },
                  },
                }))
              }
            />
          ) : null}
          {canConfigureBanOrTimeout ? (
            <SettingsSwitchRow
              icon={ClockIcon}
              title="Timeout"
              description="Timeout the user in chats you have permissions for."
              checked={config.chat.messageQuickActions.timeoutEnabled}
              onCheckedChange={(timeoutEnabled) =>
                updateConfig((current) => ({
                  ...current,
                  chat: {
                    ...current.chat,
                    messageQuickActions: {
                      ...current.chat.messageQuickActions,
                      timeoutEnabled,
                    },
                  },
                }))
              }
            />
          ) : null}
          {canConfigureBanOrTimeout ? (
            <SettingsSwitchRow
              icon={BanIcon}
              title="Ban"
              description="Bans the user in chats you have permissions for."
              checked={config.chat.messageQuickActions.banEnabled}
              onCheckedChange={(banEnabled) =>
                updateConfig((current) => ({
                  ...current,
                  chat: {
                    ...current.chat,
                    messageQuickActions: {
                      ...current.chat.messageQuickActions,
                      banEnabled,
                    },
                  },
                }))
              }
            />
          ) : null}
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
