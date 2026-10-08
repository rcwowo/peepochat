import { EyeOffIcon, PlayIcon } from "lucide-react"

import { usePeepochatSettings } from "@/lib/peepochat/peepochat-context"
import {
  SettingsGroup,
  SettingsSection,
  SettingsSwitchRow,
  SettingsTab,
} from "@/components/settings/settings-primitives"

export function PlayerTab() {
  const { config, updateConfig } = usePeepochatSettings()

  return (
    <SettingsTab description="Playback and layout options for watching streams.">
      <SettingsSection title="Playback">
        <SettingsGroup>
          <SettingsSwitchRow
            icon={PlayIcon}
            title="Continue playback in background"
            description="Keep the stream playing when you switch back to a channel or split."
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
            description="Hides the details card below the player so only the video remains."
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
