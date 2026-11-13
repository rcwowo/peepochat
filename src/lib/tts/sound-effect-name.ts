export function normalizeSoundEffectName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
}

export function uniqueSoundEffectName(
  base: string,
  existingNames: Iterable<string>
): string {
  const normalized = normalizeSoundEffectName(base) || "sound"
  const taken = new Set(existingNames)

  if (!taken.has(normalized)) {
    return normalized
  }

  let suffix = 2
  while (taken.has(`${normalized}_${suffix}`)) {
    suffix += 1
  }

  return `${normalized}_${suffix}`
}
