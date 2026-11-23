import * as React from "react"
import {
  ArchiveIcon,
  AudioLinesIcon,
  BellRingIcon,
  DownloadIcon,
  FileJsonIcon,
  HashIcon,
  InfoIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
  UserIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { BackupPreviewSummary } from "@/components/backup/backup-preview-summary"
import { ChatvoiceImportSummary } from "@/components/chatvoice/chatvoice-import-summary"
import {
  SettingsActionButton,
  SettingsSection,
  SettingsTab,
} from "@/components/settings/settings-primitives"
import {
  detectBackupSourceApp,
  parseChatvoiceBackup,
  type ChatvoiceImport,
} from "@/lib/chatvoice/chatvoice-import"
import { deleteAllLocalData } from "@/lib/peepochat/local-data"
import { clearAllOnboardingState } from "@/lib/peepochat/onboarding-storage"
import { usePeepochatSettings } from "@/lib/peepochat/peepochat-context"
import {
  exportConfigBackup,
  parseBackupPreview,
  type BackupPreview,
} from "@/lib/peepochat/peepochat-config"
import { useTtsPlayback, useTtsSession } from "@/lib/tts/tts-context"
import { cn } from "@/lib/utils"

const BLOB_URL_REVOKE_DELAY_MS = 30_000

const INCLUDED_IN_BACKUP: {
  icon: LucideIcon
  title: string
  description: string
}[] = [
  {
    icon: UserIcon,
    title: "Account",
    description: "Your Twitch ID, display name, and profile image.",
  },
  {
    icon: HashIcon,
    title: "Channels",
    description: "Your channel list, splits, and sidebar order.",
  },
  {
    icon: SlidersHorizontalIcon,
    title: "Preferences",
    description: "Appearance, chat, player, and notification settings.",
  },
  {
    icon: BellRingIcon,
    title: "Custom sounds",
    description: "Your ping and live notification sounds.",
  },
  {
    icon: AudioLinesIcon,
    title: "Chatvoice",
    description: "Settings, voice profiles, chatter voices, and sound clips.",
  },
]

type PendingImport =
  | {
      source: "peepochat"
      fileName: string
      payload: string
      preview: BackupPreview
    }
  | {
      source: "chatvoice"
      fileName: string
      imported: ChatvoiceImport
    }

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof SyntaxError) {
    return "This file isn't a valid backup. Choose a .json file exported from Peepochat or Chatvoice."
  }
  return error instanceof Error && error.message ? error.message : fallback
}

function localDateStamp(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function IconTile({
  icon: Icon,
  tone = "default",
}: {
  icon: LucideIcon
  tone?: "default" | "primary" | "destructive"
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md",
        tone === "primary" && "bg-primary/10 text-primary",
        tone === "destructive" && "bg-destructive/10 text-destructive",
        tone === "default" && "bg-muted text-muted-foreground"
      )}
    >
      <Icon className="size-4" />
    </div>
  )
}

