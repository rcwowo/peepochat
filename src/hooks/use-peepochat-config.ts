import * as React from "react"

import {
  type AppConfig,
  createDefaultConfig,
  importConfigBackup,
  loadConfig,
  needsOnboardingForConfig,
  saveConfig,
} from "@/lib/peepochat-config"

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
  const [config, setConfig] = React.useState<AppConfig>(() =>
    createDefaultConfig()
  )
  const [ready, setReady] = React.useState(false)
  const [needsOnboarding, setNeedsOnboarding] = React.useState(false)
  const pendingSaveRef = React.useRef<AppConfig | null>(null)
  const saveHandleRef = React.useRef<number | null>(null)

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
    const loaded = loadConfig()
    setConfig(loaded)
    setNeedsOnboarding(needsOnboardingForConfig(loaded))
    setReady(true)
  }, [])

  React.useEffect(() => {
    if (!ready) return
    setNeedsOnboarding(needsOnboardingForConfig(config))
  }, [ready, config])

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

  const restoreBackup = React.useCallback(
    async (payload: string) => {
      const restored = importConfigBackup(payload)
      pendingSaveRef.current = null
      if (saveHandleRef.current !== null) {
        cancelIdle(saveHandleRef.current)
        saveHandleRef.current = null
      }
      saveConfig(restored)
      setConfig(restored)
      setNeedsOnboarding(needsOnboardingForConfig(restored))
      return restored
    },
    []
  )

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
