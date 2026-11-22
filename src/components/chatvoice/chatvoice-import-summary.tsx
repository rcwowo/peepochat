import type * as React from "react"
import { HashIcon, InfoIcon } from "lucide-react"

import {
  summarizeChatvoiceImport,
  type ChatvoiceImport,
} from "@/lib/chatvoice/chatvoice-import"
import { cn } from "@/lib/utils"

const MAX_VISIBLE_CHANNELS = 6

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function formatBackupDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function SummaryRow({
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
      <p className="shrink-0 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
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

export function ChatvoiceImportSummary({
  imported,
  chipClassName,
}: {
  imported: ChatvoiceImport
  chipClassName?: string
}) {
  const summary = summarizeChatvoiceImport(imported)
  const exportedLabel = formatBackupDate(imported.exportedAt)
  const metaParts = [
    exportedLabel,
    imported.appVersion ? `v${imported.appVersion}` : null,
  ].filter(Boolean)
  const visibleChannels = imported.channels.slice(0, MAX_VISIBLE_CHANNELS)
  const hiddenChannelCount = imported.channels.length - visibleChannels.length
  const filterParts = [
    summary.wordReplacementCount > 0
      ? pluralize(summary.wordReplacementCount, "replacement")
      : null,
    summary.blockedUserCount > 0
      ? pluralize(summary.blockedUserCount, "blocked user")
      : null,
    summary.blockedTermCount > 0
      ? pluralize(summary.blockedTermCount, "blocked term")
      : null,
  ].filter(Boolean)

  return (
    <div className="space-y-3">
      {metaParts.length > 0 ? (
        <SummaryRow label="Backup" value={metaParts.join(" · ")} muted />
      ) : null}

      <SummaryRow
        label="Voices"
        value={`${pluralize(summary.voiceProfileCount, "profile")} · ${pluralize(summary.assignmentCount, "chatter")} assigned`}
      />

      <SummaryRow
        label="Sounds"
        value={
          summary.soundEffectCount === 0
            ? "None"
            : summary.soundEffectAudioCount === summary.soundEffectCount
              ? pluralize(summary.soundEffectCount, "sound")
              : `${pluralize(summary.soundEffectCount, "sound")} · ${summary.soundEffectAudioCount} with audio`
        }
        muted={summary.soundEffectCount === 0}
      />

      <SummaryRow
        label="Filters"
        value={filterParts.length > 0 ? filterParts.join(" · ") : "None"}
        muted={filterParts.length === 0}
      />

      <SummaryRow
        label="Chat commands"
        value={
          summary.enabledCommandCount > 0
            ? `${summary.enabledCommandCount} enabled`
            : "None enabled"
        }
        muted={summary.enabledCommandCount === 0}
      />

      <div>
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Channels
        </p>
        {imported.channels.length === 0 ? (
          <p className="mt-1.5 text-sm text-muted-foreground">None</p>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {visibleChannels.map((login) => (
              <span
                key={login}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md bg-card px-2 py-1 text-xs",
                  chipClassName
                )}
              >
                <HashIcon
                  className="size-3 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                {login}
              </span>
            ))}
            {hiddenChannelCount > 0 ? (
              <span className="inline-flex items-center px-1.5 py-1 text-xs text-muted-foreground">
                +{hiddenChannelCount} more
              </span>
            ) : null}
          </div>
        )}
      </div>

      {imported.adjustments.length > 0 ? (
        <ul className="space-y-1">
          {imported.adjustments.map((note) => (
            <li
              key={note}
              className="flex gap-1.5 text-xs leading-snug text-muted-foreground"
            >
              <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden />
              {note}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
