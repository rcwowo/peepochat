import * as React from "react"

import {
  type AppConfig,
  loadConfig,
  mergeRestoredConfig,
  needsOnboardingForConfig,
  parseBackupPayload,
  saveConfig,
} from "@/lib/peepochat/peepochat-config"
import { restoreEmbeddedCustomSounds } from "@/lib/highlights/custom-sounds"
import {
  applyChatvoiceImport,
  fetchChannelProfiles,
  getNewChatvoiceChannels,
  type ChatvoiceImport,
} from "@/lib/chatvoice/chatvoice-import"
import { isAwaitingOnboardingFinalStep } from "@/lib/peepochat/onboarding-storage"
import { getTwitchClientId } from "@/lib/twitch/auth/oauth"
import {
  replaceTtsData,
  replaceVoiceAssignments,
  restoreSoundEffectAudioBackups,
} from "@/lib/tts/tts-db"

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
  const [, refreshOnboardingGate] = React.useReducer(
    (revision: number) => revision + 1,
    0
  )
  const pendingSaveRef = React.useRef<AppConfig | null>(null)
  const saveHandleRef = React.useRef<number | null>(null)
  const savedConfigRef = React.useRef(config)
  const configRef = React.useRef(config)
  React.useEffect(() => {
    configRef.current = config
  }, [config])

  const needsOnboarding =
    forceOnboarding ||
    needsOnboardingForConfig(config) ||
    isAwaitingOnboardingFinalStep(config)

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

  React.useEffect(() => {
    if (config === savedConfigRef.current) {
      return
    }
    savedConfigRef.current = config
    queueSave(config)
  }, [config, queueSave])

  const updateConfig = React.useCallback(
    (updater: AppConfig | ((current: AppConfig) => AppConfig)) => {
      setConfig(updater)
    },
    []
  )

  const restoreBackup = React.useCallback(async (payload: string) => {
    const {
      config: restored,
      embeddedSounds,
      tts,
    } = parseBackupPayload(payload)
    if (embeddedSounds.length > 0) {
      await restoreEmbeddedCustomSounds(embeddedSounds)
    }
    if (tts.assignments) {
      await replaceVoiceAssignments(tts.assignments)
    }
    if (tts.soundEffects) {
      await restoreSoundEffectAudioBackups(tts.soundEffects)
    }
    pendingSaveRef.current = null
    if (saveHandleRef.current !== null) {
      cancelIdle(saveHandleRef.current)
      saveHandleRef.current = null
    }

    const merged = mergeRestoredConfig(
      restored,
      configRef.current,
      getTwitchClientId()
    )
    savedConfigRef.current = merged
    setConfig(merged)
    saveConfig(merged)
    setForceOnboarding(needsOnboardingForConfig(merged))
    return merged
  }, [])

  const importChatvoiceBackup = React.useCallback(
    async (imported: ChatvoiceImport) => {
      const profiles = await fetchChannelProfiles(
        getNewChatvoiceChannels(configRef.current, imported),
        configRef.current.twitch.account
      )
      pendingSaveRef.current = null
      if (saveHandleRef.current !== null) {
        cancelIdle(saveHandleRef.current)
        saveHandleRef.current = null
      }

      const previous = configRef.current
      const next = applyChatvoiceImport(previous, imported, profiles)
      saveConfig(next)
      try {
        await replaceTtsData(imported)
      } catch (error) {
        saveConfig(previous)
        throw error
      }

      configRef.current = next
      savedConfigRef.current = next
      setConfig(next)
      return next
    },
    []
  )

  const completeOnboarding = React.useCallback(() => {
    setForceOnboarding(false)
    refreshOnboardingGate()
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
    importChatvoiceBackup,
  }
}
