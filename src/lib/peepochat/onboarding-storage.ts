import {
  hasAccount,
  isLoggedOutWithSavedSetup,
  type AppConfig,
} from "@/lib/peepochat/peepochat-config"

export type OnboardingFlow = "fresh" | "import"

const FLOW_KEY = "peepochat::onboarding_flow"
const IMPORT_APPLIED_KEY = "peepochat::onboarding_import_applied"
const BOOKMARK_DISMISSED_KEY = "peepochat::bookmark_prompt_dismissed"

function readSession(key: string): string | null {
  if (typeof window === "undefined") return null
  return window.sessionStorage.getItem(key)
}

function writeSession(key: string, value: string | null) {
  if (typeof window === "undefined") return
  if (value === null) {
    window.sessionStorage.removeItem(key)
    return
  }
  window.sessionStorage.setItem(key, value)
}

export function getOnboardingFlow(): OnboardingFlow | null {
  const value = readSession(FLOW_KEY)
  return value === "fresh" || value === "import" ? value : null
}

export function setOnboardingFlow(flow: OnboardingFlow) {
  writeSession(FLOW_KEY, flow)
}

export function isImportOnboardingApplied(): boolean {
  return readSession(IMPORT_APPLIED_KEY) === "1"
}

export function markImportOnboardingApplied() {
  writeSession(IMPORT_APPLIED_KEY, "1")
}

export function hasDismissedBookmarkPrompt(): boolean {
  if (typeof window === "undefined") return true
  return window.localStorage.getItem(BOOKMARK_DISMISSED_KEY) === "1"
}

export function dismissBookmarkPrompt() {
  if (typeof window === "undefined") return
  window.localStorage.setItem(BOOKMARK_DISMISSED_KEY, "1")
}

/** Fresh setup with a channel added but bookmark not dismissed yet. */
export function isAwaitingFreshSetupBookmark(config: AppConfig): boolean {
  if (typeof window === "undefined") return false
  if (hasDismissedBookmarkPrompt()) return false
  if (isLoggedOutWithSavedSetup(config)) return false
  if (getOnboardingFlow() !== "fresh") return false
  return hasAccount(config) && config.twitch.channels.length > 0
}

export function clearOnboardingSession() {
  writeSession(FLOW_KEY, null)
  writeSession(IMPORT_APPLIED_KEY, null)
}

/** Clears all persisted onboarding progress (session flow + bookmark prompt). */
export function clearAllOnboardingState() {
  clearOnboardingSession()
  if (typeof window === "undefined") return
  window.localStorage.removeItem(BOOKMARK_DISMISSED_KEY)
}
