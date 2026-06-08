export type LandingFooterLink = {
  href: string
  label: string
}

export const RCW_URL = "https://rcw.lol"

export const LANDING_FOOTER_LINKS: LandingFooterLink[] = [
  { href: "https://bsky.app/profile/rcw.lol", label: "Bluesky" },
  { href: "https://gitlab.com/rcw.lol/peepochat", label: "Source Code" },
  { href: "riley@rcw.lol", label: "Support Email" },
]

export function getLandingFooterHref(href: string, label: string) {
  return label === "Support Email" ? `mailto:${href}` : href
}

export function isLandingFooterLinkExternal(href: string) {
  return href.startsWith("http") || href.startsWith("mailto:")
}
