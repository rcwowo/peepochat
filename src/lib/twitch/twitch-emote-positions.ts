/**
 * Twitch IRC emote positions are Unicode code point indices. JavaScript strings
 * index by UTF-16 code units, so emoji and other supplementary characters shift
 * positions unless converted.
 *
 * @see https://discuss.dev.twitch.com/t/cant-calculate-offset-from-the-emotes-tag-if-the-message-contains-emojis/28414
 */

export function codePointRangeToUtf16Indices(
  text: string,
  codePointStart: number,
  codePointEnd: number
): { start: number; end: number } | null {
  if (codePointStart < 0 || codePointEnd < codePointStart) {
    return null
  }

  const codePointToUtf16: number[] = []
  let utf16Length = 0
  for (const char of text) {
    codePointToUtf16.push(utf16Length)
    utf16Length += char.length
  }

  if (codePointStart >= codePointToUtf16.length) {
    return null
  }

  const start = codePointToUtf16[codePointStart]!
  const clampedEnd = Math.min(codePointEnd, codePointToUtf16.length - 1)

  let codePoint = 0
  let utf16Index = 0
  for (const char of text) {
    if (codePoint === clampedEnd) {
      return { start, end: utf16Index + char.length - 1 }
    }
    codePoint += 1
    utf16Index += char.length
  }

  return { start, end: text.length - 1 }
}
