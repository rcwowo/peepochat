/**
 * Development-only logging. In production, lazy log builders are never invoked
 * and `import.meta.env.DEV` branches fold to no-ops at build time.
 */

import {
  isDevLogEnabled,
  type DevLogCategory,
} from "@/lib/dev/dev-log-settings"

const IS_DEV = import.meta.env.DEV

export type DevLogger = {
  debug: (...args: unknown[]) => void
  /** Avoids evaluating payload when logging is disabled (including production). */
  debugLazy: (build: () => readonly unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

function createDevLogger(scope: string, category: DevLogCategory): DevLogger {
  if (!IS_DEV) {
    const noop = () => {}
    return { debug: noop, debugLazy: noop, info: noop, warn: noop, error: noop }
  }

  const prefix = `[peepochat:${scope}]`
  const isDebugEnabled = () => isDevLogEnabled(category)

  return {
    debug: (...args: unknown[]) => {
      if (!isDebugEnabled()) return
      console.debug(prefix, ...args)
    },
    debugLazy: (build) => {
      if (!isDebugEnabled()) return
      console.debug(prefix, ...build())
    },
    info: (...args: unknown[]) => console.info(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
  }
}

export const devChatLogger = createDevLogger("chat", "chat")
export const devFetchLogger = createDevLogger("fetch", "fetch")

/** Verbose IRC line/kind logging (off by default even in dev). */
export function isDevIrcLoggingEnabled(): boolean {
  return isDevLogEnabled("irc")
}

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
