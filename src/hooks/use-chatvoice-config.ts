import * as React from "react"

import {
  type AppConfig,
  createDefaultConfig,
  importConfigBackup,
  loadConfig,
  needsOnboardingForConfig,
  saveConfig,
} from "@/lib/chatvoice-config"

export function useChatvoiceConfig() {
  const [config, setConfig] = React.useState<AppConfig>(() =>
    createDefaultConfig()
  )
  const [ready, setReady] = React.useState(false)
  const [needsOnboarding, setNeedsOnboarding] = React.useState(false)

  React.useEffect(() => {
    const loaded = loadConfig()
    setConfig(loaded)
    setNeedsOnboarding(needsOnboardingForConfig(loaded))
    setReady(true)
  }, [])

  React.useEffect(() => {
    if (!ready) return
    setNeedsOnboarding(needsOnboardingForConfig(config))
  }, [ready, config])

  const updateConfig = React.useCallback(
    (updater: AppConfig | ((current: AppConfig) => AppConfig)) => {
      setConfig((current) => {
        const nextConfig =
          typeof updater === "function"
            ? (updater as (value: AppConfig) => AppConfig)(current)
            : updater

        saveConfig(nextConfig)
        return nextConfig
      })
    },
    []
  )

  const restoreBackup = React.useCallback(async (payload: string) => {
    const restored = importConfigBackup(payload)
    saveConfig(restored)
    const loaded = loadConfig()
    setConfig(loaded)
    setNeedsOnboarding(needsOnboardingForConfig(loaded))
    return restored
  }, [])

  const completeOnboarding = React.useCallback(() => {
    setNeedsOnboarding(false)
  }, [])

  const requireOnboarding = React.useCallback(() => {
    setNeedsOnboarding(true)
  }, [])

  return {
    config,
    ready,
    needsOnboarding,
    completeOnboarding,
    requireOnboarding,
    updateConfig,
    restoreBackup,
  }
}
