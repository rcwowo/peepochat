import * as React from "react"

import {
  type AppConfig,
  importConfigBackup,
  loadConfig,
  mergeRestoredConfig,
  needsOnboardingForConfig,
  saveConfig,
} from "@/lib/peepochat/peepochat-config"
import { getTwitchClientId } from "@/lib/twitch/twitch-oauth"

type IdleScheduler = (cb: () => void) => number
type IdleCanceler = (handle: number) => void

const scheduleIdle: IdleScheduler =
  typeof window !== "undefined" &&
  typeof (window as typeof window & { requestIdleCallback?: IdleScheduler })
    .requestIdleCallback === "function"
    ? (
        window as typeof window & { requestIdleCallback: IdleScheduler }
      ).requestIdleCallback.bind(window)
    : (cb) => window.setTimeout(cb, 0)

const cancelIdle: IdleCanceler =
  typeof window !== "undefined" &&
  typeof (window as typeof window & { cancelIdleCallback?: IdleCanceler })
    .cancelIdleCallback === "function"
    ? (
        window as typeof window & { cancelIdleCallback: IdleCanceler }
      ).cancelIdleCallback.bind(window)
    : (handle) => window.clearTimeout(handle)

export function usePeepochatConfig() {
  const [config, setConfig] = React.useState<AppConfig>(() => loadConfig())
  const [forceOnboarding, setForceOnboarding] = React.useState(false)
  const pendingSaveRef = React.useRef<AppConfig | null>(null)
  const saveHandleRef = React.useRef<number | null>(null)

  const needsOnboarding =
    forceOnboarding || needsOnboardingForConfig(config)

  const flushPendingSave = React.useCallback(() => {
    if (saveHandleRef.current !== null) {
      cancelIdle(saveHandleRef.current)
      saveHandleRef.current = null
    }
    const pending = pendingSaveRef.current
    if (pending) {
      pendingSaveRef.current = null
      saveConfig(pending)
    }
  }, [])

  const queueSave = React.useCallback((next: AppConfig) => {
    pendingSaveRef.current = next
    if (saveHandleRef.current !== null) {
      return
    }
    saveHandleRef.current = scheduleIdle(() => {
      saveHandleRef.current = null
      const pending = pendingSaveRef.current
      if (!pending) return
      pendingSaveRef.current = null
      saveConfig(pending)
    })
  }, [])

  React.useEffect(() => {
    if (typeof window === "undefined") return

    const handleFlush = () => flushPendingSave()
    window.addEventListener("pagehide", handleFlush)
    window.addEventListener("beforeunload", handleFlush)
    document.addEventListener("visibilitychange", handleFlush)

    return () => {
      window.removeEventListener("pagehide", handleFlush)
      window.removeEventListener("beforeunload", handleFlush)
      document.removeEventListener("visibilitychange", handleFlush)
      flushPendingSave()
    }
  }, [flushPendingSave])

  const updateConfig = React.useCallback(
    (updater: AppConfig | ((current: AppConfig) => AppConfig)) => {
      setConfig((current) => {
        const nextConfig =
          typeof updater === "function"
            ? (updater as (value: AppConfig) => AppConfig)(current)
            : updater

        if (nextConfig === current) {
          return current
        }

        queueSave(nextConfig)
        return nextConfig
      })
    },
    [queueSave]
  )

  const restoreBackup = React.useCallback(async (payload: string) => {
    const restored = importConfigBackup(payload)
    pendingSaveRef.current = null
    if (saveHandleRef.current !== null) {
      cancelIdle(saveHandleRef.current)
      saveHandleRef.current = null
    }

    let merged = restored
    setConfig((current) => {
      merged = mergeRestoredConfig(restored, current, getTwitchClientId())
      return merged
    })
    saveConfig(merged)
    setForceOnboarding(needsOnboardingForConfig(merged))
    return merged
  }, [])

  const completeOnboarding = React.useCallback(() => {
    setForceOnboarding(false)
  }, [])

  const requireOnboarding = React.useCallback(() => {
    setForceOnboarding(true)
  }, [])

  return {
    config,
    ready: true,
    needsOnboarding,
    completeOnboarding,
    requireOnboarding,
    updateConfig,
    restoreBackup,
  }
}
