import * as React from "react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  SettingsGroup,
  SettingsSection,
  SettingsTab,
} from "@/components/settings/settings-primitives"
import { TtsVoiceProfileSelect } from "@/components/settings/tts/tts-settings-shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useSpeechAvailability } from "@/hooks/tts/use-browser-voices"
import { useTtsSettings } from "@/hooks/tts/use-tts-settings"
import {
  NICKNAME_MAX_LENGTH,
  isValidNickname,
  isValidTwitchLogin,
} from "@/lib/chat/nicknames"
import type { NicknameEntry } from "@/lib/peepochat/peepochat-config"
import { usePeepochatSettings } from "@/lib/peepochat/peepochat-context"
import {
  hasVoiceProfile,
  normalizeLookupValue,
  type TtsVoiceAssignment,
} from "@/lib/tts/tts-config"
import {
  buildUserDirectoryPage,
  deleteVoiceAssignment,
  getUserDirectoryPage,
  getVoiceAssignment,
  putVoiceAssignment,
  type UserDirectoryEntry,
} from "@/lib/tts/tts-db"
import { cn } from "@/lib/utils"

const USER_PAGE_SIZE = 25

const lastHeardFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

function formatLastHeard(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : lastHeardFormatter.format(date)
}

type ValidationResult = { ok: true } | { ok: false; message: string }

function validateNickname(
  entries: NicknameEntry[],
  login: string,
  nickname: string
): ValidationResult {
  if (!isValidNickname(nickname)) {
    return {
      ok: false,
      message: `Nickname must be 1–${NICKNAME_MAX_LENGTH} letters, numbers, or underscores.`,
    }
  }

  const nicknameKey = nickname.toLowerCase()
  const conflict = entries.find(
    (entry) =>
      entry.login !== login && entry.nickname.toLowerCase() === nicknameKey
  )
  if (conflict) {
    return {
      ok: false,
      message: `"${conflict.nickname}" is already the nickname of @${conflict.login}.`,
    }
  }

  return { ok: true }
}

function gridClassName(showVoices: boolean) {
  return cn(
    "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5",
    showVoices
      ? "md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_4.25rem]"
      : "md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_2rem]"
  )
}

const nicknameInputProps = {
  maxLength: NICKNAME_MAX_LENGTH,
  spellCheck: false,
  autoCapitalize: "none" as const,
}

function NicknameCell({
  login,
  nickname,
  onCommit,
}: {
  login: string
  nickname: string
  onCommit: (nickname: string) => boolean
}) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(nickname)
  const restoreFocusRef = React.useRef(false)

  const focusButton = (node: HTMLButtonElement | null) => {
    if (node && restoreFocusRef.current) {
      restoreFocusRef.current = false
      node.focus()
    }
  }

  const startEditing = () => {
    setDraft(nickname)
    setEditing(true)
  }

  const commit = () => {
    if (!editing) {
      return
    }
    setEditing(false)
    const next = draft.trim()
    if (next !== nickname) {
      onCommit(next)
    }
  }

  if (editing) {
    return (
      <Input
        {...nicknameInputProps}
        value={draft}
        placeholder="Nickname"
        data-settings-inline-edit
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            restoreFocusRef.current = true
            event.currentTarget.blur()
          }
          if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            restoreFocusRef.current = true
            setEditing(false)
          }
        }}
        autoFocus
        aria-label={`Nickname for @${login}`}
        className="h-8 min-w-0 text-sm"
      />
    )
  }

  return (
    <button
      ref={focusButton}
      type="button"
      onClick={startEditing}
      aria-label={
        nickname
          ? `Edit nickname ${nickname} for @${login}`
          : `Add a nickname for @${login}`
      }
      className={cn(
        "flex h-8 w-full min-w-0 cursor-pointer items-center truncate rounded-md border border-transparent px-2 text-left text-sm transition-colors outline-none hover:border-border hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring/60",
        nickname ? "font-medium" : "text-muted-foreground/70"
      )}
    >
      <span className="truncate">{nickname || "Add nickname"}</span>
    </button>
  )
}

