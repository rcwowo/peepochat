export function formatBackupDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export function formatBackupMeta(
  exportedAt: string | null,
  appVersion: string | null
): string | null {
  const parts = [
    formatBackupDate(exportedAt),
    appVersion ? `v${appVersion}` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : null
}
