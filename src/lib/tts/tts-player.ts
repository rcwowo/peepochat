import type { TtsQueueItem } from "@/lib/tts/tts-context"
import type { TtsConfig, TtsQueueMode } from "@/lib/tts/tts-config"
import type { TtsSpeechSegment } from "@/lib/tts/speech-text"
import { getSoundEffectAudio } from "@/lib/tts/tts-db"
import {
  createProfileUtterance,
  isSpeechSynthesisSupported,
} from "@/lib/tts/speech-voices"

export type TtsPlayerState = {
  queue: TtsQueueItem[]
  activeItemId: string | null
  playing: boolean
  queueEnabled: boolean
}

type SegmentResult = "done" | "error" | "blocked"

type TtsPlayerCallbacks = {
  onBlocked: (resume: () => void) => void
  onSpeechError: (error: string) => void
}

const WATCHDOG_INTERVAL_MS = 1000
const WATCHDOG_IDLE_TICKS = 2
const WATCHDOG_START_TIMEOUT_MS = 10_000
const CANCEL_SETTLE_MS = 120

const FALLBACK_PROFILE = { voice: "", rate: 0, pitch: 0, volume: 0 }

const INITIAL_STATE: TtsPlayerState = {
  queue: [],
  activeItemId: null,
  playing: true,
  queueEnabled: true,
}

export class TtsPlayer {
  private state: TtsPlayerState = INITIAL_STATE
  private readonly listeners = new Set<() => void>()
  private readonly callbacks: TtsPlayerCallbacks
  private config: TtsConfig
  private token = 0
  private busy = false
  private progress = {
    itemId: null as string | null,
    segmentIndex: 0,
    charOffset: 0,
    utteranceChar: 0,
  }
  private utterance: SpeechSynthesisUtterance | null = null
  private audio: { element: HTMLAudioElement; url: string } | null = null
  private pendingFinish: ((result: SegmentResult) => void) | null = null
  private lastCancelAt = 0

  constructor(callbacks: TtsPlayerCallbacks, config: TtsConfig) {
    this.callbacks = callbacks
    this.config = config
  }

  setConfig(config: TtsConfig) {
    this.config = config
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = () => this.state

  private setState(patch: Partial<TtsPlayerState>) {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) {
      listener()
    }
  }

  enqueue(item: TtsQueueItem, mode: TtsQueueMode, capacity: number) {
    if (!this.state.queueEnabled) {
      return
    }

    const { queue } = this.state
    if (queue.some((entry) => entry.id === item.id)) {
      return
    }

    if (mode === "big-chat") {
      const head = queue[0]
      this.setState({ queue: head ? [head, item] : [item] })
    } else {
      if (queue.length >= Math.max(1, capacity)) {
        return
      }
      this.setState({ queue: [...queue, item] })
    }

    this.pump()
  }

  setPlaying(playing: boolean) {
    if (playing === this.state.playing) {
      if (playing) {
        this.pump()
      }
      return
    }

    if (!playing) {
      this.softPause()
      return
    }

    this.setState({ playing: true })
    this.pump()
  }

  setQueueEnabled(enabled: boolean) {
    if (enabled !== this.state.queueEnabled) {
      this.setState({ queueEnabled: enabled })
    }
  }

  skip() {
    const head = this.state.queue[0]
    if (!head) {
      return
    }

    this.interrupt()
    this.resetProgress()
    this.setState({ queue: this.state.queue.slice(1), activeItemId: null })
    this.pump()
  }

  clear() {
    this.interrupt()
    this.resetProgress()
    this.setState({ queue: [], activeItemId: null })
  }

  remove(id: string) {
    const index = this.state.queue.findIndex((item) => item.id === id)
    if (index === -1) {
      return
    }

    if (index === 0) {
      this.skip()
      return
    }

    this.setState({
      queue: this.state.queue.filter((item) => item.id !== id),
    })
  }

  reset() {
    this.clear()
    this.setState({ playing: true, queueEnabled: true })
  }

  halt() {
    this.interrupt()
  }

  private resetProgress(itemId: string | null = null) {
    this.progress = {
      itemId,
      segmentIndex: 0,
      charOffset: 0,
      utteranceChar: 0,
    }
  }

  private softPause() {
    if (this.busy) {
      this.progress.charOffset += this.progress.utteranceChar
      this.progress.utteranceChar = 0
    }
    this.interrupt()
    this.setState({ playing: false })
  }

  private interrupt() {
    this.token += 1
    this.busy = false

    const finish = this.pendingFinish
    this.pendingFinish = null

    if (this.audio) {
      const { element, url } = this.audio
      this.audio = null
      element.onended = null
      element.onerror = null
      element.pause()
      URL.revokeObjectURL(url)
    }

    if (this.utterance) {
      this.utterance = null
      if (isSpeechSynthesisSupported()) {
        window.speechSynthesis.cancel()
        this.lastCancelAt = Date.now()
      }
    }

    finish?.("done")
  }

