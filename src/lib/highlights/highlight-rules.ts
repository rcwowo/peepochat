import type { HighlightPingRule } from "@/lib/peepochat/peepochat-config"
import type { TwitchChatMessage } from "@/lib/twitch/twitch-chat"

export type CompiledPingRule = {
  id: string
  pattern: string
  notify: boolean
  regex: RegExp
}

export type PingMatchResult = {
  ruleId: string
  pattern?: string
  notify: boolean
}

function compilePingRule(rule: HighlightPingRule): CompiledPingRule | null {
  const pattern = rule.pattern.trim()
  if (!pattern || !rule.enabled) {
    return null
  }

  try {
    return {
      id: rule.id,
      pattern,
      notify: rule.notify,
      regex: new RegExp(pattern, "i"),
    }
  } catch {
    return null
  }
}

export function compilePingRules(
  rules: HighlightPingRule[]
): CompiledPingRule[] {
  return rules
    .map((rule) => compilePingRule(rule))
    .filter((rule): rule is CompiledPingRule => rule !== null)
}

export function matchPingRules(
  compiled: CompiledPingRule[],
  message: TwitchChatMessage
): PingMatchResult | null {
  if (compiled.length === 0) {
    return null
  }

  const haystack = message.text
  for (const rule of compiled) {
    rule.regex.lastIndex = 0
    if (rule.regex.test(haystack)) {
      return { ruleId: rule.id, pattern: rule.pattern, notify: rule.notify }
    }
  }

  return null
}

export function createPingRuleId() {
  return `ping-${crypto.randomUUID()}`
}

const USERNAME_MENTION_RULE_ID = "__username-mention__"

export function getUsernameMentionRuleId() {
  return USERNAME_MENTION_RULE_ID
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function buildUsernameMentionPattern(accountLogin: string): RegExp | null {
  const login = accountLogin.trim().replace(/^@/, "").toLowerCase()
  if (!login) {
    return null
  }

  const escaped = escapeRegExp(login)
  return new RegExp(
    `(?:@${escaped}(?![\\w-])|(?<![@\\w-])${escaped}(?![\\w-]))`,
    "i"
  )
}

export function messageMentionsUsername(
  message: TwitchChatMessage,
  accountLogin: string
): boolean {
  const mentionPattern = buildUsernameMentionPattern(accountLogin)
  if (!mentionPattern) {
    return false
  }

  mentionPattern.lastIndex = 0
  return mentionPattern.test(message.text)
}

export function resolveMessagePingMatch(
  compiled: CompiledPingRule[],
  message: TwitchChatMessage,
  options: {
    pingOnUsernameMention: boolean
    accountLogin: string | null
  }
): PingMatchResult | null {
  const pingMatch = matchPingRules(compiled, message)
  if (pingMatch) {
    return pingMatch
  }

  if (
    options.pingOnUsernameMention &&
    options.accountLogin &&
    messageMentionsUsername(message, options.accountLogin)
  ) {
    return {
      ruleId: getUsernameMentionRuleId(),
      notify: true,
    }
  }

  return null
}

export type PingMatchRange = {
  start: number
  end: number
}

export function getPingMatchPattern(
  ruleId: string,
  compiledPattern: string | undefined,
  accountLogin: string | null
) {
  if (ruleId === getUsernameMentionRuleId()) {
    return accountLogin ?? ""
  }

  return compiledPattern ?? ""
}

export function findPingMatchRange(
  text: string,
  ruleId: string,
  matchPattern: string
): PingMatchRange | null {
  if (ruleId === USERNAME_MENTION_RULE_ID) {
    const mentionPattern = buildUsernameMentionPattern(matchPattern)
    if (!mentionPattern) {
      return null
    }

    const match = mentionPattern.exec(text)
    if (!match || match.index === undefined) {
      return null
    }

    return {
      start: match.index,
      end: match.index + match[0].length,
    }
  }

  const pattern = matchPattern.trim()
  if (!pattern) {
    return null
  }

  try {
    const regex = new RegExp(pattern, "i")
    const match = regex.exec(text)
    if (!match || match.index === undefined) {
      return null
    }

    return {
      start: match.index,
      end: match.index + match[0].length,
    }
  } catch {
    return null
  }
}
