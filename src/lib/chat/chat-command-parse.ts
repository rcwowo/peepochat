export type ParsedSlashCommand = {
  name: string
  rawArgs: string
}

export function parseSlashCommand(input: string): ParsedSlashCommand | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith("/")) {
    return null
  }

  const withoutSlash = trimmed.slice(1)
  const spaceIndex = withoutSlash.indexOf(" ")
  if (spaceIndex === -1) {
    return { name: withoutSlash.toLowerCase(), rawArgs: "" }
  }

  return {
    name: withoutSlash.slice(0, spaceIndex).toLowerCase(),
    rawArgs: withoutSlash.slice(spaceIndex + 1).trim(),
  }
}

export function splitFirstToken(value: string): [string, string] {
  const trimmed = value.trim()
  if (!trimmed) {
    return ["", ""]
  }

  const spaceIndex = trimmed.indexOf(" ")
  if (spaceIndex === -1) {
    return [trimmed, ""]
  }

  return [trimmed.slice(0, spaceIndex), trimmed.slice(spaceIndex + 1).trim()]
}
