/**
 * Development-only logging. All exports are no-ops in production builds so
 * Vite can tree-shake the call sites when `import.meta.env.DEV` is false.
 */

const IS_DEV = import.meta.env.DEV

export type DevLogger = {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

function createDevLogger(scope: string): DevLogger {
  if (!IS_DEV) {
    const noop = () => {}
    return { debug: noop, info: noop, warn: noop, error: noop }
  }

  const prefix = `[peepochat:${scope}]`
  return {
    debug: (...args: unknown[]) => console.debug(prefix, ...args),
    info: (...args: unknown[]) => console.info(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
  }
}

export const devChatLogger = createDevLogger("chat")
export const devFetchLogger = createDevLogger("fetch")

const SENSITIVE_QUERY_KEYS = new Set([
  "access_token",
  "client_secret",
  "oauth",
  "token",
])

/** Redact secrets from URLs before logging. */
export function sanitizeUrlForLog(url: string): string {
  try {
    const parsed = new URL(url)
    for (const key of [...parsed.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        parsed.searchParams.set(key, "[redacted]")
      }
    }
    return parsed.toString()
  } catch {
    return url
  }
}

function resolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input
  }
  if (input instanceof URL) {
    return input.href
  }
  return input.url
}

function resolveRequestMethod(
  input: RequestInfo | URL,
  init?: RequestInit
): string {
  if (init?.method) {
    return init.method.toUpperCase()
  }
  if (input instanceof Request) {
    return input.method.toUpperCase()
  }
  return "GET"
}

/**
 * Drop-in fetch wrapper that logs request metadata in development.
 * Never logs Authorization headers or response bodies.
 */
export async function devLoggedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  label?: string
): Promise<Response> {
  if (!IS_DEV) {
    return fetch(input, init)
  }

  const url = sanitizeUrlForLog(resolveRequestUrl(input))
  const method = resolveRequestMethod(input, init)
  const tag = label ?? url
  const startedAt = performance.now()

  devFetchLogger.debug("→", method, tag)

  try {
    const response = await fetch(input, init)
    const elapsedMs = Math.round(performance.now() - startedAt)
    devFetchLogger.debug("←", response.status, method, tag, `${elapsedMs}ms`)
    return response
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - startedAt)
    devFetchLogger.error("✗", method, tag, `${elapsedMs}ms`, error)
    throw error
  }
}
