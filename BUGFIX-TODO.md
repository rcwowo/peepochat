# Bug Fix Checklist (temporary — delete when done)

An agent should work through these one by one, marking `- [ ]` → `- [x]` as each is completed.
Verify each fix compiles with `bun run lint` and `bun run build` before marking done.

## High

- [x] **1. One invalid persisted field silently wipes the entire config**
  - File: `src/lib/peepochat/peepochat-config.ts:597-612`
  - `loadConfig()` catches a failed zod `parse` and returns `createDefaultConfig()`, so a single
    out-of-range value (e.g. stored `fontSizePx: 26`, renamed enum, truncated write) throws and
    replaces everything: user is silently logged out, loses channels, splits, and highlight rules.
    The next `saveConfig` overwrites the old data permanently.
  - Fix direction: repair/recover invalid fields instead of nuking the config (e.g. sanitize
    field-by-field or fall back to a previous backup copy), never silently discard auth + channels.

- [x] **2. Chat scroll listeners bound once to a conditionally-mounted node**
  - Files: `src/components/chat/pane/pane.tsx:656-678`, `src/hooks/chat-ui/use-chat-scroll.ts:455-547`
  - `use-chat-scroll` attaches wheel/touch/pointer/scrollend listeners once; the effect bails when
    `chatContainerRef.current` is null — which is the normal state on first join / channel switch
    (timeline is empty, so a different node occupies the ref). When messages arrive, the real scroll
    container mounts but the listeners are never attached. Pausing chat on scroll-up, scrollbar
    drag pause, and resume-scroll cancellation behave intermittently.
  - Note: the sibling ResizeObserver effect in the same file correctly includes
    `displayedTimeline.length` in deps — this one was missed. Fix the deps or re-attach via a
    ref callback.

## Connection lifecycle & reconnect (#4, #5, #12)

- [x] **4. IRC reconnect has no backoff → 1 Hz reconnect storm while offline** (medium)
  - File: `src/lib/twitch/chat/chat.ts:275, 851-871`
  - Fixed 1s `scheduleReconnect` forever, for both read and send clients. The 7TV and EventSub
    clients in this codebase implement capped exponential backoff; this one doesn't.
  - Fix direction: add attempt counter + capped exponential backoff, reset on successful open.

- [x] **5. Send-client probe state never cleared on unexpected disconnect** (medium)
  - File: `src/lib/twitch/chat/chat.ts:301, 438-467, 525-550`
  - The close handler cleans up read-mode state only. Channels stuck in `statusProbeChannels`
    mid-probe are skipped forever after reconnect (`probeSendStatus` checks `.has()`), so
    send-restriction detection (bans/timeouts) silently stops working for those channels until a
    full resync.
  - Fix direction: clear `statusProbeChannels` (and stale send-mode `joinedChannels`) in the close
    handler like read mode does.

- [x] **12. 7TV `reconnectAttempt` not reset on explicit disconnect** (low)
  - File: `src/lib/seventv/event-api.ts:139`
  - Counter only resets in `socket.onopen`. After a long offline stretch (capped 120s retries),
    `disconnect()` + later `retain()` makes the first failure wait up to ~120s instead of 1s.

## Cache & memory hygiene (#7, #10, #9, #11, #13)

- [ ] **7. IndexedDB connections opened per operation, never closed** (medium)
  - File: `src/lib/highlights/custom-sounds.ts:17-64`
  - Every sound read/write opens a fresh `IDBDatabase` and drops it without `close()`;
    `restoreEmbeddedCustomSounds` leaks one connection per sound during backup import.
  - Fix direction: close the database after each transaction completes, or cache a single
    connection.

- [ ] **10. Failed IVR emote lookups cached permanently (no negative-cache TTL)** (low)
  - File: `src/lib/twitch/emotes/ivr.ts:30-45`
  - A transient IVR outage poisons the cache entry (null) for that emote id for the whole session;
    emote cards show fallback details until reload.

- [ ] **9. Unbounded `dismissedMissedPingIds` set** (low)
  - File: `src/lib/highlights/notification-center.ts:55, 463, 483`
  - Every dismissed/removed/replaced missed-ping notification adds an id that is never pruned;
    slow unbounded growth for the session.

- [ ] **11. User-card caches with no eviction/cap** (low)
  - File: `src/hooks/chat-ui/use-user-card.ts:82-85`
  - `profileCache` / `profileInflight` / `statusCache` maps are unbounded; TTL only checked on
    read, stale entries never deleted; token/scope changes add new keys without clearing old ones.

- [ ] **13. Stale `Audio` elements referencing revoked blob URLs** (low)
  - Files: `src/lib/highlights/alert-sounds.ts:17-29`, `src/lib/highlights/custom-sounds.ts:131-139`
  - `revokeCustomSoundObjectUrl` revokes the blob URL but the cached `HTMLAudioElement` in
    `audioCache` still references it and is never evicted.

## Composer UI state (#6)

- [x] **6. Emote picker spontaneously reopens after being force-closed by `disabled`** (medium)
  - Files: `src/components/chat/composer/emote-picker.tsx:140`, `src/components/chat/composer/composer.tsx:309-310`
  - `<Popover open={open && !disabled}>` renders closed while parent state stays `true`; when
    `disabled` flips back (reconnect/unban), the picker pops open with no user action.
  - Fix direction: add an effect that calls `onOpenChange(false)` (or `setEmotePickerOpen(false)`)
    when `disabled` becomes true while open.

## Config persistence / backup restore (#3)

- [x] **3. `restoreBackup` persists the unmerged config** (medium)
  - File: `src/hooks/peepochat/use-peepochat-config.ts:112-130`
  - `merged` is assigned inside a deferred `setState` updater, but `saveConfig(merged)` and
    `needsOnboardingForConfig(merged)` run synchronously with the stale (pre-merge) value. Backups
    strip the access token, so restoring then refreshing logs the user out — defeating
    `mergeRestoredConfig`'s purpose of keeping the session alive.
  - Fix direction: compute the merge synchronously (read current config outside the updater)
    before calling `setConfig`/`saveConfig`.

## Twitch live-data hooks (#8)

- [x] **8. Followed-channels/live data fetched once, never refreshed** (medium)
  - File: `src/hooks/twitch/use-followed-channels.ts:113-252`
  - 60s cache TTL exists, but nothing ever re-triggers the fetch after it expires (no interval /
    visibility listener). Live/offline indicators freeze for the whole session.
  - Fix direction: add a refresh interval or re-check the cache on visibility/focus.
