import * as React from "react"
import {
  LayersIcon,
  Link2Icon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
  Unlink2Icon,
} from "lucide-react"

import {
  CHAT_EMOTE_SCALE_DEFAULT,
  CHAT_EMOTE_SCALE_MAX,
  CHAT_EMOTE_SCALE_MIN,
  CHAT_FONT_SIZE_MAX,
  CHAT_FONT_SIZE_MIN,
  type MessageTimestampFormat,
} from "@/lib/peepochat/peepochat-config"
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
import { cn } from "@/lib/utils"

const MESSAGE_TIMESTAMP_FORMAT_OPTIONS: {
  value: MessageTimestampFormat
  preview: string
}[] = [
  { value: "24-hour", preview: "17:38" },
  { value: "12-hour", preview: "5:38" },
  { value: "12-hour-meridiem", preview: "5:38 PM" },
  { value: "none", preview: "None" },
]

function formatEmoteScale(value: number) {
  return `${Math.round((value / CHAT_EMOTE_SCALE_DEFAULT) * 100)}%`
}

function ScaleLinkDivider({
  linked,
  onToggle,
}: {
  linked: boolean
  onToggle: () => void
}) {
  const Icon = linked ? Link2Icon : Unlink2Icon

  return (
    <div
      className={cn(
        "relative h-0 border-t",
        linked ? "border-primary/60" : "border-dashed border-border"
      )}
    >
      <button
        type="button"
        aria-pressed={linked}
        title={
          linked
            ? "Disconnect font size and emote scale"
            : "Connect font size and emote scale"
        }
        aria-label={
          linked
            ? "Disconnect font size and emote scale"
            : "Connect font size and emote scale"
        }
        onClick={onToggle}
        className={cn(
          "absolute left-1/2 top-0 z-10 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-background shadow-xs",
          "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
          linked
            ? "border-primary/45 text-primary"
            : "border-border text-muted-foreground"
        )}
      >
        <Icon className="size-3" />
      </button>
    </div>
  )
}

export function AppearanceTab() {
  const { config, updateConfig } = usePeepochatSettings()
  const { theme, setTheme } = useTheme()
  const [fontDraft, setFontDraft] = React.useState(config.chat.fontFamily)
  const scalesLinked = config.chat.linkEmoteScaleToFontSize

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

  const updateFontSize = React.useCallback(
    (fontSizePx: number) => {
      updateConfig((current) => ({
        ...current,
        chat: {
          ...current.chat,
          fontSizePx,
          emoteScale: current.chat.linkEmoteScaleToFontSize
            ? fontSizePx
            : current.chat.emoteScale,
        },
      }))
    },
    [updateConfig]
  )

  const updateEmoteScale = React.useCallback(
    (emoteScale: number) => {
      updateConfig((current) => ({
        ...current,
        chat: {
          ...current.chat,
          emoteScale,
          fontSizePx: current.chat.linkEmoteScaleToFontSize
            ? emoteScale
            : current.chat.fontSizePx,
        },
      }))
    },
    [updateConfig]
  )

  const toggleLinkedScales = React.useCallback(() => {
    updateConfig((current) => {
      const nextLinked = !current.chat.linkEmoteScaleToFontSize

      return {
        ...current,
        chat: {
          ...current.chat,
          linkEmoteScaleToFontSize: nextLinked,
          emoteScale: nextLinked
            ? current.chat.fontSizePx
            : current.chat.emoteScale,
        },
      }
    })
  }, [updateConfig])

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
          <div>
            <SettingsSliderRow
              title="Font size"
              value={config.chat.fontSizePx}
              min={CHAT_FONT_SIZE_MIN}
              max={CHAT_FONT_SIZE_MAX}
              onChange={updateFontSize}
            />
            <ScaleLinkDivider
              linked={scalesLinked}
              onToggle={toggleLinkedScales}
            />
            <SettingsSliderRow
              title="Emote scale"
              value={config.chat.emoteScale}
              valueLabel={formatEmoteScale(config.chat.emoteScale)}
              min={CHAT_EMOTE_SCALE_MIN}
              max={CHAT_EMOTE_SCALE_MAX}
              onChange={updateEmoteScale}
            />
          </div>
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
