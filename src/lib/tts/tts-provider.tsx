import * as React from "react"
import { toast } from "sonner"

import { useSpeechAvailability } from "@/hooks/tts/use-browser-voices"
import { useLazyRef } from "@/hooks/use-lazy-ref"
import {
  usePeepochatChat,
  usePeepochatPlayer,
  usePeepochatSettings,
} from "@/lib/peepochat/peepochat-context"
import { normalizeChannelLogin } from "@/lib/twitch/channel/channel"
import type { TwitchChatMessage } from "@/lib/twitch/chat/chat"
import {
  parseTtsChatCommand,
  type TtsChatCommand,
} from "@/lib/tts/chat-commands"
import {
  buildSpeechSegments,
  canUseTtsPermission,
  ensureVoiceAssignment,
  getSpeakableMessageText,
  reassignRandomVoice,
} from "@/lib/tts/speech-text"
import { isSpeechSynthesisSupported } from "@/lib/tts/speech-voices"
import type { TtsConfig, TtsSoundEffect } from "@/lib/tts/tts-config"
import {
  TtsPlaybackContext,
  TtsSessionContext,
  type TtsPlaybackContextValue,
  type TtsSessionContextValue,
} from "@/lib/tts/tts-context"
import { TtsPlayer } from "@/lib/tts/tts-player"
import {
  clampTtsSidebarWidth,
  loadStoredTtsChannel,
  loadTtsUiPrefs,
  saveStoredTtsChannel,
  saveTtsUiPrefs,
  type TtsUiPrefs,
} from "@/lib/tts/tts-ui-prefs"

const MAX_TRACKED_DELETIONS = 500
const UI_PREFS_SAVE_DELAY_MS = 250
const BLOCKED_TOAST_ID = "tts-autoplay-blocked"
const ERROR_TOAST_ID = "tts-speech-error"

type MessageDeletedDetail = { channelLogin?: unknown; messageId?: unknown }

const PLAYER_CALLBACKS = {
  onBlocked: (resume: () => void) => {
    toast("Your browser paused Chatvoice", {
      id: BLOCKED_TOAST_ID,
      description:
        "Audio needs a click on the page before it can play. Resume to continue.",
      duration: Infinity,
      action: {
        label: "Resume",
        onClick: resume,
      },
    })
  },
  onSpeechError: (error: string) => {
    toast.error(
      error === "unsupported"
        ? "Speech synthesis isn't available in this browser."
        : `Speech failed: ${error}`,
      { id: ERROR_TOAST_ID }
    )
  },
}

function getResumableChannel(
  resumeOnStartup: boolean,
  knownLogins: Set<string>
): string | null {
  if (!resumeOnStartup || !isSpeechSynthesisSupported()) {
    return null
  }
  const stored = loadStoredTtsChannel()
  return stored && knownLogins.has(stored) ? stored : null
}

