import {
  AudioLinesIcon,
  BellIcon,
  CircleHelpIcon,
  CodeIcon,
  DatabaseIcon,
  InfoIcon,
  MessageSquareIcon,
  MonitorPlayIcon,
  PaintbrushIcon,
  ScrollTextIcon,
  SpeechIcon,
  TerminalIcon,
  UsersIcon,
  Volume2Icon,
} from "lucide-react"
import type * as React from "react"

import { getAppVersion } from "@/lib/changelog"
import { IS_DEV } from "@/lib/dev/is-dev"

export type SettingsCategory =
  | "appearance"
  | "chat"
  | "users"
  | "highlights"
  | "player"
  | "data"
  | "tts-speech"
  | "tts-voices"
  | "tts-sounds"
  | "tts-commands"
  | "changelog"
  | "help"
  | "about"
  | "developer"

export type SettingsCategoryEntry = {
  id: SettingsCategory
  label: string
  icon: React.ComponentType<{ className?: string }>
  description?: string | (() => string)
}

export const PREFERENCE_CATEGORIES: SettingsCategoryEntry[] = [
  {
    id: "appearance",
    label: "Appearance",
    icon: PaintbrushIcon,
    description: "Theme, colors, and the overall look of the client.",
  },
  {
    id: "chat",
    label: "Chat",
    icon: MessageSquareIcon,
    description: "How chat panes behave and what appears in them.",
  },
  {
    id: "users",
    label: "Users",
    icon: UsersIcon,
    description:
      "Nicknames and Chatvoice voices for specific chatters. Nicknames only change what you see; mentions appear normally for everyone else.",
  },
  {
    id: "player",
    label: "Player",
    icon: MonitorPlayIcon,
    description: "Playback and layout options for watching streams.",
  },
  {
    id: "highlights",
    label: "Notifications",
    icon: BellIcon,
    description: "How indicators, pings, and notifications behave.",
  },
  {
    id: "data",
    label: "Data Management",
    icon: DatabaseIcon,
    description: "Backup, restore, or delete your Peepochat data.",
  },
  ...(IS_DEV
    ? [
        {
          id: "developer" as const,
          label: "Developer",
          icon: CodeIcon,
          description: "Hello there, developer!",
        },
      ]
    : []),
]

export const TTS_CATEGORIES: SettingsCategoryEntry[] = [
  {
    id: "tts-speech",
    label: "Speech",
    icon: SpeechIcon,
    description:
      "How chat messages are filtered, queued, and read aloud when Chatvoice is running.",
  },
  {
    id: "tts-voices",
    label: "Voices",
    icon: AudioLinesIcon,
    description:
      "Voice profiles that get assigned to chatters, and the voices each chatter has been given.",
  },
  {
    id: "tts-sounds",
    label: "Sounds",
    icon: Volume2Icon,
    description:
      "Audio clips chatters can trigger by wrapping a sound's name in parentheses.",
  },
  {
    id: "tts-commands",
    label: "Commands",
    icon: TerminalIcon,
    description: "Let chat control Chatvoice. Every command starts disabled.",
  },
]

export const TTS_CATEGORY_IDS = new Set<SettingsCategory>(
  TTS_CATEGORIES.map((category) => category.id)
)

export const CHATVOICE_INFO =
  "Chatvoice reads chat messages in a channel aloud, giving each chatter their own voice. Start it from a channel's options menu."
export const CHATVOICE_UNAVAILABLE_INFO =
  "Chatvoice isn't available because this browser doesn't have any TTS voices available. Consider using Chrome or Edge to use this feature."

export const NAV_GROUPS: {
  label: string
  categories: SettingsCategoryEntry[]
  info?: string
  unavailableInfo?: string
}[] = [
  { label: "Preferences", categories: PREFERENCE_CATEGORIES },
  {
    label: "Chatvoice",
    categories: TTS_CATEGORIES,
    info: CHATVOICE_INFO,
    unavailableInfo: CHATVOICE_UNAVAILABLE_INFO,
  },
]

export const RESOURCE_CATEGORIES: SettingsCategoryEntry[] = [
  {
    id: "changelog",
    label: "Changelog",
    icon: ScrollTextIcon,
    description: () =>
      `You're on version ${getAppVersion()}. Here's what changed in recent releases.`,
  },
  {
    id: "help",
    label: "Help",
    icon: CircleHelpIcon,
    description: "Wiki links and keyboard shortcuts.",
  },
]

export const ABOUT_CATEGORY = {
  id: "about",
  label: "About",
  icon: InfoIcon,
  description: "Version info, credits, and support links.",
} satisfies SettingsCategoryEntry
