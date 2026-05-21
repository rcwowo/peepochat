import * as React from "react"

import {
  type AppConfig,
  createDefaultConfig,
  hasStoredConfig,
  importConfigBackup,
  loadConfig,
  saveConfig,
} from "@/lib/chatvoice-config"

export function useChatvoiceConfig() {
  const [config, setConfig] = React.useState<AppConfig>(() =>
    createDefaultConfig()
  )
  const [ready, setReady] = React.useState(false)
  const [needsOnboarding, setNeedsOnboarding] = React.useState(false)

  React.useEffect(() => {
    const isFirstRun = !hasStoredConfig()
    setConfig(loadConfig())
    setNeedsOnboarding(isFirstRun)
    setReady(true)
  }, [])

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
    setConfig(loadConfig())
    return restored
  }, [])

  const completeOnboarding = React.useCallback(() => {
    setNeedsOnboarding(false)
  }, [])

  return {
    config,
    ready,
    needsOnboarding,
    completeOnboarding,
    updateConfig,
    restoreBackup,
  }
}
