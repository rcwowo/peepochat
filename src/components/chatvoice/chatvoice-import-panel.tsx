import * as React from "react"
import { CloudUploadIcon, DownloadIcon } from "lucide-react"
import { toast } from "sonner"

import { ChatvoiceImportSummary } from "@/components/chatvoice/chatvoice-import-summary"
import { Button } from "@/components/ui/button"
import {
  parseChatvoiceBackup,
  type ChatvoiceImport,
} from "@/lib/chatvoice/chatvoice-import"
import { usePeepochatSettings } from "@/lib/peepochat/peepochat-context"
import { useTtsPlayback } from "@/lib/tts/tts-context"

export function ChatvoiceImportPanel({
  onImported,
}: {
  onImported?: () => void
}) {
  const { importChatvoiceBackup } = usePeepochatSettings()
  const { clearQueue } = useTtsPlayback()
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [pending, setPending] = React.useState<ChatvoiceImport | null>(null)
  const [busy, setBusy] = React.useState(false)

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setPending(parseChatvoiceBackup(await file.text()))
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not read backup file"
      )
    } finally {
      event.target.value = ""
    }
  }

  const handleImport = async () => {
    if (!pending) return

    setBusy(true)
    try {
      clearQueue()
      await importChatvoiceBackup(pending)
      setPending(null)
      toast.success("Your Chatvoice settings have been imported.")
      onImported?.()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Chatvoice import failed"
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="space-y-3">
        {pending ? (
          <>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <ChatvoiceImportSummary
                imported={pending}
                chipClassName="bg-background"
              />
            </div>
            <p className="text-xs leading-snug text-muted-foreground">
              Your current Chatvoice settings, voices, and sounds will be
              replaced. New channels are added to your sidebar. Everything else
              stays the same.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="h-7"
                disabled={busy}
                onClick={() => void handleImport()}
              >
                <DownloadIcon className="size-3.5" />
                {busy ? "Importing…" : "Import settings"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                disabled={busy}
                onClick={() => setPending(null)}
              >
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => fileInputRef.current?.click()}
          >
            <CloudUploadIcon className="size-3.5" />
            Choose Chatvoice backup
          </Button>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => void handleFile(event)}
      />
    </>
  )
}
