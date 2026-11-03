export const NICKNAME_MAX_LENGTH = 25

export type NicknameEntryLike = { login: string; nickname: string }

const NICKNAME_PATTERN = /^[A-Za-z0-9_]+$/
const TWITCH_LOGIN_PATTERN = /^[A-Za-z0-9_]{3,25}$/

export function isValidNickname(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= NICKNAME_MAX_LENGTH &&
    NICKNAME_PATTERN.test(value)
  )
}

export function isValidTwitchLogin(value: string): boolean {
  return TWITCH_LOGIN_PATTERN.test(value)
}

export function findNicknameByLogin(
  entries: NicknameEntryLike[],
  login: string | null | undefined
): string | null {
  if (!login) {
    return null
  }

  const normalized = login.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  return entries.find((entry) => entry.login === normalized)?.nickname ?? null
}

export function createNicknameByLoginMap(
  entries: NicknameEntryLike[]
): Map<string, string> {
  const map = new Map<string, string>()
  for (const entry of entries) {
    const login = entry.login.trim().toLowerCase()
    if (login) {
      map.set(login, entry.nickname)
    }
  }
  return map
}

export function createNicknameMentionMap(
  entries: NicknameEntryLike[]
): Map<string, string> {
  const map = new Map<string, string>()
  for (const entry of entries) {
    const nickname = entry.nickname.toLowerCase()
    if (nickname) {
      map.set(nickname, entry.login.toLowerCase())
    }
  }
  return map
}

const NICKNAME_MENTION_TOKEN_PATTERN = /@([A-Za-z0-9_]+)/g
const WORD_CHARACTER_PATTERN = /[A-Za-z0-9_]/

/**
 * Replaces nickname mentions (e.g. "@cat") with the matching user's actual
 * Twitch login. Tokens are matched only as proper mentions: they must start
 * with "@", have a word boundary before, match a nickname exactly (ignoring
 * case), and end at a word boundary, so trailing punctuation is preserved.
 */
export function applyNicknameMentions(
  text: string,
  mentions: Map<string, string>
): string {
  if (text.length === 0 || mentions.size === 0) {
    return text
  }

  let result = ""
  let lastIndex = 0
  for (const match of text.matchAll(NICKNAME_MENTION_TOKEN_PATTERN)) {
    const start = match.index
    if (start === undefined) {
      continue
    }

    if (start > 0 && WORD_CHARACTER_PATTERN.test(text[start - 1] ?? "")) {
      continue
    }

    const nameEnd = start + match[0].length
    if (
      nameEnd < text.length &&
      WORD_CHARACTER_PATTERN.test(text[nameEnd] ?? "")
    ) {
      continue
    }

    const login = mentions.get((match[1] ?? "").toLowerCase())
    if (!login) {
      continue
    }

    result += text.slice(lastIndex, start) + `@${login}`
    lastIndex = nameEnd
  }

  if (lastIndex === 0) {
    return text
  }

  return result + text.slice(lastIndex)
}
