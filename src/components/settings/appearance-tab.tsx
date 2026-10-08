import * as React from "react"
import {
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
import { useTheme, type ColorScheme } from "@/components/shell/theme-provider"
import {
  SettingsGroup,
  SettingsInputRow,
  SettingsSection,
  SettingsSegmented,
  SettingsSliderRow,
  SettingsSwitchRow,
  SettingsTab,
} from "@/components/settings/settings-primitives"
import { cn } from "@/lib/utils"

const COLOR_SCHEME_OPTIONS: {
  value: ColorScheme
  label: string
  color: string
}[] = [
  { value: "gray", label: "Gray", color: "#737373" },
  { value: "red", label: "Red", color: "#ef4444" },
  { value: "orange", label: "Orange", color: "#f97316" },
  { value: "yellow", label: "Yellow", color: "#eab308" },
  { value: "green", label: "Green", color: "#22c55e" },
  { value: "blue", label: "Blue", color: "#3b82f6" },
  { value: "purple", label: "Purple", color: "#a855f7" },
  { value: "pink", label: "Pink", color: "#ec4899" },
]

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
          "absolute top-0 left-1/2 z-10 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-background shadow-xs",
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

function FontFamilySettingRow({
  fontFamily,
  onCommit,
}: {
  fontFamily: string
  onCommit: (fontFamily: string) => void
}) {
  const [draft, setDraft] = React.useState(fontFamily)

  const commit = React.useCallback(() => {
    const next = draft.trim()
    if (next === fontFamily) return
    onCommit(next)
  }, [draft, fontFamily, onCommit])

  return (
    <SettingsInputRow
      label="Font family"
      description="Google or system font name. Leave empty for the app default."
      value={draft}
      placeholder="Inter, sans-serif, monospace, etc."
      onChange={setDraft}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur()
        }
      }}
    />
  )
}

export function AppearanceTab() {
  const { config, updateConfig } = usePeepochatSettings()
  const { theme, setTheme, colorScheme, setColorScheme } = useTheme()
  const scalesLinked = config.chat.linkEmoteScaleToFontSize

  const commitFontFamily = React.useCallback(
    (fontFamily: string) => {
      updateConfig((current) => ({
        ...current,
        chat: { ...current.chat, fontFamily },
      }))
    },
    [updateConfig]
  )

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
    <SettingsTab>
      <SettingsSection title="Theme">
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

      <SettingsSection title="Color scheme">
        <div
          role="group"
          aria-label="Color scheme"
          className="grid grid-cols-2 gap-2"
        >
          {COLOR_SCHEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={colorScheme === option.value}
              onClick={() => setColorScheme(option.value)}
              className={cn(
                "inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
                colorScheme === option.value
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <span
                aria-hidden="true"
                className="size-5 shrink-0 rounded-full border border-black/10"
                style={{ backgroundColor: option.color }}
              />
              {option.label}
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Timestamps">
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

      <SettingsSection title="Message list">
        <SettingsGroup>
          <SettingsSwitchRow
            title="Alternating row backgrounds"
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

      <SettingsSection title="Typography">
        <SettingsGroup>
          <FontFamilySettingRow
            key={config.chat.fontFamily}
            fontFamily={config.chat.fontFamily}
            onCommit={commitFontFamily}
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
        title="Badges"
        description="Badge types that appear next to usernames in chat."
      >
        <SettingsGroup>
          <SettingsSwitchRow
            title="Twitch badges"
            checked={config.chat.badges.twitchEnabled}
            onCheckedChange={(checked) =>
              updateConfig((current) => ({
                ...current,
                chat: {
                  ...current.chat,
                  badges: { ...current.chat.badges, twitchEnabled: checked },
                },
              }))
            }
          />
          <SettingsSwitchRow
            title="OwO+ badges"
            description="Awarded by subscribing to my Patreon."
            checked={config.chat.badges.owoMemberEnabled}
            onCheckedChange={(checked) =>
              updateConfig((current) => ({
                ...current,
                chat: {
                  ...current.chat,
                  badges: { ...current.chat.badges, owoMemberEnabled: checked },
                },
              }))
            }
          />
        </SettingsGroup>
      </SettingsSection>
    </SettingsTab>
  )
}
