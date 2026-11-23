import { HashIcon, InfoIcon } from "lucide-react"

import {
  BackupSummaryLabel,
  BackupSummaryRow,
} from "@/components/backup/backup-preview-summary"
import {
  summarizeChatvoiceImport,
  type ChatvoiceImport,
} from "@/lib/chatvoice/chatvoice-import"
import { formatBackupMeta } from "@/lib/peepochat/backup-format"
import { cn } from "@/lib/utils"

const MAX_VISIBLE_CHANNELS = 6

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function ChatvoiceImportSummary({
  imported,
  chipClassName,
}: {
  imported: ChatvoiceImport
  chipClassName?: string
}) {
  const summary = summarizeChatvoiceImport(imported)
  const meta = formatBackupMeta(imported.exportedAt, imported.appVersion)
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
      {meta ? <BackupSummaryRow label="Backup" value={meta} muted /> : null}

      <BackupSummaryRow
        label="Voices"
        value={`${pluralize(summary.voiceProfileCount, "profile")} · ${pluralize(summary.assignmentCount, "chatter")} assigned`}
      />

      <BackupSummaryRow
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

      <BackupSummaryRow
        label="Filters"
        value={filterParts.length > 0 ? filterParts.join(" · ") : "None"}
        muted={filterParts.length === 0}
      />

      <BackupSummaryRow
        label="Chat commands"
        value={
          summary.enabledCommandCount > 0
            ? `${summary.enabledCommandCount} enabled`
            : "None enabled"
        }
        muted={summary.enabledCommandCount === 0}
      />

      <div>
        <BackupSummaryLabel>Channels</BackupSummaryLabel>
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
