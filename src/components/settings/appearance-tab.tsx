import * as React from "react"
import {
  ClockIcon,
  EyeIcon,
  Gamepad2Icon,
  Link2Icon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
  TypeIcon,
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
  SettingsSelectRow,
  SettingsSliderRow,
  SettingsSection,
  SettingsSegmented,
  SettingsSwitchRow,
  SettingsTab,
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
  const { theme, setTheme } = useTheme()
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
    <SettingsTab
      title="Appearance"
      description="Theme, typography, badges, timestamps, and composer."
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
          <SettingsSelectRow
            title="Deleted messages appearance"
            description="How messages appear after they've been deleted."
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
            title="GIF message appearance"
            description="How Tier 2 and Tier 3 subscriber GIF messages appear in chat."
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

      <SettingsSection
        title="Composer"
        description="Controls that appear next to the message box."
      >
        <SettingsGroup>
          <SettingsSelectRow
            title="Chat modes button"
            description="When the chat modes button appears next to the emote picker."
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
        title="Typography"
        description="How chat messages are displayed."
      >
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
        description="Which badge types appear next to usernames in chat."
      >
        <SettingsGroup>
          <SettingsSwitchRow
            title="Twitch badges"
            description="Native badges provided by Twitch."
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

      <SettingsSection
        title="Stream info"
        description="Details shown when you expand a channel's header."
      >
        <SettingsGroup>
          <SettingsSwitchRow
            icon={EyeIcon}
            title="View count"
            description="How many people are watching while live."
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
            description="The current stream title."
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
            description="The game or category, shown before the title when both are enabled."
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
            description="How long the current stream has been live."
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
    </SettingsTab>
  )
}
