import { EyeOffIcon, PlayIcon } from "lucide-react"

import { usePeepochatSettings } from "@/lib/peepochat/peepochat-context"
import {
  SettingsGroup,
  SettingsSection,
  SettingsSelectRow,
  SettingsSwitchRow,
  SettingsTab,
} from "@/components/settings/settings-primitives"

export function PlayerTab() {
  const { config, updateConfig } = usePeepochatSettings()

  return (
    <SettingsTab>
      <SettingsSection title="Watching">
        <SettingsGroup>
          <SettingsSelectRow
            title="Watch mode"
            description="How streams appear when you watch more than one at a time."
            value={config.player.mode}
            onChange={(mode) =>
              updateConfig((current) => ({
                ...current,
                player: { ...current.player, mode },
              }))
            }
            options={[
              {
                value: "multi",
                label: "Multi-stream view: streams side by side",
              },
              {
                value: "sidebar",
                label: "Sidebar players: one stream at a time",
              },
            ]}
          />
          {config.player.mode === "multi" ? (
            <SettingsSelectRow
              title="Stream audio"
              description="Whether new streams start with sound. Use each stream's own controls to change it afterwards."
              value={config.player.multiAudio}
              onChange={(multiAudio) =>
                updateConfig((current) => ({
                  ...current,
                  player: { ...current.player, multiAudio },
                }))
              }
              options={[
                { value: "first", label: "Only the first stream has sound" },
                { value: "all", label: "Every stream starts with sound" },
                { value: "muted", label: "Every stream starts muted" },
              ]}
            />
          ) : null}
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title="Playback">
        <SettingsGroup>
          <SettingsSwitchRow
            icon={PlayIcon}
            title="Continue playback in background"
            description="Keep streams playing when you switch back to a channel or split."
            checked={config.player.backgroundPlaybackEnabled}
            onCheckedChange={(backgroundPlaybackEnabled) =>
              updateConfig((current) => ({
                ...current,
                player: { ...current.player, backgroundPlaybackEnabled },
              }))
            }
          />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title="Details card">
        <SettingsGroup>
          <SettingsSwitchRow
            icon={EyeOffIcon}
            title="Hide stream info and bio"
            description="Hides the details card below the player so only the video remains. In the multi-stream view, the card only shows while a single stream is open."
            checked={config.player.hideStreamInfoEnabled}
            onCheckedChange={(hideStreamInfoEnabled) =>
              updateConfig((current) => ({
                ...current,
                player: { ...current.player, hideStreamInfoEnabled },
              }))
            }
          />
        </SettingsGroup>
      </SettingsSection>
    </SettingsTab>
  )
}