export function TtsProvider({ children }: { children: React.ReactNode }) {
  const { config } = usePeepochatSettings()
  const { subscribeToChatMessages } = usePeepochatChat()
  const { watchedChannelLogins } = usePeepochatPlayer()
  const availability = useSpeechAvailability()
  const ttsConfig = config.tts
  const channels = config.twitch.channels
  const knownLogins = React.useMemo(
    () =>
      new Set([
        ...channels.map((channel) => channel.login),
        ...watchedChannelLogins,
      ]),
    [channels, watchedChannelLogins]
  )

  const configRef = React.useRef<TtsConfig>(ttsConfig)
  React.useEffect(() => {
    configRef.current = ttsConfig
  }, [ttsConfig])

  const [channelLogin, setChannelLogin] = React.useState<string | null>(() =>
    getResumableChannel(ttsConfig.resumeOnStartup, knownLogins)
  )
  const channelRef = React.useRef<string | null>(null)
  const sessionRef = React.useRef(0)
  const ingestChainRef = useLazyRef<Promise<void>>(() => Promise.resolve())
  const deletedIdsRef = useLazyRef(() => new Set<string>())
  const [ui, setUi] = React.useState<TtsUiPrefs>(loadTtsUiPrefs)
  const [player] = React.useState(
    () => new TtsPlayer(PLAYER_CALLBACKS, ttsConfig)
  )

  if (
    channelLogin &&
    (availability === "unavailable" || !knownLogins.has(channelLogin))
  ) {
    setChannelLogin(null)
  }

  React.useEffect(() => {
    player.setConfig(ttsConfig)
  }, [player, ttsConfig])

  React.useEffect(() => () => player.halt(), [player])

  React.useEffect(() => {
    channelRef.current = channelLogin
    sessionRef.current += 1
    deletedIdsRef.current.clear()
    player.reset()
    saveStoredTtsChannel(channelLogin)
    toast.dismiss(BLOCKED_TOAST_ID)
  }, [channelLogin, deletedIdsRef, player])

  const playerState = React.useSyncExternalStore(
    player.subscribe,
    player.getSnapshot,
    player.getSnapshot
  )

  const updateUi = React.useCallback(
    (updater: (current: TtsUiPrefs) => TtsUiPrefs) => {
      setUi(updater)
    },
    []
  )

  const savedUiRef = React.useRef(ui)
  React.useEffect(() => {
    if (savedUiRef.current === ui) {
      return
    }
    const timeout = window.setTimeout(() => {
      savedUiRef.current = ui
      saveTtsUiPrefs(ui)
    }, UI_PREFS_SAVE_DELAY_MS)
    const flush = () => {
      window.clearTimeout(timeout)
      if (savedUiRef.current !== ui) {
        savedUiRef.current = ui
        saveTtsUiPrefs(ui)
      }
    }
    window.addEventListener("pagehide", flush)
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener("pagehide", flush)
    }
  }, [ui])

  const startTts = React.useCallback(
    (login: string) => {
      const normalized = normalizeChannelLogin(login)
      if (!normalized) {
        return
      }
      if (availability === "unavailable") {
        toast.error("Chatvoice isn't available", {
          description: "This browser doesn't have any speech voices installed.",
        })
        return
      }
      if (availability === "checking") {
        toast("Chatvoice voices are still loading", {
          description: "Try again in a moment.",
        })
        return
      }
      if (!knownLogins.has(normalized)) {
        return
      }

      const previous = channelRef.current
      if (previous === normalized) {
        return
      }
      setChannelLogin(normalized)
      if (!previous) {
        updateUi((current) =>
          current.collapsed ? current : { ...current, collapsed: true }
        )
      }
      toast.success(
        previous
          ? `Chatvoice moved to #${normalized}`
          : `Chatvoice started for #${normalized}`
      )
    },
    [availability, knownLogins, updateUi]
  )

  const stopTts = React.useCallback(() => {
    setChannelLogin(null)
  }, [])

  const executeCommand = React.useCallback(
    async (
      command: TtsChatCommand,
      message: TwitchChatMessage,
      config: TtsConfig
    ) => {
      switch (command.id) {
        case "queue":
          player.setQueueEnabled(command.enabled)
          return
        case "playback":
          player.setPlaying(command.playing)
          return
        case "skip":
          player.skip()
          return
        case "clear":
          player.clear()
          return
        case "newVoice":
          await reassignRandomVoice(
            config,
            message.userName,
            message.displayName
          )
          return
      }
    },
    [player]
  )

  const ingestMessage = React.useCallback(
    async (message: TwitchChatMessage, session: number) => {
      if (session !== sessionRef.current) {
        return
      }

      const config = configRef.current
      const command = parseTtsChatCommand(message.text)

      if (command) {
        if (
          canUseTtsPermission(
            config.commands[command.id],
            message.flags,
            message.userName,
            config.commands.whitelist
          )
        ) {
          await executeCommand(command, message, config)
        }
        return
      }

      const snapshot = player.getSnapshot()
      if (
        !snapshot.queueEnabled ||
        (config.queueMode === "small-chat" &&
          snapshot.queue.length >= config.maxQueueSize)
      ) {
        return
      }

      const text = getSpeakableMessageText(message, config)
      if (text === null) {
        return
      }

      const assignment = await ensureVoiceAssignment(
        config,
        message.userName,
        message.displayName
      )
      if (
        !assignment ||
        session !== sessionRef.current ||
        deletedIdsRef.current.has(message.id)
      ) {
        return
      }

      const profile = config.voiceProfiles.find(
        (entry) => entry.id === assignment.voiceProfileId
      )
      if (!profile) {
        return
      }

      const segmentOptions = {
        template: config.textTemplate,
        message: text,
        userName: message.userName,
        channel: normalizeChannelLogin(message.channel),
        sounds: config.soundEffects,
        canUseSound: (sound: TtsSoundEffect) =>
          canUseTtsPermission(
            sound,
            message.flags,
            message.userName,
            config.commands.whitelist
          ),
        replacements: config.wordReplacements,
      }

      const body = buildSpeechSegments({
        ...segmentOptions,
        template: "{message}",
      })
      if (body.segments.length === 0) {
        return
      }

      const built = buildSpeechSegments(segmentOptions)
      if (built.segments.length === 0) {
        return
      }

      player.enqueue(
        {
          id: message.id,
          channel: normalizeChannelLogin(message.channel),
          userName: message.userName,
          displayName: message.displayName || message.userName,
          color: message.color,
          voiceProfileId: profile.id,
          voiceLabel: profile.label || "Unnamed voice",
          segments: built.segments,
          text: built.text,
        },
        config.queueMode,
        config.maxQueueSize
      )
    },
    [deletedIdsRef, executeCommand, player]
  )

  React.useEffect(() => {
    return subscribeToChatMessages((message) => {
      const login = channelRef.current
      if (!login || normalizeChannelLogin(message.channel) !== login) {
        return
      }

      const session = sessionRef.current
      ingestChainRef.current = ingestChainRef.current
        .then(() => ingestMessage(message, session))
        .catch((error: unknown) => {
          console.error("Failed to queue text-to-speech message", error)
        })
    })
  }, [ingestChainRef, ingestMessage, subscribeToChatMessages])

  React.useEffect(() => {
    const handleDeleted = (event: Event) => {
      const detail = (event as CustomEvent<MessageDeletedDetail>).detail
      if (
        !detail ||
        typeof detail.messageId !== "string" ||
        typeof detail.channelLogin !== "string" ||
        normalizeChannelLogin(detail.channelLogin) !== channelRef.current
      ) {
        return
      }

      const deleted = deletedIdsRef.current
      deleted.add(detail.messageId)
      if (deleted.size > MAX_TRACKED_DELETIONS) {
        const oldest = deleted.values().next().value
        if (oldest !== undefined) {
          deleted.delete(oldest)
        }
      }
      player.remove(detail.messageId)
    }

    window.addEventListener("peepochat:message-deleted", handleDeleted)
    return () => {
      window.removeEventListener("peepochat:message-deleted", handleDeleted)
    }
  }, [deletedIdsRef, player])

  const setCollapsed = React.useCallback(
    (collapsed: boolean) => {
      updateUi((current) =>
        current.collapsed === collapsed ? current : { ...current, collapsed }
      )
    },
    [updateUi]
  )

  const setSidebarWidth = React.useCallback(
    (width: number) => {
      const next = clampTtsSidebarWidth(width)
      updateUi((current) =>
        current.width === next ? current : { ...current, width: next }
      )
    },
    [updateUi]
  )

  const sessionValue = React.useMemo<TtsSessionContextValue>(
    () => ({
      channelLogin,
      availability,
      startTts,
      stopTts,
      ui,
      setCollapsed,
      setSidebarWidth,
    }),
    [
      channelLogin,
      availability,
      startTts,
      stopTts,
      ui,
      setCollapsed,
      setSidebarWidth,
    ]
  )

  const playbackValue = React.useMemo<TtsPlaybackContextValue>(
    () => ({
      queue: playerState.queue,
      activeItemId: playerState.activeItemId,
      playing: playerState.playing,
      queueEnabled: playerState.queueEnabled,
      setPlaying: (playing) => player.setPlaying(playing),
      togglePlaying: () => player.setPlaying(!player.getSnapshot().playing),
      setQueueEnabled: (enabled) => player.setQueueEnabled(enabled),
      skipCurrent: () => player.skip(),
      clearQueue: () => player.clear(),
      removeItem: (id) => player.remove(id),
    }),
    [player, playerState]
  )

  return (
    <TtsSessionContext.Provider value={sessionValue}>
      <TtsPlaybackContext.Provider value={playbackValue}>
        {children}
      </TtsPlaybackContext.Provider>
    </TtsSessionContext.Provider>
  )
}
