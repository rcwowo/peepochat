import * as React from "react"
import { Columns2Icon, HashIcon, Music2Icon, PlayIcon } from "lucide-react"

import { createEmbeddedSoundUrl } from "@/lib/highlights/custom-sounds"
import { formatBackupMeta } from "@/lib/peepochat/backup-format"
import type {
  BackupPreview,
  BackupPreviewSound,
} from "@/lib/peepochat/peepochat-config"
import { cn } from "@/lib/utils"

const MAX_VISIBLE_SIDEBAR_ITEMS = 6

export function BackupSummaryLabel({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <p className="shrink-0 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  )
}

export function BackupSummaryRow({
  label,
  value,
  muted = false,
}: {
  label: string
  value: React.ReactNode
  muted?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <BackupSummaryLabel>{label}</BackupSummaryLabel>
      <p
        className={cn(
          "truncate text-right text-sm",
          muted ? "text-muted-foreground" : "font-medium"
        )}
      >
        {value}
      </p>
    </div>
  )
}

function EmbeddedSoundPreviewRow({
  sound,
  className,
}: {
  sound: BackupPreviewSound
  className?: string
}) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null)

  React.useEffect(() => {
    const objectUrl = createEmbeddedSoundUrl(sound.mimeType, sound.data)
    audioRef.current = new Audio(objectUrl)

    return () => {
      audioRef.current?.pause()
      audioRef.current = null
      URL.revokeObjectURL(objectUrl)
    }
  }, [sound])

  const handlePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = 0
    void audio.play().catch(() => undefined)
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md bg-card px-2.5 py-1.5",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Music2Icon
          className="size-3 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <span className="truncate text-xs" title={sound.name}>
          {sound.name}
        </span>
      </div>
      <button
        type="button"
        onClick={handlePlay}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
        aria-label={`Preview ${sound.name}`}
      >
        <PlayIcon className="size-3" aria-hidden />
      </button>
    </div>
  )
}

export function BackupPreviewSummary({
  preview,
  chipClassName,
}: {
  preview: BackupPreview
  chipClassName?: string
}) {
  const meta = formatBackupMeta(preview.exportedAt, preview.appVersion)
  const visibleItems = preview.sidebarItems.slice(0, MAX_VISIBLE_SIDEBAR_ITEMS)
  const hiddenItemCount = preview.sidebarItems.length - visibleItems.length
  const fromLabel =
    preview.accountDisplayName?.trim() || preview.accountLogin || null

  return (
    <div className="space-y-3">
      {fromLabel ? <BackupSummaryRow label="From" value={fromLabel} /> : null}

      {meta ? <BackupSummaryRow label="Backup" value={meta} muted /> : null}

      <BackupSummaryRow label="Ping rules" value={preview.pingRuleCount} />

      {preview.embeddedSounds.length > 0 ? (
        <div>
          <BackupSummaryLabel>Custom sounds</BackupSummaryLabel>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {preview.embeddedSounds.map((sound) => (
              <EmbeddedSoundPreviewRow
                key={sound.id}
                sound={sound}
                className={chipClassName}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <BackupSummaryLabel>Channels</BackupSummaryLabel>
        {preview.channelCount === 0 ? (
          <p className="mt-1.5 text-sm text-muted-foreground">None</p>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {visibleItems.map((item, index) =>
              item.type === "split" ? (
                <span
                  key={`split-${item.names.join("-")}-${index}`}
                  className={cn(
                    "inline-flex max-w-full items-center gap-1 rounded-md bg-card px-2 py-1 text-xs",
                    chipClassName
                  )}
                  title={item.names.map((name) => `#${name}`).join(" · ")}
                >
                  <Columns2Icon
                    className="size-3 shrink-0 text-primary"
                    aria-hidden
                  />
                  <span className="truncate">
                    {item.names.map((name, nameIndex) => (
                      <React.Fragment key={`${name}-${nameIndex}`}>
                        {nameIndex > 0 ? (
                          <span className="text-muted-foreground"> · </span>
                        ) : null}
                        <span>{name}</span>
                      </React.Fragment>
                    ))}
                  </span>
                </span>
              ) : (
                <span
                  key={`channel-${item.name}-${index}`}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md bg-card px-2 py-1 text-xs",
                    chipClassName
                  )}
                >
                  <HashIcon
                    className="size-3 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  {item.name}
                </span>
              )
            )}
            {hiddenItemCount > 0 ? (
              <span className="inline-flex items-center px-1.5 py-1 text-xs text-muted-foreground">
                +{hiddenItemCount} more
              </span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
