import { HistoryIcon } from "lucide-react"

import { usePeepochatSettings } from "@/lib/peepochat-context"
import {
  SettingsDivider,
  SettingsGroup,
  SettingsSection,
  SettingsSwitchRow,
  SettingsTab,
  SettingsToggle,
} from "@/components/settings/settings-primitives"

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
        title="Chat history"
        description="Load recent messages when you open a channel."
      >
        <SettingsToggle
          icon={HistoryIcon}
          title="Show recent messages"
          description="Fetch messages sent before you connected, via recent-messages.robotty.de."
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
      </SettingsSection>

      <SettingsSection
        title="Emote services"
        description="Third-party emote providers loaded per channel."
      >
        <SettingsGroup>
          <SettingsSwitchRow
            title="BetterTTV"
            description="Channel and shared emotes from BetterTTV."
            checked={config.chat.emotes.bttvEnabled}
            onCheckedChange={(checked) => setEmoteProvider("bttvEnabled", checked)}
          />
          <SettingsSwitchRow
            title="FrankerFaceZ"
            description="Global and channel emotes from FrankerFaceZ."
            checked={config.chat.emotes.ffzEnabled}
            onCheckedChange={(checked) => setEmoteProvider("ffzEnabled", checked)}
          />
          <SettingsSwitchRow
            title="7TV"
            description="Channel emotes from 7TV."
            checked={config.chat.emotes.seventvEnabled}
            onCheckedChange={(checked) => setEmoteProvider("seventvEnabled", checked)}
          />
        </SettingsGroup>
      </SettingsSection>
    </SettingsTab>
  )
}
