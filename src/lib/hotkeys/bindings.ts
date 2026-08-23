export type HotkeyActionId =
  | "search.open"
  | "sidebar.select"
  | "channel.add"
  | "notifications.open"
  | "dnd.toggle"
  | "settings.open"
  | "sidebar.toggle"
  | "emote-picker.open"
  | "viewer-list.open"
  | "emotes.reload"
  | "composer.focus"

export type HotkeyCombo = {
  alt?: boolean
  shift?: boolean
  ctrlOrMeta?: boolean
  code: string
}

export type HotkeyBinding =
  | {
      action: Exclude<HotkeyActionId, "sidebar.select">
      combo: HotkeyCombo
      allowWhenSurface?: "search" | "add-channel" | "settings" | "viewer-list"
    }
  | {
      action: "sidebar.select"
      combo: HotkeyCombo
      index: number
    }

const ALT: Pick<HotkeyCombo, "alt"> = { alt: true }

export const HOTKEY_BINDINGS: HotkeyBinding[] = [
  {
    action: "search.open",
    combo: { ctrlOrMeta: true, code: "KeyF" },
    allowWhenSurface: "search",
  },
  {
    action: "search.open",
    combo: { ...ALT, code: "KeyF" },
    allowWhenSurface: "search",
  },
  {
    action: "channel.add",
    combo: { ...ALT, code: "KeyT" },
    allowWhenSurface: "add-channel",
  },
  {
    action: "notifications.open",
    combo: { ...ALT, code: "KeyN" },
  },
  {
    action: "dnd.toggle",
    combo: { ...ALT, shift: true, code: "KeyN" },
  },
  {
    action: "settings.open",
    combo: { ...ALT, code: "Period" },
    allowWhenSurface: "settings",
  },
  {
    action: "sidebar.toggle",
    combo: { ...ALT, code: "KeyS" },
  },
  {
    action: "emote-picker.open",
    combo: { ...ALT, code: "KeyE" },
  },
  {
    action: "viewer-list.open",
    combo: { ...ALT, code: "KeyV" },
    allowWhenSurface: "viewer-list",
  },
  {
    action: "emotes.reload",
    combo: { ...ALT, code: "KeyR" },
  },
  {
    action: "composer.focus",
    combo: { ...ALT, code: "KeyL" },
  },
  ...(
    [
      "Digit1",
      "Digit2",
      "Digit3",
      "Digit4",
      "Digit5",
      "Digit6",
      "Digit7",
      "Digit8",
      "Digit9",
    ] as const
  ).map(
    (code, index) =>
      ({
        action: "sidebar.select" as const,
        combo: { ...ALT, code },
        index,
      }) satisfies HotkeyBinding
  ),
  {
    action: "sidebar.select",
    combo: { ...ALT, code: "Digit0" },
    index: 9,
  },
]
