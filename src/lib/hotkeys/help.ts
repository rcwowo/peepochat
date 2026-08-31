import {
  HOTKEY_BINDINGS,
  type HotkeyActionId,
  type HotkeyCombo,
} from "@/lib/hotkeys/bindings"
import { formatHotkeyCombo, formatHotkeyLabel } from "@/lib/hotkeys/labels"

export type HotkeyHelpRow = {
  action: HotkeyActionId
  title: string
  description: string
  labels: string[]
}

const HOTKEY_ACTION_HELP: Record<
  HotkeyActionId,
  { title: string; description: string }
> = {
  "search.open": {
    title: "Search messages",
    description: "Toggle the search window.",
  },
  "channel.add": {
    title: "Add a channel",
    description: "Toggle the add-channel dialog.",
  },
  "notifications.open": {
    title: "Notification center",
    description: "Toggle the notification center.",
  },
  "dnd.toggle": {
    title: "Do not disturb",
    description:
      "Toggle muting pings and live notifications. You can also right-click the notification icon.",
  },
  "settings.open": {
    title: "Settings",
    description: "Toggle the settings panel.",
  },
  "sidebar.toggle": {
    title: "Channel sidebar",
    description: "Toggle the channel sidebar.",
  },
  "emote-picker.open": {
    title: "Emote picker",
    description: "Toggle the emote picker on the last focused chat.",
  },
  "viewer-list.open": {
    title: "Viewer list",
    description: "Toggle the viewer list on the last focused chat.",
  },
  "emotes.reload": {
    title: "Reload emotes",
    description: "Refresh emotes for the channels you can see.",
  },
  "composer.focus": {
    title: "Focus composer",
    description: "Jump back to the last selected chat input.",
  },
  "sidebar.select": {
    title: "Switch sidebar slot",
    description: "Jump to a channel or split.",
  },
}

function labelsForAction(action: HotkeyActionId, combos: HotkeyCombo[]) {
  if (action === "sidebar.select") {
    return [formatHotkeyLabel({ alt: true, key: "0-9" })]
  }

  return combos.map(formatHotkeyCombo)
}

export function getHotkeyHelpRows(): HotkeyHelpRow[] {
  const combosByAction = new Map<HotkeyActionId, HotkeyCombo[]>()

  for (const binding of HOTKEY_BINDINGS) {
    const combos = combosByAction.get(binding.action) ?? []
    combos.push(binding.combo)
    combosByAction.set(binding.action, combos)
  }

  return [...combosByAction.entries()].map(([action, combos]) => ({
    action,
    ...HOTKEY_ACTION_HELP[action],
    labels: labelsForAction(action, combos),
  }))
}
