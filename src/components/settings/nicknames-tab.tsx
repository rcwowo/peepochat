import * as React from "react"
import { PenLineIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import {
  SettingsGroup,
  SettingsSection,
  SettingsTab,
} from "@/components/settings/settings-primitives"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  NICKNAME_MAX_LENGTH,
  isValidNickname,
  isValidTwitchLogin,
} from "@/lib/chat/nicknames"
import type { NicknameEntry } from "@/lib/peepochat/peepochat-config"
import { usePeepochatSettings } from "@/lib/peepochat/peepochat-context"

type NicknameValidation = { ok: true } | { ok: false; message: string }

function validateNicknameEntry(
  entries: NicknameEntry[],
  login: string,
  nickname: string
): NicknameValidation {
  if (!isValidTwitchLogin(login)) {
    return {
      ok: false,
      message: "Username must be 3–25 letters, numbers, or underscores.",
    }
  }

  if (!isValidNickname(nickname)) {
    return {
      ok: false,
      message: `Nickname must be 1–${NICKNAME_MAX_LENGTH} letters, numbers, or underscores.`,
    }
  }

  const nicknameKey = nickname.toLowerCase()
  for (const entry of entries) {
    const otherLogin = entry.login.toLowerCase()
    if (otherLogin === login) {
      continue
    }
    if (entry.nickname.toLowerCase() === nicknameKey) {
      return {
        ok: false,
        message: `"${entry.nickname}" is already the nickname of @${otherLogin}.`,
      }
    }
  }

  return { ok: true }
}

const nicknameInputProps = {
  maxLength: NICKNAME_MAX_LENGTH,
  spellCheck: false,
  autoCapitalize: "none" as const,
  className: "h-8 min-w-0 text-sm",
}

function NicknameRow({
  entry,
  entries,
  onNicknameChange,
  onRemove,
}: {
  entry: NicknameEntry
  entries: NicknameEntry[]
  onNicknameChange: (login: string, nickname: string) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(entry.nickname)
  const [prevNickname, setPrevNickname] = React.useState(entry.nickname)

  if (entry.nickname !== prevNickname) {
    setPrevNickname(entry.nickname)
    if (!editing) {
      setDraft(entry.nickname)
    }
  }

  const startEditing = () => {
    setDraft(entry.nickname)
    setEditing(true)
  }

  const commit = () => {
    if (!editing) {
      return
    }
    setEditing(false)

    const nickname = draft.trim()
    if (nickname === entry.nickname) {
      setDraft(entry.nickname)
      return
    }

    const validation = validateNicknameEntry(entries, entry.login, nickname)
    if (!validation.ok) {
      toast.error(validation.message)
      setDraft(entry.nickname)
      return
    }

    onNicknameChange(entry.login, nickname)
  }

  const cancel = () => {
    setEditing(false)
    setDraft(entry.nickname)
  }

  return (
    <div className="group flex min-w-0 items-center gap-2.5 px-3 py-2 transition-colors hover:bg-muted/40">
      {editing ? (
        <Input
          {...nicknameInputProps}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              event.currentTarget.blur()
            }
            if (event.key === "Escape") {
              event.preventDefault()
              cancel()
              event.currentTarget.blur()
            }
          }}
          autoFocus
          aria-label={`Rename nickname for @${entry.login}`}
        />
      ) : (
        <button
          type="button"
          className="min-w-0 cursor-pointer truncate text-left text-sm font-medium text-foreground transition-colors outline-none hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring/60"
          onClick={startEditing}
          aria-label={`Edit nickname for @${entry.login}`}
        >
          {entry.nickname}
        </button>
      )}
      <span className="min-w-0 truncate text-xs text-muted-foreground">
        @{entry.login}
      </span>
      <div className="ml-auto flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-foreground"
          onClick={startEditing}
          aria-label={`Rename nickname ${entry.nickname}`}
        >
          <PenLineIcon className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label={`Remove nickname ${entry.nickname}`}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

export function NicknamesTab() {
  const { config, updateConfig } = usePeepochatSettings()
  const entries = config.nicknames.entries
  const [newLogin, setNewLogin] = React.useState("")
  const [newNickname, setNewNickname] = React.useState("")

  const addNickname = () => {
    const login = newLogin.trim().toLowerCase()
    const nickname = newNickname.trim()
    if (!login || !nickname) {
      return
    }

    const isExistingUser = entries.some((entry) => entry.login === login)
    const validation = validateNicknameEntry(entries, login, nickname)
    if (!validation.ok) {
      toast.error(validation.message)
      return
    }

    updateConfig((current) => ({
      ...current,
      nicknames: {
        entries: isExistingUser
          ? current.nicknames.entries.map((entry) =>
              entry.login === login ? { login, nickname } : entry
            )
          : [...current.nicknames.entries, { login, nickname }],
      },
    }))
    setNewLogin("")
    setNewNickname("")
  }

  const removeNickname = (login: string) => {
    updateConfig((current) => ({
      ...current,
      nicknames: {
        entries: current.nicknames.entries.filter(
          (entry) => entry.login !== login
        ),
      },
    }))
  }

  const changeNickname = (login: string, nickname: string) => {
    updateConfig((current) => ({
      ...current,
      nicknames: {
        entries: current.nicknames.entries.map((entry) =>
          entry.login === login ? { ...entry, nickname } : entry
        ),
      },
    }))
  }

  return (
    <SettingsTab>
      <SettingsSection title="Nicknames">
        <SettingsGroup>
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-2.5",
              entries.length > 0 && "border-b border-border"
            )}
          >
            <Input
              {...nicknameInputProps}
              placeholder="Username"
              aria-label="Add a nickname"
              value={newLogin}
              onChange={(event) => setNewLogin(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  addNickname()
                }
              }}
            />
            <Input
              {...nicknameInputProps}
              placeholder="Nickname"
              aria-label="Nickname for the added username"
              value={newNickname}
              onChange={(event) => setNewNickname(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  addNickname()
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={addNickname}
              disabled={!newLogin.trim() || !newNickname.trim()}
            >
              Add
            </Button>
          </div>

          {entries.length === 0 ? (
            <p className="px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              No nicknames yet.
            </p>
          ) : (
            entries.map((entry) => (
              <NicknameRow
                key={entry.login}
                entry={entry}
                entries={entries}
                onNicknameChange={changeNickname}
                onRemove={() => removeNickname(entry.login)}
              />
            ))
          )}
        </SettingsGroup>
      </SettingsSection>
    </SettingsTab>
  )
}
