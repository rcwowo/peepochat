export const CHATVOICE_IMPORT_PARAM = "cv_import"
export const CHATVOICE_IMPORT_PATH = `/app?${CHATVOICE_IMPORT_PARAM}=1`

const PENDING_KEY = "peepochat::chatvoice_import"
const ENABLED_PARAM_VALUES = new Set(["", "1", "true"])

export function isChatvoiceImportPending(): boolean {
  try {
    return window.sessionStorage.getItem(PENDING_KEY) === "1"
  } catch {
    return false
  }
}

function markChatvoiceImportPending() {
  try {
    window.sessionStorage.setItem(PENDING_KEY, "1")
  } catch {
    return
  }
}

export function clearChatvoiceImportPending() {
  try {
    window.sessionStorage.removeItem(PENDING_KEY)
  } catch {
    return
  }
}

export function captureChatvoiceImportLink(): boolean {
  if (typeof window === "undefined") {
    return false
  }

  const url = new URL(window.location.href)
  const value = url.searchParams.get(CHATVOICE_IMPORT_PARAM)
  if (value !== null) {
    url.searchParams.delete(CHATVOICE_IMPORT_PARAM)
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`
    )
    if (ENABLED_PARAM_VALUES.has(value.trim().toLowerCase())) {
      markChatvoiceImportPending()
    }
  }

  return isChatvoiceImportPending()
}
