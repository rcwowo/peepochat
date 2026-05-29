import type { HighlightPingRule } from "@/lib/peepochat-config"
import type { TwitchChatMessage } from "@/lib/twitch-chat"

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
