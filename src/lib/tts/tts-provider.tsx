import * as React from "react"
import { toast } from "sonner"

import {
  usePeepochatChat,
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
const BLOCKED_TOAST_ID = "tts-autoplay-blocked"
const ERROR_TOAST_ID = "tts-speech-error"

type MessageDeletedDetail = { channelLogin?: unknown; messageId?: unknown }

const PLAYER_CALLBACKS = {
  onBlocked: (resume: () => void) => {
    toast("Your browser paused text-to-speech", {
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
  channels: { login: string }[]
): string | null {
  if (!resumeOnStartup || !isSpeechSynthesisSupported()) {
    return null
  }
  const stored = loadStoredTtsChannel()
  return stored && channels.some((channel) => channel.login === stored)
    ? stored
    : null
}

export function TtsProvider({ children }: { children: React.ReactNode }) {
  const { config } = usePeepochatSettings()
  const { subscribeToChatMessages } = usePeepochatChat()
  const ttsConfig = config.tts
  const channels = config.twitch.channels

  const configRef = React.useRef<TtsConfig>(ttsConfig)
  React.useEffect(() => {
    configRef.current = ttsConfig
  }, [ttsConfig])

  const [supported] = React.useState(isSpeechSynthesisSupported)
  const [channelLogin, setChannelLogin] = React.useState<string | null>(() =>
    getResumableChannel(ttsConfig.resumeOnStartup, channels)
  )
  const channelRef = React.useRef<string | null>(null)
  const sessionRef = React.useRef(0)
  const ingestChainRef = React.useRef<Promise<void>>(Promise.resolve())
  const deletedIdsRef = React.useRef(new Set<string>())
  const [ui, setUi] = React.useState<TtsUiPrefs>(loadTtsUiPrefs)
  const [player] = React.useState(
    () => new TtsPlayer(PLAYER_CALLBACKS, ttsConfig)
  )

  if (
    channelLogin &&
    !channels.some((channel) => channel.login === channelLogin)
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
  }, [channelLogin, player])

  const playerState = React.useSyncExternalStore(
    player.subscribe,
    player.getSnapshot,
    player.getSnapshot
  )

  const updateUi = React.useCallback(
    (updater: (current: TtsUiPrefs) => TtsUiPrefs) => {
      setUi((current) => {
        const next = updater(current)
        if (next === current) {
          return current
        }
        saveTtsUiPrefs(next)
        return next
      })
    },
    []
  )

  const startTts = React.useCallback(
    (login: string) => {
      const normalized = normalizeChannelLogin(login)
      if (!normalized) {
        return
      }
      if (!isSpeechSynthesisSupported()) {
        toast.error("Text-to-speech isn't supported in this browser.")
        return
      }

      const previous = channelRef.current
      if (previous !== normalized) {
        setChannelLogin(normalized)
        toast.success(
          previous
            ? `Text-to-speech moved to #${normalized}`
            : `Text-to-speech started for #${normalized}`
        )
      }
      updateUi((current) =>
        current.collapsed ? { ...current, collapsed: false } : current
      )
    },
    [updateUi]
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

      if (!player.getSnapshot().queueEnabled) {
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
    [executeCommand, player]
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
  }, [ingestMessage, subscribeToChatMessages])

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
  }, [player])

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

  const setFloatingPosition = React.useCallback(
    (position: { x: number; y: number }) => {
      updateUi((current) => ({ ...current, floating: position }))
    },
    [updateUi]
  )

  const sessionValue = React.useMemo<TtsSessionContextValue>(
    () => ({
      channelLogin,
      supported,
      startTts,
      stopTts,
      ui,
      setCollapsed,
      setSidebarWidth,
      setFloatingPosition,
    }),
    [
      channelLogin,
      supported,
      startTts,
      stopTts,
      ui,
      setCollapsed,
      setSidebarWidth,
      setFloatingPosition,
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