function ExportCard() {
  const { config } = usePeepochatSettings()
  const [exporting, setExporting] = React.useState(false)

  const downloadBackup = async () => {
    setExporting(true)
    try {
      const backup = await exportConfigBackup(config)
      const blob = new Blob([backup], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `peepochat-backup-${localDateStamp(new Date())}.json`
      link.click()
      window.setTimeout(
        () => URL.revokeObjectURL(url),
        BLOB_URL_REVOKE_DELAY_MS
      )
    } catch (error) {
      toast.error(errorMessage(error, "Backup export failed"))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-center gap-3 px-3 py-3">
        <IconTile icon={ArchiveIcon} tone="primary" />
        <div className="min-w-0 flex-1">
          <div className="text-sm leading-tight font-medium">
            Export a backup
          </div>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            Download your whole setup as a single file to keep a copy or move to
            another browser.
          </p>
        </div>
        <SettingsActionButton
          className="shrink-0"
          disabled={exporting}
          onClick={() => void downloadBackup()}
        >
          <DownloadIcon className="size-3.5" />
          {exporting ? "Exporting…" : "Export"}
        </SettingsActionButton>
      </div>

      <div className="border-t border-border bg-muted/20 px-3 py-3">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          What's included
        </p>
        <ul className="mt-2 grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
          {INCLUDED_IN_BACKUP.map((item) => (
            <li key={item.title} className="flex min-w-0 gap-2.5">
              <item.icon
                className="mt-px size-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <div className="min-w-0">
                <div className="text-xs leading-tight font-medium">
                  {item.title}
                </div>
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex gap-2 border-t border-border/60 pt-2.5 text-xs leading-snug text-muted-foreground">
          <ShieldCheckIcon className="mt-px size-3.5 shrink-0" aria-hidden />
          Sign-in tokens are never saved in backups. You'll need to sign in
          again when restoring on a new browser.
        </p>
      </div>
    </div>
  )
}

function ImportDropZone({ onFile }: { onFile: (file: File) => void }) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = React.useState(false)

  const hasFiles = (event: React.DragEvent) =>
    Array.from(event.dataTransfer.types).includes("Files")

  return (
    <>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={(event) => {
          if (!hasFiles(event)) return
          event.preventDefault()
          setDragging(true)
        }}
        onDragOver={(event) => {
          if (!hasFiles(event)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = "copy"
        }}
        onDragLeave={(event) => {
          const next = event.relatedTarget
          if (next instanceof Node && event.currentTarget.contains(next)) {
            return
          }
          setDragging(false)
        }}
        onDrop={(event) => {
          if (!hasFiles(event)) return
          event.preventDefault()
          setDragging(false)
          const file = event.dataTransfer.files[0]
          if (file) onFile(file)
        }}
        className={cn(
          "flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border bg-background hover:border-foreground/25 hover:bg-muted/20"
        )}
      >
        <div
          aria-hidden
          className={cn(
            "flex size-9 items-center justify-center rounded-full transition-colors",
            dragging
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground"
          )}
        >
          <UploadIcon className="size-4" />
        </div>
        <div>
          <div className="text-sm leading-tight font-medium">
            {dragging ? "Drop to review" : "Choose a backup file"}
          </div>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            Or drag one here. Compatible with Peepochat and Chatvoice backups.
          </p>
        </div>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) onFile(file)
        }}
      />
    </>
  )
}

function ImportReview({
  pending,
  busy,
  onConfirm,
  onCancel,
}: {
  pending: PendingImport
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const isChatvoice = pending.source === "chatvoice"

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-center gap-3 border-b border-border px-3 py-2.5">
        <IconTile
          icon={isChatvoice ? AudioLinesIcon : FileJsonIcon}
          tone="primary"
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm leading-tight font-medium">
            {isChatvoice ? "Chatvoice backup" : "Peepochat backup"}
          </div>
          <p
            className="mt-0.5 truncate text-xs leading-snug text-muted-foreground"
            title={pending.fileName}
          >
            {pending.fileName}
          </p>
        </div>
      </div>

      <div className="px-3 py-3">
        {pending.source === "chatvoice" ? (
          <ChatvoiceImportSummary
            imported={pending.imported}
            chipClassName="bg-muted/60"
          />
        ) : (
          <BackupPreviewSummary
            preview={pending.preview}
            chipClassName="bg-muted/60"
          />
        )}
      </div>

      <div className="space-y-2.5 border-t border-border bg-muted/20 px-3 py-2.5">
        <p className="flex gap-2 text-xs leading-snug text-muted-foreground">
          <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden />
          {isChatvoice
            ? "Your current Chatvoice settings will be replaced, and new channels will be added to your sidebar."
            : "All of your current settings will be replaced. You'll stay signed in if the backup is from the account you're using now."}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <SettingsActionButton
            variant="outline"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </SettingsActionButton>
          <SettingsActionButton disabled={busy} onClick={onConfirm}>
            <DownloadIcon className="size-3.5" />
            {busy
              ? isChatvoice
                ? "Importing…"
                : "Restoring…"
              : isChatvoice
                ? "Import settings"
                : "Restore backup"}
          </SettingsActionButton>
        </div>
      </div>
    </div>
  )
}

function ImportSection() {
  const { restoreBackup, importChatvoiceBackup } = usePeepochatSettings()
  const { clearQueue } = useTtsPlayback()
  const [pending, setPending] = React.useState<PendingImport | null>(null)
  const [busy, setBusy] = React.useState(false)
  const readTokenRef = React.useRef(0)

  const handleFile = async (file: File) => {
    const token = ++readTokenRef.current
    try {
      const payload = await file.text()
      if (token !== readTokenRef.current) return
      const next: PendingImport =
        detectBackupSourceApp(payload) === "chatvoice"
          ? {
              source: "chatvoice",
              fileName: file.name,
              imported: parseChatvoiceBackup(payload),
            }
          : {
              source: "peepochat",
              fileName: file.name,
              payload,
              preview: parseBackupPreview(payload),
            }
      setPending(next)
    } catch (error) {
      if (token !== readTokenRef.current) return
      toast.error(errorMessage(error, "Could not read backup file"))
    }
  }

  const handleConfirm = async () => {
    if (!pending) return

    setBusy(true)
    try {
      clearQueue()
      if (pending.source === "chatvoice") {
        await importChatvoiceBackup(pending.imported)
        toast.success("Your Chatvoice settings have been imported.")
      } else {
        await restoreBackup(pending.payload)
        toast.success("Your backup has been restored.")
      }
      setPending(null)
    } catch (error) {
      toast.error(
        errorMessage(
          error,
          pending.source === "chatvoice"
            ? "Chatvoice import failed"
            : "Backup restore failed"
        )
      )
    } finally {
      setBusy(false)
    }
  }

  const handleCancel = () => {
    readTokenRef.current += 1
    setPending(null)
  }

  return pending ? (
    <ImportReview
      pending={pending}
      busy={busy}
      onConfirm={() => void handleConfirm()}
      onCancel={handleCancel}
    />
  ) : (
    <ImportDropZone onFile={(file) => void handleFile(file)} />
  )
}

function DeleteAllDataCard() {
  const { stopTts } = useTtsSession()
  const [confirming, setConfirming] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  const handleDelete = () => {
    setDeleting(true)
    stopTts()
    clearAllOnboardingState()
    void deleteAllLocalData().finally(() => {
      window.location.reload()
    })
  }

  return (
    <div className="overflow-hidden rounded-lg border border-destructive/30 bg-background">
      <div className="flex items-center gap-3 px-3 py-3">
        <IconTile icon={TriangleAlertIcon} tone="destructive" />
        <div className="min-w-0 flex-1">
          <div className="text-sm leading-tight font-medium">
            Delete all data
          </div>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            Removes your settings, channels, sounds, and Chatvoice data from
            this browser, then reloads Peepochat.
          </p>
        </div>
        {!confirming ? (
          <SettingsActionButton
            variant="destructive"
            className="shrink-0"
            onClick={() => setConfirming(true)}
          >
            <Trash2Icon className="size-3.5" />
            Delete
          </SettingsActionButton>
        ) : null}
      </div>

      {confirming ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-destructive/20 bg-destructive/5 px-3 py-2.5"
        >
          <p className="min-w-0 flex-1 text-xs leading-snug text-destructive">
            This can't be undone. Export a backup first if you might want your
            setup back.
          </p>
          <div className="flex shrink-0 gap-2">
            <SettingsActionButton
              variant="outline"
              disabled={deleting}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </SettingsActionButton>
            <SettingsActionButton
              variant="destructive"
              disabled={deleting}
              onClick={handleDelete}
            >
              <Trash2Icon className="size-3.5" />
              {deleting ? "Deleting…" : "Delete everything"}
            </SettingsActionButton>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function DataManagementTab() {
  return (
    <SettingsTab>
      <SettingsSection title="Backup">
        <ExportCard />
      </SettingsSection>

      <SettingsSection
        title="Restore or import"
        description="Restore a Peepochat or Chatvoice backup. You'll get to preview the backup before making changes."
      >
        <ImportSection />
      </SettingsSection>

      <SettingsSection title="Danger zone">
        <DeleteAllDataCard />
      </SettingsSection>
    </SettingsTab>
  )
}
