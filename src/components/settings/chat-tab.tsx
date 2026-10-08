import {
  BanIcon,
  ClockIcon,
  CopyIcon,
  CornerUpLeftIcon,
  EraserIcon,
  EyeIcon,
  Gamepad2Icon,
  HistoryIcon,
  LayersIcon,
  Layers2Icon,
  PinIcon,
  RadioIcon,
  ShieldAlertIcon,
  Trash2Icon,
  TypeIcon,
  UserXIcon,
} from "lucide-react"

import {
  LIVE_MESSAGES_PER_CHANNEL_MAX,
  LIVE_MESSAGES_PER_CHANNEL_MIN,
} from "@/lib/peepochat/peepochat-config"
import { usePeepochatSettings } from "@/lib/peepochat/peepochat-context"
import {
  canBanOrTimeoutUsers,
  canDeleteChatMessages,
} from "@/lib/chat/moderation/permissions"
import {
  SettingsGroup,
  SettingsSection,
  SettingsSelectRow,
  SettingsSliderRow,
  SettingsSwitchRow,
  SettingsTab,
} from "@/components/settings/settings-primitives"

const EMOTE_PROVIDER_ROWS = [
  {
    provider: "bttvEnabled" as const,
    title: "BetterTTV",
    iconSrc: "/icons/bttv.svg",
  },
  {
    provider: "ffzEnabled" as const,
    title: "FrankerFaceZ",
    iconSrc: "/icons/ffz.svg",
  },
  {
    provider: "seventvEnabled" as const,
    title: "7TV",
    iconSrc: "/icons/7tv.svg",
  },
]

