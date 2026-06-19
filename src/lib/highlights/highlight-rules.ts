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

export function compilePingRules(rules: HighlightPingRule[]): CompiledPingRule[] {
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
      return { ruleId: rule.id, notify: rule.notify }
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

export function messageMentionsUsername(
  message: TwitchChatMessage,
  accountLogin: string
): boolean {
  const login = accountLogin.trim().replace(/^@/, "").toLowerCase()
  if (!login) {
    return false
  }

  const text = message.text
  const escaped = escapeRegExp(login)
  const mentionPattern = new RegExp(
    `(?:@${escaped}(?![\\w-])|(?<![@\\w-])${escaped}(?![\\w-]))`,
    "i"
  )

  mentionPattern.lastIndex = 0
  return mentionPattern.test(text)
}