function UserRow({
  entry,
  nickname,
  showVoices,
  blocked,
  onNicknameCommit,
  onVoiceChange,
  onToggleBlocked,
  onRemove,
}: {
  entry: UserDirectoryEntry
  nickname: string
  showVoices: boolean
  blocked: boolean
  onNicknameCommit: (nickname: string) => boolean
  onVoiceChange: (voiceProfileId: string) => void
  onToggleBlocked: () => void
  onRemove: () => void
}) {
  const { tts } = useTtsSettings()
  const { login, assignment } = entry
  const displayName = assignment?.displayName.trim() || login
  const showLogin = displayName.toLowerCase() !== login
  const lastHeard = assignment ? formatLastHeard(assignment.lastSeenAt) : ""
  const voiceValue =
    assignment && hasVoiceProfile(tts.voiceProfiles, assignment.voiceProfileId)
      ? assignment.voiceProfileId
      : ""

  return (
    <div
      role="row"
      className={cn(gridClassName(showVoices), "px-3 py-2 md:py-1.5")}
    >
      <div role="cell" className="row-start-1 min-w-0 md:row-start-auto">
        <div
          className={cn(
            "truncate text-sm leading-tight font-medium",
            blocked && "text-muted-foreground line-through"
          )}
        >
          {displayName}
        </div>
        {showLogin || lastHeard ? (
          <div className="truncate text-[11px] text-muted-foreground">
            {[
              showLogin ? `@${login}` : null,
              lastHeard ? `Heard ${lastHeard}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        ) : null}
      </div>
      <div
        role="cell"
        className={cn(
          "row-start-2 min-w-0 md:row-start-auto",
          !showVoices && "col-span-2 md:col-span-1"
        )}
      >
        <NicknameCell
          login={login}
          nickname={nickname}
          onCommit={onNicknameCommit}
        />
      </div>
      {showVoices ? (
        <div role="cell" className="row-start-2 min-w-0 md:row-start-auto">
          <TtsVoiceProfileSelect
            ariaLabel={`Voice for @${login}`}
            value={voiceValue}
            onChange={onVoiceChange}
            profiles={tts.voiceProfiles}
            emptyLabel={
              tts.autoAssignVoices ? "Assign automatically" : "Default voice"
            }
          />
        </div>
      ) : null}
      <div
        role="cell"
        className="col-start-2 row-start-1 flex items-center justify-end gap-0.5 md:col-start-auto md:row-start-auto"
      >
        {showVoices ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn(
              blocked
                ? "text-destructive hover:text-destructive"
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-label={`Mute @${login} in Chatvoice`}
            aria-pressed={blocked}
            title={
              blocked
                ? "Muted in Chatvoice. Click to unmute."
                : "Mute in Chatvoice"
            }
            onClick={onToggleBlocked}
          >
            {blocked ? (
              <VolumeXIcon className="size-3.5" />
            ) : (
              <Volume2Icon className="size-3.5" />
            )}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          aria-label={`Remove @${login}`}
          title={
            showVoices ? "Remove nickname and saved voice" : "Remove nickname"
          }
          onClick={onRemove}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

export function UsersTab() {
  const { config, updateConfig } = usePeepochatSettings()
  const { tts, updateTts } = useTtsSettings()
  const showVoices = useSpeechAvailability() !== "unavailable"
  const entries = config.nicknames.entries
  const [query, setQuery] = React.useState("")
  const [page, setPage] = React.useState(0)
  const [refreshKey, setRefreshKey] = React.useState(0)
  const [rows, setRows] = React.useState<{
    items: UserDirectoryEntry[]
    total: number
  }>({ items: [], total: 0 })
  const [newLogin, setNewLogin] = React.useState("")
  const [newNickname, setNewNickname] = React.useState("")
  const [newVoiceProfileId, setNewVoiceProfileId] = React.useState("")

  const nicknameByLogin = React.useMemo(
    () => new Map(entries.map((entry) => [entry.login, entry.nickname])),
    [entries]
  )
  const blockedUsers = React.useMemo(
    () => new Set(tts.blockedUsers.map(normalizeLookupValue)),
    [tts.blockedUsers]
  )

  React.useEffect(() => {
    let cancelled = false
    const search = query.trim().toLowerCase().replace(/^@/, "")
    const logins = [...nicknameByLogin.keys()]
    const include = ({ login, assignment }: UserDirectoryEntry) =>
      !search ||
      login.includes(search) ||
      (assignment?.displayName.toLowerCase().includes(search) ?? false) ||
      (nicknameByLogin.get(login)?.toLowerCase().includes(search) ?? false)
    const nicknamesOnly = () =>
      buildUserDirectoryPage(page, USER_PAGE_SIZE, logins, include).finish()

    const request = showVoices
      ? getUserDirectoryPage(page, USER_PAGE_SIZE, logins, include).catch(
          nicknamesOnly
        )
      : Promise.resolve().then(nicknamesOnly)

    void request.then((result) => {
      if (cancelled) {
        return
      }
      const lastPage = Math.max(0, Math.ceil(result.total / USER_PAGE_SIZE) - 1)
      if (page > lastPage) {
        setPage(lastPage)
        return
      }
      setRows(result)
    })

    return () => {
      cancelled = true
    }
  }, [nicknameByLogin, page, query, refreshKey, showVoices])

  const refresh = () => setRefreshKey((key) => key + 1)

  const setNickname = (login: string, nickname: string): boolean => {
    if (nickname) {
      const validation = validateNickname(entries, login, nickname)
      if (!validation.ok) {
        toast.error(validation.message)
        return false
      }
    }

    updateConfig((current) => {
      const others = current.nicknames.entries.filter(
        (entry) => entry.login !== login
      )
      const existing = current.nicknames.entries.some(
        (entry) => entry.login === login
      )
      return {
        ...current,
        nicknames: {
          entries: !nickname
            ? others
            : existing
              ? current.nicknames.entries.map((entry) =>
                  entry.login === login ? { ...entry, nickname } : entry
                )
              : [...current.nicknames.entries, { login, nickname }],
        },
      }
    })
    return true
  }

  const saveVoice = async (
    login: string,
    assignment: TtsVoiceAssignment | null,
    voiceProfileId: string
  ) => {
    try {
      if (!voiceProfileId) {
        await deleteVoiceAssignment(login)
      } else {
        const now = new Date().toISOString()
        await putVoiceAssignment({
          userName: login,
          displayName: assignment?.displayName || login,
          voiceProfileId,
          createdAt: assignment?.createdAt ?? now,
          lastSeenAt: assignment?.lastSeenAt ?? now,
        })
      }
      return true
    } catch {
      toast.error("Couldn't save that voice.")
      return false
    } finally {
      refresh()
    }
  }

  const toggleBlocked = (login: string) => {
    updateTts((current) => {
      const others = current.blockedUsers.filter(
        (user) => normalizeLookupValue(user) !== login
      )
      return {
        ...current,
        blockedUsers:
          others.length === current.blockedUsers.length
            ? [...others, login]
            : others,
      }
    })
  }

  const removeUser = async (login: string) => {
    if (nicknameByLogin.has(login)) {
      setNickname(login, "")
    }
    if (showVoices) {
      try {
        await deleteVoiceAssignment(login)
      } catch {
        toast.error("Couldn't remove that saved voice.")
      }
    }
    refresh()
  }

  const normalizedNewLogin = newLogin.trim().replace(/^@/, "").toLowerCase()
  const trimmedNewNickname = newNickname.trim()
  const newVoice = showVoices ? newVoiceProfileId : ""
  const canAdd =
    isValidTwitchLogin(normalizedNewLogin) &&
    (trimmedNewNickname !== "" || newVoice !== "")

  const addUser = async () => {
    if (!normalizedNewLogin) {
      return
    }
    if (!isValidTwitchLogin(normalizedNewLogin)) {
      toast.error("Username must be 3–25 letters, numbers, or underscores.")
      return
    }
    if (!canAdd) {
      return
    }
    if (
      trimmedNewNickname &&
      !setNickname(normalizedNewLogin, trimmedNewNickname)
    ) {
      return
    }
    if (newVoice) {
      const existing = await getVoiceAssignment(normalizedNewLogin).catch(
        () => undefined
      )
      const ok = await saveVoice(normalizedNewLogin, existing ?? null, newVoice)
      if (!ok) {
        return
      }
    }
    setNewLogin("")
    setNewNickname("")
    setNewVoiceProfileId("")
    refresh()
  }

  const handleAddKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault()
      void addUser()
    }
  }

  const totalPages = Math.max(1, Math.ceil(rows.total / USER_PAGE_SIZE))
  const emptyMessage = query.trim()
    ? "No users match your search."
    : showVoices
      ? "Add a nickname or voice above. Chatters with saved voices also show up here."
      : "Add a nickname above to get started."

  return (
    <SettingsTab>
      <SettingsSection
        title="Add a user"
        description={
          showVoices
            ? "Give a chatter a nickname, a Chatvoice voice, or both. Nicknames replace their name in chat."
            : "Give a chatter a nickname that replaces their name in chat."
        }
      >
        <SettingsGroup>
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
            <Input
              {...nicknameInputProps}
              value={newLogin}
              placeholder="Username"
              aria-label="Username"
              onChange={(event) => setNewLogin(event.target.value)}
              onKeyDown={handleAddKeyDown}
              className="h-8 min-w-0 flex-1 basis-32 text-sm"
            />
            <Input
              {...nicknameInputProps}
              value={newNickname}
              placeholder="Nickname (optional)"
              aria-label="Nickname"
              onChange={(event) => setNewNickname(event.target.value)}
              onKeyDown={handleAddKeyDown}
              className="h-8 min-w-0 flex-1 basis-32 text-sm"
            />
            {showVoices ? (
              <TtsVoiceProfileSelect
                ariaLabel="Voice"
                value={newVoiceProfileId}
                onChange={setNewVoiceProfileId}
                profiles={tts.voiceProfiles}
                emptyLabel="No saved voice"
                className="min-w-0 flex-1 basis-36"
              />
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => void addUser()}
              disabled={!canAdd}
            >
              <PlusIcon className="size-3.5" />
              Add
            </Button>
          </div>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title="Users">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            aria-label="Search users"
            placeholder="Search users…"
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(0)
            }}
            className="h-8 pl-8"
          />
        </div>
        <SettingsGroup>
          <div
            role="table"
            aria-label="Users"
            className="divide-y divide-border"
          >
            <div
              role="row"
              className={cn(
                gridClassName(showVoices),
                "hidden bg-muted/30 px-3 py-1.5 text-[11px] font-medium text-muted-foreground md:grid"
              )}
            >
              <span role="columnheader">User</span>
              <span role="columnheader" className="px-2">
                Nickname
              </span>
              {showVoices ? (
                <span role="columnheader" className="px-2.5">
                  Voice
                </span>
              ) : null}
              <span role="columnheader">
                <span className="sr-only">Actions</span>
              </span>
            </div>
            {rows.items.length === 0 ? (
              <div role="row">
                <div
                  role="cell"
                  className="px-3 py-6 text-center text-xs text-muted-foreground"
                >
                  {emptyMessage}
                </div>
              </div>
            ) : (
              rows.items.map((entry) => (
                <UserRow
                  key={entry.login}
                  entry={entry}
                  nickname={nicknameByLogin.get(entry.login) ?? ""}
                  showVoices={showVoices}
                  blocked={blockedUsers.has(entry.login)}
                  onNicknameCommit={(nickname) =>
                    setNickname(entry.login, nickname)
                  }
                  onVoiceChange={(voiceProfileId) =>
                    void saveVoice(
                      entry.login,
                      entry.assignment,
                      voiceProfileId
                    )
                  }
                  onToggleBlocked={() => toggleBlocked(entry.login)}
                  onRemove={() => void removeUser(entry.login)}
                />
              ))
            )}
          </div>
        </SettingsGroup>
        {rows.total > USER_PAGE_SIZE ? (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {rows.total} users · page {page + 1} of {totalPages}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Previous page"
                disabled={page === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                <ChevronLeftIcon className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Next page"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((current) => current + 1)}
              >
                <ChevronRightIcon className="size-3.5" />
              </Button>
            </div>
          </div>
        ) : null}
      </SettingsSection>
    </SettingsTab>
  )
}
