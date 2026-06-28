/**
 * Pure IRC line parsing helpers for Twitch's tagged message format.
 *
 * Classification always inspects the IRC command body (after `@tags`), never
 * tag values or chat text. Substrings like "001" in user-id=100135110 must not
 * be mistaken for RPL_WELCOME.
 */

export type IrcTaggedLine = {
  tags: Map<string, string>
  rest: string
}

export function splitTaggedLine(raw: string): IrcTaggedLine | null {
  const spaceAfterTags = raw.indexOf(" ")
  if (spaceAfterTags === -1) return null

  const tagsSection = raw.slice(1, spaceAfterTags)
  const rest = raw.slice(spaceAfterTags + 1)
  const tags = new Map<string, string>()

  for (const pair of tagsSection.split(";")) {
    const eqIdx = pair.indexOf("=")
    if (eqIdx === -1) {
      tags.set(pair, "")
    } else {
      tags.set(pair.slice(0, eqIdx), pair.slice(eqIdx + 1))
    }
  }

  return { tags, rest }
}

/** IRC payload after the `@tags ` prefix, or the full line when untagged. */
export function getIrcLineBody(raw: string): string {
  if (!raw.startsWith("@")) return raw
  return splitTaggedLine(raw)?.rest ?? raw
}

/** RPL_WELCOME — `:server 001 nick :message` */
export function isIrcWelcomeLine(rest: string): boolean {
  return /^:\S+ 001 \S+ /.test(rest)
}

export function isIrcPongLine(rest: string): boolean {
  return /^(?::\S+ )?PONG(?:\s|$)/i.test(rest)
}

export function isIrcJoinLine(rest: string): boolean {
  return /^:\S+ JOIN #\S+/i.test(rest)
}

export function parseIrcJoinChannel(rest: string): string | null {
  const match = rest.match(/^:\S+ JOIN #(\S+)/i)
  return match?.[1] ?? null
}

export function isIrcRoomStateLine(rest: string): boolean {
  return /^:\S+ ROOMSTATE #\S+/i.test(rest)
}

export function isIrcUserStateLine(rest: string): boolean {
  return /^:\S+ USERSTATE #\S+/i.test(rest)
}

export function isIrcPrivmsgLine(rest: string): boolean {
  return /^:\S+ PRIVMSG #\S+/i.test(rest)
}

export function isIrcUsernoticeLine(rest: string): boolean {
  return /^:\S+ USERNOTICE #\S+/i.test(rest)
}

export function isIrcNoticeLine(rest: string): boolean {
  return /^:\S+ NOTICE #\S+/i.test(rest)
}

export function isIrcClearMsgLine(rest: string): boolean {
  return /^:\S+ CLEARMSG #\S+/i.test(rest)
}

export function isIrcClearChatLine(rest: string): boolean {
  return /^:\S+ CLEARCHAT #\S+/i.test(rest)
}
