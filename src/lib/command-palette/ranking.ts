export type PaletteMatchable = {
  title: string
  keywords?: readonly string[]
}

export type PaletteSection<T extends PaletteMatchable> = {
  id: string
  order: number
  items: T[]
  boost?: number
  showWhenEmpty?: boolean
  keepItemOrder?: boolean
  kind?: "channel"
  subject?: readonly string[]
}

export type RankedPaletteSection<
  T extends PaletteMatchable,
  S extends PaletteSection<T>,
> = {
  section: S
  items: T[]
  score: number
}

const KEYWORD_WEIGHT = 0.85
export const FALLBACK_SECTION_BOOST = -0.5
const MAX_CHANNEL_SECTIONS = 6
const SUBJECT_MATCH_THRESHOLD = 0.6

function isSubsequence(needle: string, haystack: string) {
  let index = 0
  for (const char of haystack) {
    if (char === needle[index]) {
      index += 1
      if (index === needle.length) {
        return true
      }
    }
  }
  return false
}

export function scoreTerm(query: string, text: string): number {
  const value = text.toLowerCase()
  if (!query || !value) {
    return 0
  }
  if (value === query) {
    return 1
  }
  if (value.startsWith(query)) {
    return 0.9
  }
  if (value.split(/[^a-z0-9_]+/).some((word) => word.startsWith(query))) {
    return 0.8
  }
  if (value.includes(query)) {
    return 0.6
  }
  if (
    query.length >= 3 &&
    !query.includes(" ") &&
    isSubsequence(query, value.replace(/\s+/g, ""))
  ) {
    return 0.3
  }
  return 0
}

function bestFieldScore(query: string, item: PaletteMatchable) {
  let best = scoreTerm(query, item.title)
  for (const keyword of item.keywords ?? []) {
    const score = scoreTerm(query, keyword)
    best = Math.max(best, score === 1 ? score : score * KEYWORD_WEIGHT)
  }
  return best
}

export function scorePaletteQuery(
  query: string,
  item: PaletteMatchable
): number {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) {
    return 1
  }

  const phraseScore = bestFieldScore(tokens.join(" "), item)
  if (tokens.length === 1) {
    return phraseScore
  }

  let total = 0
  for (const token of tokens) {
    const score = bestFieldScore(token, item)
    if (score === 0) {
      return phraseScore
    }
    total += score
  }

  return Math.max(phraseScore, total / tokens.length)
}

function queryNamesSubject(query: string, subject: readonly string[]) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  const phrase = tokens.join(" ")
  return [phrase, ...tokens].some((token) =>
    subject.some((term) => scoreTerm(token, term) >= SUBJECT_MATCH_THRESHOLD)
  )
}

export function rankPaletteSections<
  T extends PaletteMatchable,
  S extends PaletteSection<T>,
>(sections: S[], rawQuery: string): RankedPaletteSection<T, S>[] {
  const query = rawQuery.trim().replace(/^#/, "")
  if (!query) {
    return sections
      .filter((section) => section.showWhenEmpty && section.items.length > 0)
      .sort((a, b) => a.order - b.order)
      .map((section) => ({ section, items: section.items, score: 0 }))
  }

  const ranked: RankedPaletteSection<T, S>[] = []
  for (const section of sections) {
    if (section.subject && !queryNamesSubject(query, section.subject)) {
      continue
    }

    const scored = section.items
      .map((item, index) => ({
        item,
        index,
        score: scorePaletteQuery(query, item),
      }))
      .filter((entry) => entry.score > 0)

    if (scored.length === 0) {
      continue
    }

    if (!section.keepItemOrder) {
      scored.sort((a, b) => b.score - a.score || a.index - b.index)
    }

    const best = Math.max(...scored.map((entry) => entry.score))
    ranked.push({
      section,
      items: scored.map((entry) => entry.item),
      score: best + (section.boost ?? 0),
    })
  }

  ranked.sort((a, b) => b.score - a.score || a.section.order - b.section.order)

  let channelSections = 0
  return ranked.filter((entry) => {
    if (entry.section.kind !== "channel") {
      return true
    }
    channelSections += 1
    return channelSections <= MAX_CHANNEL_SECTIONS
  })
}
