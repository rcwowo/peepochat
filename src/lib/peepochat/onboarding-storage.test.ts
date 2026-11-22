import { afterEach, describe, expect, test } from "bun:test"

import {
  clearAllOnboardingState,
  clearOnboardingSession,
  dismissOnboardingFinalStep,
  getOnboardingFlow,
  hasDismissedOnboardingFinalStep,
  isAwaitingOnboardingFinalStep,
  isImportFlow,
  isImportOnboardingApplied,
  markImportOnboardingApplied,
  setOnboardingFlow,
} from "@/lib/peepochat/onboarding-storage"
import {
  createDefaultConfig,
  saveConfig,
  type AppConfig,
} from "@/lib/peepochat/peepochat-config"

function readyConfig(): AppConfig {
  const config = createDefaultConfig()
  config.twitch.account = {
    id: "1",
    login: "viewer",
    displayName: "Viewer",
    profileImageUrl: "",
    bannerImageUrl: "",
    accessToken: "token",
    clientId: "client",
    scopes: [],
  }
  config.twitch.channels = [
    {
      login: "streamer",
      unreadIndicatorEnabled: null,
      liveNotificationsEnabled: null,
    },
  ]
  return config
}

function setNotificationPermission(permission: NotificationPermission) {
  Object.defineProperty(window, "Notification", {
    configurable: true,
    writable: true,
    value: { permission },
  })
}

afterEach(() => {
  Reflect.deleteProperty(window, "Notification")
})

describe("onboarding session state", () => {
  test("stores the flow and ignores unknown values", () => {
    expect(getOnboardingFlow()).toBeNull()

    setOnboardingFlow("import")
    expect(getOnboardingFlow()).toBe("import")

    window.sessionStorage.setItem("peepochat::onboarding_flow", "other")
    expect(getOnboardingFlow()).toBeNull()

    setOnboardingFlow("chatvoice")
    expect(getOnboardingFlow()).toBe("chatvoice")
  })

  test("treats Chatvoice migrations as imports", () => {
    expect(isImportFlow("import")).toBe(true)
    expect(isImportFlow("chatvoice")).toBe(true)
    expect(isImportFlow("fresh")).toBe(false)
    expect(isImportFlow(null)).toBe(false)
  })

  test("clearOnboardingSession resets the flow and import marker only", () => {
    setOnboardingFlow("fresh")
    markImportOnboardingApplied()
    dismissOnboardingFinalStep()
    expect(isImportOnboardingApplied()).toBe(true)

    clearOnboardingSession()

    expect(getOnboardingFlow()).toBeNull()
    expect(isImportOnboardingApplied()).toBe(false)
    expect(hasDismissedOnboardingFinalStep()).toBe(true)
  })

  test("clearAllOnboardingState also forgets the dismissed final step", () => {
    setOnboardingFlow("fresh")
    dismissOnboardingFinalStep()

    clearAllOnboardingState()

    expect(getOnboardingFlow()).toBeNull()
    expect(hasDismissedOnboardingFinalStep()).toBe(false)
  })
})

describe("isAwaitingOnboardingFinalStep", () => {
  test("is true after finishing a fresh onboarding", () => {
    setOnboardingFlow("fresh")
    expect(isAwaitingOnboardingFinalStep(readyConfig())).toBe(true)
  })

  test("is false without an onboarding flow", () => {
    expect(isAwaitingOnboardingFinalStep(readyConfig())).toBe(false)
  })

  test("is false once dismissed", () => {
    setOnboardingFlow("fresh")
    dismissOnboardingFinalStep()
    expect(isAwaitingOnboardingFinalStep(readyConfig())).toBe(false)
  })

  test("is false until logged in with a channel", () => {
    setOnboardingFlow("fresh")

    const noChannels = readyConfig()
    noChannels.twitch.channels = []
    expect(isAwaitingOnboardingFinalStep(noChannels)).toBe(false)

    const noAccount = readyConfig()
    noAccount.twitch.account = null
    expect(isAwaitingOnboardingFinalStep(noAccount)).toBe(false)
  })

  test("is false for a logged-out user with a saved setup", () => {
    setOnboardingFlow("fresh")
    const config = readyConfig()
    config.twitch.account = { ...config.twitch.account!, accessToken: "" }
    saveConfig(config)

    expect(isAwaitingOnboardingFinalStep(config)).toBe(false)
  })

  test("skips the final step for imports when notifications are already granted", () => {
    setOnboardingFlow("import")
    setNotificationPermission("granted")
    expect(isAwaitingOnboardingFinalStep(readyConfig())).toBe(false)

    setNotificationPermission("default")
    expect(isAwaitingOnboardingFinalStep(readyConfig())).toBe(true)
  })

  test("applies the same final step rules to Chatvoice migrations", () => {
    setOnboardingFlow("chatvoice")
    setNotificationPermission("granted")
    expect(isAwaitingOnboardingFinalStep(readyConfig())).toBe(false)

    setNotificationPermission("default")
    expect(isAwaitingOnboardingFinalStep(readyConfig())).toBe(true)
  })
})
