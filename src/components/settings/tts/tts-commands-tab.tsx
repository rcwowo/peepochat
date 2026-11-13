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
        description="Commands only apply to the channel text-to-speech is running in, and are never read aloud."
      >
        <SettingsGroup>
          {TTS_COMMAND_ORDER.map((id) => {
            const Icon = COMMAND_ICONS[id]
            const catalog = TTS_COMMAND_CATALOG[id]
            const setting = tts.commands[id]

            return (
              <div key={id} className="space-y-2.5 px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="font-mono text-[13px] leading-tight font-medium">
                        {catalog.command}
                      </div>
                      <div className="mt-0.5 text-xs leading-snug text-muted-foreground">
                        {catalog.description}
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={setting.enabled}
                    aria-label={`Enable ${catalog.command}`}
                    onCheckedChange={(enabled) =>
                      updateCommand(id, { enabled })
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-3 pl-7">
                  <span className="text-xs text-muted-foreground">
                    Minimum role
                  </span>
                  <TtsRoleSelect
                    value={setting.minRole}
                    disabled={!setting.enabled}
                    onChange={(minRole) => updateCommand(id, { minRole })}
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
