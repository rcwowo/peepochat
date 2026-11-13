import type { TtsCommandId } from "@/lib/tts/tts-config"

export type TtsChatCommand =
  | { id: "queue"; enabled: boolean }
  | { id: "playback"; playing: boolean }
  | { id: "skip" }
  | { id: "clear" }
  | { id: "newVoice" }

export const TTS_COMMAND_ORDER: TtsCommandId[] = [
  "queue",
  "playback",
  "skip",
  "clear",
  "newVoice",
]

export const TTS_COMMAND_CATALOG: Record<
  TtsCommandId,
  { command: string; description: string }
> = {
  queue: {
    command: "!tts on / !tts off",
    description: "Enable or disable adding new chat messages to the queue.",
  },
  playback: {
    command: "!tts pause / !tts play",
    description: "Pause or resume speech playback.",
  },
  skip: {
    command: "!tts skip",
    description: "Skip the message currently being spoken.",
  },
  clear: {
    command: "!tts clear",
    description: "Clear every message waiting in the queue.",
  },
  newVoice: {
    command: "!newvoice",
    description:
      "Reassign the chatter to a random voice if they already have one saved.",
  },
}

export function parseTtsChatCommand(text: string): TtsChatCommand | null {
  const parts = text.trim().split(/\s+/).filter(Boolean)
  const head = parts[0]?.toLowerCase()

  if (head === "!newvoice") {
    return { id: "newVoice" }
  }

  if (head !== "!tts" || parts.length < 2) {
    return null
  }

  switch (parts[1]!.toLowerCase()) {
    case "on":
      return { id: "queue", enabled: true }
    case "off":
      return { id: "queue", enabled: false }
    case "pause":
      return { id: "playback", playing: false }
    case "play":
      return { id: "playback", playing: true }
    case "skip":
      return { id: "skip" }
    case "clear":
      return { id: "clear" }
    default:
      return null
  }
}
