import * as React from "react"
import { CloudDownloadIcon, CloudUploadIcon } from "lucide-react"
import { toast } from "sonner"

import { clearAllOnboardingState } from "@/lib/peepochat/onboarding-storage"
import { usePeepochatSettings } from "@/lib/peepochat/peepochat-context"
import { exportConfigBackup } from "@/lib/peepochat/peepochat-config"
import {
  SettingsActionButton,
  SettingsActions,
  SettingsDivider,
  SettingsGroup,
  SettingsSection,
  SettingsTab,
} from "@/components/settings/settings-primitives"
import { Button } from "@/components/ui/button"

const INCLUDED_IN_BACKUP = [
  {
    title: "Account Info",
    description:
      "Your account information like ID, display name, and image URLs are included. You will still need to sign in again to restore a session.",
  },
  {
    title: "Channels",
    description: "Your channel list, splits, and the order they appear in, are all included.",
  },
  {
    title: "Preferences",
    description:
      "Your appearance and behavior preferences, among other settings you've set are all included.",
  },
  {
    title: "Metadata",
    description: "Human-readable metadata about the backup, like the date and time it was created.",
  },
] as const

export function DataManagementTab() {
  const { config, restoreBackup } = usePeepochatSettings()
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  const downloadBackup = () => {
    const backup = exportConfigBackup(config)
    const blob = new Blob([backup], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `peepochat-backup-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleRestoreBackup = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const payload = await file.text()
      await restoreBackup(payload)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Backup restore failed"
      )
    } finally {
      event.target.value = ""
    }
  }

  return (
    <SettingsTab
      title="Data Management"
      description="Export, restore, or clear your local Peepochat configuration. Backups are human-readable JSON files on your device."
    >
      <SettingsDivider className="mt-4 mb-4" />

      <SettingsSection
        title="What's included:"
        description="Settings that are saved in exported backups."
      >
        <SettingsGroup>
          {INCLUDED_IN_BACKUP.map((item) => (
            <div key={item.title} className="px-2.5 py-2">
              <div className="text-sm font-medium leading-tight">{item.title}</div>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                {item.description}
              </p>
            </div>
          ))}
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="Backup & restore"
        description="Download a snapshot now or replace your current settings from a previous export."
      >
        <SettingsActions>
          <SettingsActionButton onClick={downloadBackup}>
            <CloudDownloadIcon className="size-3.5" />
            Export backup
          </SettingsActionButton>
          <SettingsActionButton
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            <CloudUploadIcon className="size-3.5" />
            Restore backup
          </SettingsActionButton>
        </SettingsActions>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleRestoreBackup}
        />
      </SettingsSection>

      <SettingsDivider />

      <SettingsSection
        title="Danger zone"
        description="Permanently remove all Peepochat data stored in this browser and reload the app."
      >
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            if (
              window.confirm(
                "This will reset ALL settings to defaults. This cannot be undone. Continue?"
              )
            ) {
              clearAllOnboardingState()
              localStorage.clear()
              window.location.reload()
            }
          }}
        >
          Delete all settings
        </Button>
      </SettingsSection>
    </SettingsTab>
  )
}
