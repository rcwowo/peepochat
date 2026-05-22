const USERNAME_COLOR_CACHE = new Map<string, string>()

export function getReadableUsernameColor(color: string | null | undefined): string | undefined {
  if (!color || typeof document === "undefined") {
    return color ?? undefined
  }

  const background = getComputedStyle(document.body).backgroundColor
  const cacheKey = `${color}:${background}`
  const cached = USERNAME_COLOR_CACHE.get(cacheKey)
  if (cached) {
    return cached
  }

  const foreground = parseCssColor(color)
  const backdrop = parseCssColor(background)
  if (!foreground || !backdrop) {
    return color
  }

  const ratio = contrastRatio(foreground, backdrop)
  if (ratio >= 4.5) {
    USERNAME_COLOR_CACHE.set(cacheKey, color)
    return color
  }

  const lighten = backdrop.luminance < 0.5
  let adjusted = { ...foreground }

  for (let step = 0; step < 12; step += 1) {
    adjusted = {
      r: clamp(lighten ? adjusted.r + 18 : adjusted.r - 18),
      g: clamp(lighten ? adjusted.g + 18 : adjusted.g - 18),
      b: clamp(lighten ? adjusted.b + 18 : adjusted.b - 18),
      luminance: 0,
    }
    adjusted.luminance = relativeLuminance(adjusted)

    if (contrastRatio(adjusted, backdrop) >= 4.5) {
      const hex = rgbToHex(adjusted)
      USERNAME_COLOR_CACHE.set(cacheKey, hex)
      return hex
    }
  }

  USERNAME_COLOR_CACHE.set(cacheKey, color)
  return color
}

type RgbColor = {
  r: number
  g: number
  b: number
  luminance: number
}

function parseCssColor(value: string): RgbColor | null {
  const trimmed = value.trim()

  if (trimmed.startsWith("#")) {
    return parseHexColor(trimmed)
  }

  const rgbMatch = trimmed.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/
  )

  if (!rgbMatch) {
    return null
  }

  const rgb = {
    r: Number(rgbMatch[1]),
    g: Number(rgbMatch[2]),
    b: Number(rgbMatch[3]),
    luminance: 0,
  }
  rgb.luminance = relativeLuminance(rgb)
  return rgb
}

function parseHexColor(hex: string): RgbColor | null {
  const normalized = hex.replace("#", "")
  if (![3, 6].includes(normalized.length)) {
    return null
  }

  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized

  const rgb = {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
    luminance: 0,
  }
  rgb.luminance = relativeLuminance(rgb)
  return rgb
}

function relativeLuminance(color: Omit<RgbColor, "luminance">) {
  const channels = [color.r, color.g, color.b].map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}

function contrastRatio(foreground: RgbColor, background: RgbColor) {
  const lighter = Math.max(foreground.luminance, background.luminance)
  const darker = Math.min(foreground.luminance, background.luminance)
  return (lighter + 0.05) / (darker + 0.05)
}

function rgbToHex(color: Omit<RgbColor, "luminance">) {
  return `#${[color.r, color.g, color.b]
    .map((channel) => clamp(channel).toString(16).padStart(2, "0"))
    .join("")}`
}

function clamp(value: number) {
  return Math.min(255, Math.max(0, Math.round(value)))
}
