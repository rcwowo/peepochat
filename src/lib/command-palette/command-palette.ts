import { HOTKEY_BINDINGS, type HotkeyActionId } from "@/lib/hotkeys/bindings"
import { formatHotkeyComboKeys } from "@/lib/hotkeys/labels"
import { isValidTwitchLogin } from "@/lib/chat/nicknames"
import { normalizeChannelLogin } from "@/lib/twitch/channel/channel"

export function resolveCommandPaletteTarget({
  playerViewActive,
  playerChatLogin,
  lastFocusedLogin,
  activeChannelLogin,
  visibleChannelLogins,
}: {
  playerViewActive: boolean
  playerChatLogin: string | null
  lastFocusedLogin: string | null
  activeChannelLogin: string
  visibleChannelLogins: string[]
}): string | null {
  if (playerViewActive) {
    return playerChatLogin
  }

  if (lastFocusedLogin && visibleChannelLogins.includes(lastFocusedLogin)) {
    return lastFocusedLogin
  }

  if (activeChannelLogin && visibleChannelLogins.includes(activeChannelLogin)) {
    return activeChannelLogin
  }

  return visibleChannelLogins[0] ?? null
}

export function getTypedChannelLogin(
  query: string,
  knownLogins: Iterable<string>
): string | null {
  const login = normalizeChannelLogin(query)
  if (!isValidTwitchLogin(login)) {
    return null
  }

  for (const known of knownLogins) {
    if (known === login) {
      return null
    }
  }

  return login
}

export function getHotkeyKeys(action: HotkeyActionId): string[] {
  const binding = HOTKEY_BINDINGS.find((entry) => entry.action === action)
  return binding ? formatHotkeyComboKeys(binding.combo) : []
}
