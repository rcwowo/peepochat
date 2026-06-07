const MONO_FONT_STACK =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'

const GENERIC_FONT_KEYWORDS = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "ui-rounded",
  "math",
  "emoji",
  "fangsong",
])

export const CHAT_FONT_GOOGLE_LINK_ID = "peepochat-google-font"

export type ResolvedChatFont = {
  /** Value for CSS `font-family`, or undefined to inherit the app font. */
  cssFontFamily: string | undefined
  /** Google Fonts family name to load, if any. */
  googleFontFamily: string | null
}

function quoteFontName(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return ""
  if (/["']/.test(trimmed)) return trimmed
  if (/\s/.test(trimmed)) return `"${trimmed}"`
  return trimmed
}

function isGenericFontKeyword(value: string) {
  const first = value.split(",")[0]?.trim().toLowerCase() ?? ""
  return GENERIC_FONT_KEYWORDS.has(first)
}

/** Normalize legacy preset values from older configs. */
export function migrateChatFontFamilyInput(value: string): string {
  const trimmed = value.trim()
  if (trimmed === "default") return ""
  if (trimmed === "mono") return "mono"
  return value
}

/**
 * Resolve the font-family setting into CSS and an optional Google Fonts load.
 *
 * - Empty: app default
 * - `mono`: bundled monospace stack
 * - Comma-separated list: used verbatim as a CSS font stack
 * - Generic keywords (`system-ui`, `sans-serif`, …): CSS only
 * - Otherwise: treated as a Google Fonts family name
 */
export function resolveChatFontFamily(input: string): ResolvedChatFont {
  const raw = migrateChatFontFamilyInput(input).trim()
  if (!raw) {
    return { cssFontFamily: undefined, googleFontFamily: null }
  }

  if (raw.toLowerCase() === "mono") {
    return { cssFontFamily: MONO_FONT_STACK, googleFontFamily: null }
  }

  if (raw.includes(",")) {
    return { cssFontFamily: raw, googleFontFamily: null }
  }

  if (isGenericFontKeyword(raw)) {
    return { cssFontFamily: raw, googleFontFamily: null }
  }

  const quoted = quoteFontName(raw)
  return {
    cssFontFamily: `${quoted}, system-ui, sans-serif`,
    googleFontFamily: raw,
  }
}

export function buildGoogleFontsStylesheetUrl(family: string) {
  const encoded = encodeURIComponent(family.trim()).replace(/%20/g, "+")
  return `https://fonts.googleapis.com/css2?family=${encoded}:wght@400;500;600;700&display=swap`
}

export function applyGoogleFontLink(family: string | null) {
  if (typeof document === "undefined") return

  const existing = document.getElementById(
    CHAT_FONT_GOOGLE_LINK_ID
  ) as HTMLLinkElement | null

  if (!family) {
    existing?.remove()
    return
  }

  const href = buildGoogleFontsStylesheetUrl(family)
  if (existing) {
    if (existing.href === href) return
    existing.href = href
    return
  }

  const link = document.createElement("link")
  link.id = CHAT_FONT_GOOGLE_LINK_ID
  link.rel = "stylesheet"
  link.href = href
  document.head.appendChild(link)
}
