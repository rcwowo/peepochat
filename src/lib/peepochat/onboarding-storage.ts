import { getDesktopNotificationPermission } from "@/lib/highlights/desktop-notifications"
import {
  hasAccount,
  isLoggedOutWithSavedSetup,
  type AppConfig,
} from "@/lib/peepochat/peepochat-config"

export type OnboardingFlow = "fresh" | "import"

const FLOW_KEY = "peepochat::onboarding_flow"
const IMPORT_APPLIED_KEY = "peepochat::onboarding_import_applied"
const FINAL_STEP_DISMISSED_KEY = "peepochat::bookmark_prompt_dismissed"

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

export function hasDismissedOnboardingFinalStep(): boolean {
  if (typeof window === "undefined") return true
  return window.localStorage.getItem(FINAL_STEP_DISMISSED_KEY) === "1"
}

export function dismissOnboardingFinalStep() {
  if (typeof window === "undefined") return
  window.localStorage.setItem(FINAL_STEP_DISMISSED_KEY, "1")
}

export function isAwaitingOnboardingFinalStep(config: AppConfig): boolean {
  if (typeof window === "undefined") return false
  if (hasDismissedOnboardingFinalStep()) return false
  if (isLoggedOutWithSavedSetup(config)) return false

  const flow = getOnboardingFlow()
  if (flow !== "fresh" && flow !== "import") return false
  if (!hasAccount(config) || config.twitch.channels.length === 0) return false

  if (flow === "import" && getDesktopNotificationPermission() === "granted") {
    return false
  }

  return true
}

export function clearOnboardingSession() {
  writeSession(FLOW_KEY, null)
  writeSession(IMPORT_APPLIED_KEY, null)
}

export function clearAllOnboardingState() {
  clearOnboardingSession()
  if (typeof window === "undefined") return
  window.localStorage.removeItem(FINAL_STEP_DISMISSED_KEY)
}
