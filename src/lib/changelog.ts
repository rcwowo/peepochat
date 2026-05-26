// ---------------------------------------------------------------------------
// Changelog entries – maintain the changelog.json in the project root.
// Add newest entries at the TOP of the array.
// The version check toast only fires when the stored "last seen" version
// differs from the current build version injected by Vite.
// ---------------------------------------------------------------------------

import changelogData from "../../changelog.json"

const APP_VERSION: string = __APP_VERSION__
const LAST_SEEN_KEY = "peepochat::last-seen-version"

export type ChangelogEntry = {
  version: string
  date: string
  items: string[]
}

/**
 * All changelog entries, newest first.
 */
export const CHANGELOG: ChangelogEntry[] = changelogData

/**
 * Returns the current app version from Vite's build-time injection.
 */
export function getAppVersion(): string {
  return APP_VERSION
}

/**
 * Returns `true` when the current build version is newer than the last
 * version the user acknowledged. On the very first visit (no stored
 * version) it returns `false` so the onboarding flow isn't disrupted.
 */
export function hasNewVersion(): boolean {
  const lastSeen = localStorage.getItem(LAST_SEEN_KEY)
  if (!lastSeen) return false // first visit – skip toast
  return lastSeen !== APP_VERSION
}

/**
 * Persist the current version so the toast won't show again until the
 * next version bump.
 */
export function markVersionSeen(): void {
  localStorage.setItem(LAST_SEEN_KEY, APP_VERSION)
}

/**
 * Called once after onboarding so first-time users don't immediately
 * see a "what's new" toast.
 */
export function initLastSeenVersion(): void {
  if (!localStorage.getItem(LAST_SEEN_KEY)) {
    localStorage.setItem(LAST_SEEN_KEY, APP_VERSION)
  }
}
