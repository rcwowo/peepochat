import type * as React from "react"
import {
  ListXIcon,
  PauseIcon,
  PowerIcon,
  ShuffleIcon,
  SkipForwardIcon,
} from "lucide-react"

import {
  SettingsGroup,
  SettingsSection,
  SettingsTab,
} from "@/components/settings/settings-primitives"
import {
  TtsLineListField,
  TtsRoleSelect,
} from "@/components/settings/tts/tts-settings-shared"
import { Switch } from "@/components/ui/switch"
import { useTtsSettings } from "@/hooks/tts/use-tts-settings"
import { TTS_COMMAND_CATALOG, TTS_COMMAND_ORDER } from "@/lib/tts/chat-commands"
import type { TtsCommandId, TtsCommandSetting } from "@/lib/tts/tts-config"

const COMMAND_ICONS: Record<
  TtsCommandId,
  React.ComponentType<{ className?: string }>
> = {
  queue: PowerIcon,
  playback: PauseIcon,
  skip: SkipForwardIcon,
  clear: ListXIcon,
  newVoice: ShuffleIcon,
}

export function TtsCommandsTab() {
  const { tts, updateTts } = useTtsSettings()

  const updateCommand = (id: TtsCommandId, patch: Partial<TtsCommandSetting>) =>
    updateTts((current) => ({
      ...current,
      commands: {
        ...current.commands,
        [id]: { ...current.commands[id], ...patch },
      },
    }))

  return (
    <SettingsTab>
      <SettingsSection
        title="Chat commands"
        description="Commands only work in the channel Chatvoice is running in, and are never read aloud. The dropdown sets the lowest role that can use each command."
      >
        <SettingsGroup>
          {TTS_COMMAND_ORDER.map((id) => {
            const Icon = COMMAND_ICONS[id]
            const catalog = TTS_COMMAND_CATALOG[id]
            const setting = tts.commands[id]

            return (
              <div
                key={id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5"
              >
                <div className="flex min-w-0 flex-1 basis-60 items-start gap-3">
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm leading-tight font-medium">
                        {catalog.title}
                      </span>
                      {catalog.triggers.map((trigger) => (
                        <span
                          key={trigger}
                          className="rounded-md border border-border bg-muted/40 px-1.5 py-px text-[11px] leading-tight font-medium text-muted-foreground"
                        >
                          {trigger}
                        </span>
                      ))}
                    </div>
                    <div className="mt-0.5 text-xs leading-snug text-muted-foreground">
                      {catalog.description}
                    </div>
                  </div>
                </div>
                <div className="ml-7 flex shrink-0 items-center gap-3 max-sm:w-[calc(100%-1.75rem)] max-sm:justify-between sm:ml-auto">
                  <TtsRoleSelect
                    value={setting.minRole}
                    disabled={!setting.enabled}
                    onChange={(minRole) => updateCommand(id, { minRole })}
                    ariaLabel={`Minimum role for ${catalog.title.toLowerCase()}`}
                    className="max-sm:flex-1"
                  />
                  <Switch
                    checked={setting.enabled}
                    aria-label={`Enable ${catalog.title.toLowerCase()}`}
                    onCheckedChange={(enabled) =>
                      updateCommand(id, { enabled })
                    }
                  />
                </div>
              </div>
            )
          })}
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="Trusted users"
        description="These users can run any enabled command and use any enabled sound, regardless of their role."
      >
        <SettingsGroup>
          <TtsLineListField
            label="Usernames"
            description="One username per line."
            values={tts.commands.whitelist}
            placeholder={"trustedmod\neditorname"}
            onCommit={(whitelist) =>
              updateTts((current) => ({
                ...current,
                commands: { ...current.commands, whitelist },
              }))
            }
          />
        </SettingsGroup>
      </SettingsSection>
    </SettingsTab>
  )
}