export function ChatTab() {
  const { config, updateConfig, account } = usePeepochatSettings()
  const canConfigureChatMessages = canDeleteChatMessages(account)
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
    <SettingsTab description="How the message feed behaves and what appears in it.">
      <SettingsSection
        title="Feed"
        description="Message flow and limits for every channel view."
      >
        <SettingsGroup>
          <SettingsSliderRow
            title="Max messages"
            description="Older messages are dropped when the feed grows beyond this limit."
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
            onCheckedChange={(recentMessagesEnabled) =>
              updateConfig((current) => ({
                ...current,
                chat: { ...current.chat, recentMessagesEnabled },
              }))
            }
          />
          <SettingsSwitchRow
            icon={EraserIcon}
            title="Clear chat when instructed"
            description="Moderators are exempt from clear commands."
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

      <SettingsSection title="Message content">
        <SettingsGroup>
          <SettingsSelectRow
            title="Deleted messages"
            value={config.chat.deletedMessagesBehavior}
            onChange={(deletedMessagesBehavior) =>
              updateConfig((current) => ({
                ...current,
                chat: { ...current.chat, deletedMessagesBehavior },
              }))
            }
            options={[
              { value: "remove", label: "Remove from list" },
              { value: "strikethrough", label: "Strikethrough" },
              { value: "show-on-hover", label: "Show on hover" },
            ]}
          />
          <SettingsSelectRow
            title="GIF messages"
            description="How Tier 2 and Tier 3 subscriber GIFs appear in chat."
            value={config.chat.gifMessageAppearance}
            onChange={(gifMessageAppearance) =>
              updateConfig((current) => ({
                ...current,
                chat: { ...current.chat, gifMessageAppearance },
              }))
            }
            options={[
              { value: "display", label: "Display GIFs in chat" },
              { value: "links", label: "Only display GIF links" },
              { value: "disabled", label: "Disabled" },
            ]}
          />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title="Composer">
        <SettingsGroup>
          <SettingsSelectRow
            title="Chat modes button"
            value={config.chat.chatModesVisibility}
            onChange={(chatModesVisibility) =>
              updateConfig((current) => ({
                ...current,
                chat: { ...current.chat, chatModesVisibility },
              }))
            }
            options={[
              { value: "always", label: "Always visible" },
              {
                value: "when-permitted",
                label: "When permissions allow changes",
              },
              { value: "hidden", label: "Hidden" },
            ]}
          />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="Message quick actions"
        description={
          canConfigureChatMessages || canConfigureBanOrTimeout
            ? "Buttons shown when you hover a message. Some actions only appear in chats you have permissions for."
            : "Buttons shown when you hover a message."
        }
      >
        <SettingsGroup>
          <SettingsSwitchRow
            icon={CopyIcon}
            title="Copy message"
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
          {canConfigureChatMessages ? (
            <SettingsSwitchRow
              icon={PinIcon}
              title="Pin message"
              checked={config.chat.messageQuickActions.pinEnabled}
              onCheckedChange={(pinEnabled) =>
                updateConfig((current) => ({
                  ...current,
                  chat: {
                    ...current.chat,
                    messageQuickActions: {
                      ...current.chat.messageQuickActions,
                      pinEnabled,
                    },
                  },
                }))
              }
            />
          ) : null}
          {canConfigureChatMessages ? (
            <SettingsSwitchRow
              icon={Trash2Icon}
              title="Delete message"
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
        title="Channel header"
        description="Details shown when you expand a channel header in chat."
      >
        <SettingsGroup>
          <SettingsSwitchRow
            icon={EyeIcon}
            title="View count"
            checked={config.chat.streamInfo.viewerCountEnabled}
            onCheckedChange={(viewerCountEnabled) =>
              updateConfig((current) => ({
                ...current,
                chat: {
                  ...current.chat,
                  streamInfo: {
                    ...current.chat.streamInfo,
                    viewerCountEnabled,
                  },
                },
              }))
            }
          />
          <SettingsSwitchRow
            icon={TypeIcon}
            title="Title"
            checked={config.chat.streamInfo.titleEnabled}
            onCheckedChange={(titleEnabled) =>
              updateConfig((current) => ({
                ...current,
                chat: {
                  ...current.chat,
                  streamInfo: {
                    ...current.chat.streamInfo,
                    titleEnabled,
                  },
                },
              }))
            }
          />
          <SettingsSwitchRow
            icon={Gamepad2Icon}
            title="Category"
            checked={config.chat.streamInfo.categoryEnabled}
            onCheckedChange={(categoryEnabled) =>
              updateConfig((current) => ({
                ...current,
                chat: {
                  ...current.chat,
                  streamInfo: {
                    ...current.chat.streamInfo,
                    categoryEnabled,
                  },
                },
              }))
            }
          />
          <SettingsSwitchRow
            icon={ClockIcon}
            title="Uptime"
            checked={config.chat.streamInfo.uptimeEnabled}
            onCheckedChange={(uptimeEnabled) =>
              updateConfig((current) => ({
                ...current,
                chat: {
                  ...current.chat,
                  streamInfo: {
                    ...current.chat.streamInfo,
                    uptimeEnabled,
                  },
                },
              }))
            }
          />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title="Emote services">
        <SettingsGroup>
          {EMOTE_PROVIDER_ROWS.map((row) => (
            <SettingsSwitchRow
              key={row.provider}
              title={row.title}
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
        <SettingsSection title="7TV">
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
                    emotes: {
                      ...current.chat.emotes,
                      zeroWidthEmotesEnabled,
                    },
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
                    emotes: {
                      ...current.chat.emotes,
                      liveEmoteUpdatesEnabled,
                    },
                  },
                }))
              }
            />
          </SettingsGroup>
        </SettingsSection>
      ) : null}

      <SettingsSection title="Performance">
        <SettingsGroup>
          <SettingsSwitchRow
            icon={LayersIcon}
            title="Keep chat views mounted"
            description="Leaves channel and split views loaded and laid out in the DOM. Switching is instant, but uses more memory on busy channels."
            checked={config.chat.keepChatViewsMounted}
            onCheckedChange={(keepChatViewsMounted) =>
              updateConfig((current) => ({
                ...current,
                chat: { ...current.chat, keepChatViewsMounted },
              }))
            }
          />
        </SettingsGroup>
      </SettingsSection>
    </SettingsTab>
  )
}
