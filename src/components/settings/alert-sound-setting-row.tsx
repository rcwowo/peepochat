import * as React from "react"
import { Music2Icon, PlayIcon, UploadIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { playAlertSound } from "@/lib/highlights/alert-sounds"
import {
  deleteCustomSound,
  getCustomSound,
  saveCustomSound,
} from "@/lib/highlights/custom-sounds"

type AlertSoundSettingRowProps = {
  title: string
  description: string
  customId: string | null
  onCustomIdChange: (customId: string | null) => void
  otherCustomId?: string | null
}

export function AlertSoundSettingRow({
  title,
  description,
  customId,
  onCustomIdChange,
  otherCustomId = null,
}: AlertSoundSettingRowProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [customName, setCustomName] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!customId) {
      setCustomName(null)
      return
    }

    let cancelled = false
    void getCustomSound(customId).then((record) => {
      if (!cancelled) {
        setCustomName(record?.name ?? "Custom sound")
      }
    })

    return () => {
      cancelled = true
    }
  }, [customId])

  const handleUpload = async (file: File | undefined) => {
    if (!file) return

    try {
      const previousId = customId
      const record = await saveCustomSound(file)
      onCustomIdChange(record.id)
      setCustomName(record.name)

      if (
        previousId &&
        previousId !== record.id &&
        previousId !== otherCustomId
      ) {
        await deleteCustomSound(previousId).catch(() => undefined)
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to upload sound"
      )
    }
  }

  const soundLabel = customId ? customName ?? "Custom sound" : "Default sound"

  return (
    <div className="px-2.5 py-2.5">
      <div className="mb-2">
        <p className="text-sm font-medium leading-tight">{title}</p>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
          {description}
        </p>
      </div>

      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border bg-muted/25 px-2.5 py-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background">
          <Music2Icon className="size-3.5 text-muted-foreground" />
        </div>

        <p className="truncate text-xs text-foreground" title={soundLabel}>
          {soundLabel}
        </p>

        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-foreground"
            onClick={() =>
              void playAlertSound({ useDefaultSounds: false, customId })
            }
            aria-label={`Preview ${title.toLowerCase()}`}
          >
            <PlayIcon className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => inputRef.current?.click()}
            aria-label={`Upload ${title.toLowerCase()}`}
          >
            <UploadIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          void handleUpload(file)
          event.target.value = ""
        }}
      />
    </div>
  )
}
