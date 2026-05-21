import * as React from "react"
import { CloudDownloadIcon, CloudUploadIcon } from "lucide-react"
import { toast } from "sonner"

import { useChatvoiceSettings } from "@/lib/chatvoice-context"
import { exportConfigBackup } from "@/lib/chatvoice-config"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SectionHeading } from "@/components/settings/settings-primitives"

export function BackupTab() {
  const { config, restoreBackup } = useChatvoiceSettings()
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
      toast.success("Backup restored successfully.")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Backup restore failed"
      )
    } finally {
      event.target.value = ""
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Backups"
        description="Export a human-readable local backup, or restore a previous one."
      />

      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <div className="font-medium text-foreground">What gets saved</div>
        <ul className="mt-2 space-y-1">
          <li>· Twitch account (token is not exported) and channels</li>
          <li>· Connection preferences</li>
          <li>· Chat display settings (timestamps, theme)</li>
          <li>· Schema version metadata for migrations</li>
        </ul>
        <p className="mt-3 text-xs">
          Older Chatvoice backups (including voice and speech settings) can still
          be imported; speech-related data is ignored.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button onClick={downloadBackup}>
          <CloudDownloadIcon className="size-4" />
          Export backup
        </Button>
        <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
          <CloudUploadIcon className="size-4" />
          Restore backup
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleRestoreBackup}
        />
      </div>

      <Separator />

      <SectionHeading title="Danger zone" />
      <Button
        variant="destructive"
        onClick={() => {
          if (
            window.confirm(
              "This will reset ALL settings to defaults. This cannot be undone. Continue?"
            )
          ) {
            localStorage.clear()
            window.location.reload()
          }
        }}
      >
        Delete all settings
      </Button>
    </div>
  )
}
