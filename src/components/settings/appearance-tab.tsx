import {
  LayersIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
} from "lucide-react"

import type { ChatFontFamily, MessageTimestampFormat } from "@/lib/peepochat-config"
import { usePeeepochatSettings } from "@/lib/peepochat-context"
import { useTheme } from "@/components/theme-provider"
import {
  SettingsDivider,
  SettingsGroup,
  SettingsRange,
  SettingsSection,
  SettingsSegmented,
  SettingsSelectRow,
  SettingsTab,
  SettingsToggle,
} from "@/components/settings/settings-primitives"

const MESSAGE_TIMESTAMP_FORMAT_OPTIONS: {
  value: MessageTimestampFormat
  preview: string
}[] = [
  { value: "24-hour", preview: "17:38" },
  { value: "12-hour", preview: "5:38" },
  { value: "12-hour-meridiem", preview: "5:38 PM" },
  { value: "none", preview: "None" },
]

const FONT_FAMILY_OPTIONS: { value: ChatFontFamily; label: string }[] = [
  { value: "default", label: "System default" },
  { value: "mono", label: "Monospace" },
]

export function AppearanceTab() {
  const { config, updateConfig } = usePeeepochatSettings()
  const { theme, setTheme } = useTheme()

  return (
    <SettingsTab
      title="Appearance"
      description="Theme, typography, timestamps, and performance-related display options."
    >
      <SettingsSection
        title="Theme"
        description="Which color scheme the app uses."
      >
        <SettingsSegmented
          value={theme}
          onChange={setTheme}
          size="lg"
          options={[
            { value: "system", label: "System", icon: MonitorIcon },
            { value: "light", label: "Light", icon: SunIcon },
            { value: "dark", label: "Dark", icon: MoonIcon },
          ]}
        />
      </SettingsSection>

      <SettingsDivider />

      <SettingsSection
        title="Typography"
        description="How chat messages are displayed."
      >
        <SettingsGroup>
          <SettingsSelectRow
            title="Font family"
            description="Applies to chat message text."
            value={config.chat.fontFamily}
            onChange={(fontFamily) =>
              updateConfig((current) => ({
                ...current,
                chat: { ...current.chat, fontFamily },
              }))
            }
            options={FONT_FAMILY_OPTIONS}
          />
        </SettingsGroup>
        <div className="mt-2">
          <SettingsRange
            label="Font size"
            value={config.chat.fontSizePx}
            min={12}
            max={20}
            onChange={(fontSizePx) =>
              updateConfig((current) => ({
                ...current,
                chat: { ...current.chat, fontSizePx },
              }))
            }
          />
        </div>
      </SettingsSection>

      <SettingsDivider />

      <SettingsSection
        title="Timestamps"
        description="How timestamps appear in chat."
      >
        <SettingsSegmented
          value={config.chat.messageTimestampFormat}
          size="lg"
          onChange={(messageTimestampFormat) =>
            updateConfig((current) => ({
              ...current,
              chat: { ...current.chat, messageTimestampFormat },
            }))
          }
          options={MESSAGE_TIMESTAMP_FORMAT_OPTIONS}
        />
      </SettingsSection>

      <SettingsDivider />

      <SettingsSection
        title="Performance"
        description="Trade memory for faster switching between channels and splits."
      >
        <SettingsToggle
          icon={LayersIcon}
          title="Keep chat views mounted"
          description="Leave off-screen channels and splits in the DOM (hidden) so switching back is instant. Uses more memory on busy channels."
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
      </SettingsSection>
    </SettingsTab>
  )
}
