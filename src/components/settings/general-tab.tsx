import * as React from "react"
import {
  ExternalLinkIcon,
  HeartIcon,
  HistoryIcon,
  MonitorIcon,
  MoonIcon,
  PlugIcon,
  SparklesIcon,
  SunIcon,
} from "lucide-react"

import type { MessageTimestampFormat } from "@/lib/peepochat-config"
import logoSrc from "/logo.svg"
import iconSrc from "/icon.svg"
import { usePeeepochatSettings } from "@/lib/peepochat-context"
import { useTheme } from "@/components/theme-provider"
import { Separator } from "@/components/ui/separator"
import {
  SectionHeading,
  SettingsToggle,
} from "@/components/settings/settings-primitives"
import { ChangelogDialog } from "@/components/changelog-dialog"

const version: string = __APP_VERSION__

export function GeneralTab() {
  const { config, updateConfig } = usePeeepochatSettings()
  const [changelogOpen, setChangelogOpen] = React.useState(false)

  return (
    <div className="space-y-6">
      <div className="relative -mx-6 -mt-12 overflow-hidden px-6 pt-8 pb-6">
        <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-primary/6 via-primary/3 to-transparent" />
        <div className="pointer-events-none absolute -top-20 -right-20 size-64 rounded-full bg-primary/[0.07] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 size-48 rounded-full bg-primary/4 blur-3xl" />

        <div className="relative flex items-start gap-5">
          <img
            src={iconSrc}
            alt=""
            className="brand-mark size-14 shrink-0 drop-shadow-md"
          />

          <div className="min-w-0 flex-1">
            <img src={logoSrc} alt="Peepochat" className="brand-mark h-6" />
            <p className="text-xs text-muted-foreground mt-1">Version {version}</p>
            <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
              A lightweight Twitch chat client for the web. Sign in with Twitch,
              follow channels from the sidebar, and keep your settings on this
              device.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href="https://streamelements.com/rcwowo/tip"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
              >
                <HeartIcon className="size-3" />
                Support the project
              </a>
              <button
                type="button"
                onClick={() => setChangelogOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground/5 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors cursor-pointer hover:bg-foreground/10 hover:text-foreground"
              >
                <SparklesIcon className="size-3" />
                What's new
              </button>
              <a
                href="https://bsky.app/profile/rcw.lol"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground/5 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
              >
                <ExternalLinkIcon className="size-3" />
                Bluesky
              </a>
            </div>
          </div>
        </div>
      </div>

      <SectionHeading
        title="Appearance"
        description="Choose what theme the app should use."
      />
      <ThemeSwitcher />

      <SectionHeading
        title="Message timestamp format"
        description="Choose how timestamps appear in chat."
      />
      <TimestampFormatSwitcher
        value={config.chat.messageTimestampFormat}
        onChange={(format) =>
          updateConfig((current) => ({
            ...current,
            chat: {
              ...current.chat,
              messageTimestampFormat: format,
            },
          }))
        }
      />

      <Separator />

      <SectionHeading
        title="Chat history"
        description="Load recent messages when you open a channel."
      />
      <div className="space-y-3">
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
      </div>

      <Separator />

      <SectionHeading title="Connection" />
      <div className="space-y-3">
        <SettingsToggle
          icon={PlugIcon}
          title="Auto-connect on startup"
          description="Automatically reconnect to the last channel when the app opens."
          checked={config.twitch.autoConnect}
          onCheckedChange={(checked) =>
            updateConfig((current) => ({
              ...current,
              twitch: { ...current.twitch, autoConnect: checked },
            }))
          }
        />
      </div>
      <ChangelogDialog open={changelogOpen} onOpenChange={setChangelogOpen} />
    </div>
  )
}

function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()

  const options: {
    value: "light" | "dark" | "system"
    label: string
    icon: React.ComponentType<{ className?: string }>
  }[] = [
    { value: "light", label: "Light", icon: SunIcon },
    { value: "dark", label: "Dark", icon: MoonIcon },
    { value: "system", label: "System", icon: MonitorIcon },
  ]

  return (
    <div className="flex gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setTheme(option.value)}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
            theme === option.value
              ? "border-primary bg-primary/10 font-medium text-foreground"
              : "border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          <option.icon className="size-4" />
          {option.label}
        </button>
      ))}
    </div>
  )
}

const MESSAGE_TIMESTAMP_FORMAT_OPTIONS: {
  value: MessageTimestampFormat
  preview: string
}[] = [
  { value: "24-hour", preview: "21:37" },
  { value: "12-hour", preview: "9:37" },
  { value: "12-hour-meridiem", preview: "9:37 PM" },
  { value: "none", preview: "None" },
]

function TimestampFormatSwitcher({
  value,
  onChange,
}: {
  value: MessageTimestampFormat
  onChange: (format: MessageTimestampFormat) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {MESSAGE_TIMESTAMP_FORMAT_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            value === option.value
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <span className="font-mono text-xs sm:text-sm">{option.preview}</span>
        </button>
      ))}
    </div>
  )
}