  private pump() {
    if (this.busy || !this.state.playing) {
      return
    }

    const item = this.state.queue[0]
    if (!item) {
      if (this.state.activeItemId !== null) {
        this.setState({ activeItemId: null })
      }
      return
    }

    if (this.progress.itemId !== item.id) {
      this.resetProgress(item.id)
    }

    this.busy = true
    const token = ++this.token
    if (this.state.activeItemId !== item.id) {
      this.setState({ activeItemId: item.id })
    }

    const settle = (result: SegmentResult | "cancelled") => {
      if (token !== this.token) {
        return
      }

      this.busy = false
      if (result === "blocked") {
        this.softPause()
        this.callbacks.onBlocked(() => this.setPlaying(true))
        return
      }

      this.resetProgress()
      this.setState({
        queue: this.state.queue.filter((entry) => entry.id !== item.id),
        activeItemId: null,
      })
      this.pump()
    }

    this.playItem(item, token).then(settle, () => settle("error"))
  }

  private async playItem(
    item: TtsQueueItem,
    token: number
  ): Promise<SegmentResult | "cancelled"> {
    while (this.progress.segmentIndex < item.segments.length) {
      if (token !== this.token) {
        return "cancelled"
      }

      const segment = item.segments[this.progress.segmentIndex]!
      const result = await this.playSegment(segment, item, token)

      if (token !== this.token) {
        return "cancelled"
      }
      if (result === "blocked") {
        return "blocked"
      }

      this.progress.segmentIndex += 1
      this.progress.charOffset = 0
      this.progress.utteranceChar = 0
    }

    return "done"
  }

  private playSegment(
    segment: TtsSpeechSegment,
    item: TtsQueueItem,
    token: number
  ): Promise<SegmentResult> {
    if (segment.kind === "sound") {
      return this.playSound(segment.soundId, token)
    }

    const text = segment.text.slice(this.progress.charOffset)
    if (!text.trim()) {
      return Promise.resolve("done")
    }

    return this.speak(text, item, token)
  }

  private async speak(
    text: string,
    item: TtsQueueItem,
    token: number
  ): Promise<SegmentResult> {
    if (!isSpeechSynthesisSupported()) {
      this.callbacks.onSpeechError("unsupported")
      return "error"
    }

    const settleDelay = this.lastCancelAt + CANCEL_SETTLE_MS - Date.now()
    if (settleDelay > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, settleDelay))
      if (token !== this.token) {
        return "done"
      }
    }

    return this.startUtterance(text, item, token)
  }

  private startUtterance(
    text: string,
    item: TtsQueueItem,
    token: number
  ): Promise<SegmentResult> {
    const synth = window.speechSynthesis
    const profile =
      this.config.voiceProfiles.find(
        (entry) => entry.id === item.voiceProfileId
      ) ?? FALLBACK_PROFILE
    const utterance = createProfileUtterance(text, profile)
    this.utterance = utterance

    return new Promise<SegmentResult>((resolve) => {
      let settled = false
      let started = false
      let idleTicks = 0
      const startedAt = Date.now()

      const finish = (result: SegmentResult) => {
        if (settled) {
          return
        }
        settled = true
        window.clearInterval(watchdog)
        utterance.onstart = null
        utterance.onboundary = null
        utterance.onend = null
        utterance.onerror = null
        if (this.utterance === utterance) {
          this.utterance = null
        }
        if (this.pendingFinish === finish) {
          this.pendingFinish = null
        }
        resolve(result)
      }

      this.pendingFinish = finish

      utterance.onstart = () => {
        started = true
      }
      utterance.onboundary = (event) => {
        if (token === this.token && event.charIndex >= 0) {
          this.progress.utteranceChar = event.charIndex
        }
      }
      utterance.onend = () => finish("done")
      utterance.onerror = (event) => {
        if (event.error === "not-allowed") {
          finish("blocked")
          return
        }
        if (event.error !== "canceled" && event.error !== "interrupted") {
          this.callbacks.onSpeechError(event.error)
        }
        finish("error")
      }

      const watchdog = window.setInterval(() => {
        if (token !== this.token) {
          finish("done")
          return
        }
        if (synth.speaking || synth.pending) {
          idleTicks = 0
          return
        }
        idleTicks += 1
        if (
          (started && idleTicks >= WATCHDOG_IDLE_TICKS) ||
          (!started && Date.now() - startedAt >= WATCHDOG_START_TIMEOUT_MS)
        ) {
          finish("done")
        }
      }, WATCHDOG_INTERVAL_MS)

      synth.speak(utterance)
    })
  }

  private async playSound(
    soundId: string,
    token: number
  ): Promise<SegmentResult> {
    const sound = this.config.soundEffects.find((entry) => entry.id === soundId)
    if (!sound?.enabled) {
      return "done"
    }
    const volume = sound.volume

    const record = await getSoundEffectAudio(soundId).catch(() => undefined)
    if (token !== this.token) {
      return "done"
    }
    if (!record) {
      return "error"
    }

    const url = URL.createObjectURL(record.blob)
    const element = new Audio(url)
    element.volume = Math.min(1, Math.max(0, volume))
    this.audio = { element, url }

    return new Promise<SegmentResult>((resolve) => {
      let settled = false

      const finish = (result: SegmentResult) => {
        if (settled) {
          return
        }
        settled = true
        element.onended = null
        element.onerror = null
        if (this.audio?.element === element) {
          this.audio = null
          element.pause()
          URL.revokeObjectURL(url)
        }
        if (this.pendingFinish === finish) {
          this.pendingFinish = null
        }
        resolve(result)
      }

      this.pendingFinish = finish
      element.onended = () => finish("done")
      element.onerror = () => finish("error")
      element.play().catch((error: unknown) => {
        finish(
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "blocked"
            : "error"
        )
      })
    })
  }
}
