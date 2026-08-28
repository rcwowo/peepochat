import type { SharedChatSourceProfile } from "@/lib/chat/shared-chat"

type SharedChatProfileStore = {
  profiles: Record<string, SharedChatSourceProfile>
  listeners: Set<() => void>
}

const store: SharedChatProfileStore = {
  profiles: {},
  listeners: new Set(),
}

function notifyListeners() {
  for (const listener of store.listeners) {
    listener()
  }
}

export function subscribeToSharedChatSourceProfiles(onStoreChange: () => void) {
  store.listeners.add(onStoreChange)
  return () => {
    store.listeners.delete(onStoreChange)
  }
}

export function getSharedChatSourceProfile(
  userId: string | null | undefined
): SharedChatSourceProfile | null {
  const id = userId?.trim() ?? ""
  if (!id) {
    return null
  }
  return store.profiles[id] ?? null
}

export function upsertSharedChatSourceProfiles(
  profiles: SharedChatSourceProfile[]
) {
  if (profiles.length === 0) {
    return
  }

  let changed = false
  const next = { ...store.profiles }

  for (const profile of profiles) {
    const existing = next[profile.userId]
    if (
      existing &&
      existing.login === profile.login &&
      existing.displayName === profile.displayName &&
      existing.profileImageUrl === profile.profileImageUrl
    ) {
      continue
    }

    next[profile.userId] = {
      userId: profile.userId,
      login: profile.login,
      displayName: profile.displayName,
      profileImageUrl:
        profile.profileImageUrl || existing?.profileImageUrl || "",
    }
    changed = true
  }

  if (!changed) {
    return
  }

  store.profiles = next
  notifyListeners()
}
