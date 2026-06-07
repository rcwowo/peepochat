import * as React from "react"
import {
  LayersIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
} from "lucide-react"

import type { MessageTimestampFormat } from "@/lib/peepochat/peepochat-config"
import { usePeepochatSettings } from "@/lib/peepochat/peepochat-context"
import { useTheme } from "@/components/shell/theme-provider"
import {
  SettingsDivider,
  SettingsGroup,
  SettingsInputRow,
  SettingsSliderRow,
  SettingsSection,
  SettingsSegmented,
  SettingsSwitchRow,
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

export function AppearanceTab() {
  const { config, updateConfig } = usePeepochatSettings()
  const { theme, setTheme } = useTheme()
  const [fontDraft, setFontDraft] = React.useState(config.chat.fontFamily)

  React.useEffect(() => {
    setFontDraft(config.chat.fontFamily)
  }, [config.chat.fontFamily])

  const commitFontFamily = React.useCallback(() => {
    const next = fontDraft.trim()
    if (next === config.chat.fontFamily) return
    updateConfig((current) => ({
      ...current,
      chat: { ...current.chat, fontFamily: next },
    }))
  }, [config.chat.fontFamily, fontDraft, updateConfig])

  return (
    <SettingsTab
      title="Appearance"
      description="Theme, typography, timestamps, and performance-related display options."
    >
      <SettingsDivider className="mt-4 mb-4" />

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

      <SettingsSection
        title="Message list"
        description="How rows are laid out in the chat timeline."
      >
        <SettingsGroup>
          <SettingsSwitchRow
            title="Alternating row backgrounds"
            description="Use a subtle stripe on every other message for easier scanning."
            checked={config.chat.alternatingRowBackgrounds}
            onCheckedChange={(checked) =>
              updateConfig((current) => ({
                ...current,
                chat: { ...current.chat, alternatingRowBackgrounds: checked },
              }))
            }
          />
          <SettingsSwitchRow
            title="Separators between messages"
            description="Draw a light border under each message row."
            checked={config.chat.messageSeparators}
            onCheckedChange={(checked) =>
              updateConfig((current) => ({
                ...current,
                chat: { ...current.chat, messageSeparators: checked },
              }))
            }
          />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="Typography"
        description="How chat messages are displayed."
      >
        <SettingsGroup>
          <SettingsInputRow
            label="Font family"
            description='Google or system font name. Leave empty for the app default.'
            value={fontDraft}
            placeholder="Inter, sans-serif, monospace, etc."
            onChange={setFontDraft}
            onBlur={commitFontFamily}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur()
              }
            }}
          />
          <SettingsSliderRow
            title="Font size"
            value={config.chat.fontSizePx}
            min={10}
            max={24}
            onChange={(fontSizePx) =>
              updateConfig((current) => ({
                ...current,
                chat: { ...current.chat, fontSizePx },
              }))
            }
          />
        </SettingsGroup>
      </SettingsSection>

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
      </SettingsSection>
    </SettingsTab>
  )
}
