import * as React from "react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  ShieldBanIcon,
  ShuffleIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import {
  SettingsActionButton,
  SettingsCallout,
  SettingsGroup,
  SettingsSection,
  SettingsSwitchRow,
  SettingsTab,
} from "@/components/settings/settings-primitives"
import {
  TtsBrowserVoiceSelect,
  TtsVoiceProfileSelect,
} from "@/components/settings/tts/tts-settings-shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { useBrowserVoices } from "@/hooks/tts/use-browser-voices"
import { useTtsSettings } from "@/hooks/tts/use-tts-settings"
import {
  TTS_PREVIEW_TEXT,
  TTS_VOICE_PARAM_MAX,
  TTS_VOICE_PARAM_MIN,
  createVoiceProfile,
  normalizeLookupValue,
  pickRandomVoiceProfileId,
  type TtsVoiceAssignment,
  type TtsVoiceProfile,
} from "@/lib/tts/tts-config"
import {
  deleteVoiceAssignment,
  getVoiceAssignmentPage,
  putVoiceAssignment,
} from "@/lib/tts/tts-db"
import {
  createProfileUtterance,
  isSpeechSynthesisSupported,
  type BrowserVoice,
} from "@/lib/tts/speech-voices"

const ASSIGNMENT_PAGE_SIZE = 25
const TWITCH_LOGIN_PATTERN = /^[a-z0-9_]{1,25}$/

const lastSeenFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

function formatLastSeen(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : lastSeenFormatter.format(date)
}

export function TtsVoicesTab() {
  const { tts, updateTts } = useTtsSettings()
  const { voices, loading } = useBrowserVoices()

  const patchProfile = (id: string, patch: Partial<TtsVoiceProfile>) =>
    updateTts((current) => ({
      ...current,
      voiceProfiles: current.voiceProfiles.map((profile) =>
        profile.id === id ? { ...profile, ...patch } : profile
      ),
    }))

  return (
    <SettingsTab>
      {!isSpeechSynthesisSupported() ? (
        <SettingsCallout title="Speech isn't available">
          This browser doesn't support speech synthesis, so text-to-speech can't
          play here.
        </SettingsCallout>
      ) : null}

      <SettingsSection
        title="Voice assignment"
        description="Control how voices are given to chatters the first time they're spoken."
      >
        <SettingsGroup>
          <SettingsSwitchRow
            icon={ShuffleIcon}
            title="Auto-assign voices"
            description="Give each new chatter a random voice profile and remember it. When off, chatters without a saved voice use the default below."
            checked={tts.autoAssignVoices}
            onCheckedChange={(autoAssignVoices) =>
              updateTts({ autoAssignVoices })
            }
          />
          {!tts.autoAssignVoices ? (
            <div className="space-y-2 px-3 py-2.5">
              <div className="text-sm leading-tight font-medium">
                Default voice
              </div>
              <TtsVoiceProfileSelect
                ariaLabel="Default voice for unassigned chatters"
                value={tts.defaultVoiceProfileId}
                onChange={(defaultVoiceProfileId) =>
                  updateTts({ defaultVoiceProfileId })
                }
                profiles={tts.voiceProfiles}
                allowRandom
                randomLabel="Random (from enabled profiles)"
                className="sm:max-w-xs"
              />
            </div>
          ) : null}
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="Voice profiles"
        description="Rate, pitch, and volume aren't supported by every voice. Online voices in particular tend to ignore them."
      >
        <SettingsGroup>
          {tts.voiceProfiles.map((profile) => (
            <VoiceProfileRow
              key={profile.id}
              profile={profile}
              voices={voices}
              voicesLoading={loading}
              canDelete={tts.voiceProfiles.length > 1}
              onPatch={(patch) => patchProfile(profile.id, patch)}
              onDelete={() =>
                updateTts((current) => ({
                  ...current,
                  voiceProfiles: current.voiceProfiles.filter(
                    (entry) => entry.id !== profile.id
                  ),
                }))
              }
            />
          ))}
        </SettingsGroup>
        <SettingsActionButton
          variant="outline"
          onClick={() =>
            updateTts((current) => ({
              ...current,
              voiceProfiles: [
                ...current.voiceProfiles,
                createVoiceProfile(current.voiceProfiles),
              ],
            }))
          }
        >
          <PlusIcon className="size-3.5" />
          Add profile
        </SettingsActionButton>
      </SettingsSection>

      <VoiceAssignmentsSection />
    </SettingsTab>
  )
}

function VoiceParamSlider({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {value > 0 ? `+${value}` : value}
        </span>
      </div>
      <Slider
        min={TTS_VOICE_PARAM_MIN}
        max={TTS_VOICE_PARAM_MAX}
        step={1}
        value={[value]}
        aria-label={label}
        onValueChange={(values) => onChange(values[0] ?? 0)}
      />
    </div>
  )
}

function VoiceProfileRow({
  profile,
  voices,
  voicesLoading,
  canDelete,
  onPatch,
  onDelete,
}: {
  profile: TtsVoiceProfile
  voices: BrowserVoice[]
  voicesLoading: boolean
  canDelete: boolean
  onPatch: (patch: Partial<TtsVoiceProfile>) => void
  onDelete: () => void
}) {
  return (
    <div className="space-y-3 px-3 py-3">
      <div className="flex items-center gap-2">
        <Input
          value={profile.label}
          maxLength={80}
          aria-label="Profile name"
          placeholder="Profile name"
          onChange={(event) => onPatch({ label: event.target.value })}
          className="h-8 min-w-0 flex-1 font-medium"
        />
        <Switch
          checked={profile.enabled}
          aria-label="Use this profile for new chatters"
          onCheckedChange={(enabled) => onPatch({ enabled })}
        />
        <VoicePreviewButton profile={profile} />
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          aria-label="Delete profile"
          title={
            canDelete ? "Delete profile" : "At least one profile is needed"
          }
          disabled={!canDelete}
          onClick={onDelete}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </div>
      <TtsBrowserVoiceSelect
        value={profile.voice}
        onChange={(voice) => onPatch({ voice })}
        voices={voices}
        loading={voicesLoading}
      />
      <div className="grid gap-x-5 gap-y-3 pt-1 sm:grid-cols-3">
        <VoiceParamSlider
          label="Rate"
          value={profile.rate}
          onChange={(rate) => onPatch({ rate })}
        />
        <VoiceParamSlider
          label="Pitch"
          value={profile.pitch}
          onChange={(pitch) => onPatch({ pitch })}
        />
        <VoiceParamSlider
          label="Volume"
          value={profile.volume}
          onChange={(volume) => onPatch({ volume })}
        />
      </div>
    </div>
  )
}

function VoicePreviewButton({ profile }: { profile: TtsVoiceProfile }) {
  const [playing, setPlaying] = React.useState(false)
  const utteranceRef = React.useRef<SpeechSynthesisUtterance | null>(null)

  React.useEffect(() => {
    return () => {
      if (utteranceRef.current && isSpeechSynthesisSupported()) {
        utteranceRef.current = null
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  const stop = () => {
    if (utteranceRef.current && isSpeechSynthesisSupported()) {
      window.speechSynthesis.cancel()
    }
    utteranceRef.current = null
    setPlaying(false)
  }

  const play = () => {
    if (!isSpeechSynthesisSupported()) {
      toast.error("Speech synthesis isn't available in this browser.")
      return
    }

    window.speechSynthesis.cancel()
    const utterance = createProfileUtterance(TTS_PREVIEW_TEXT, profile)
    const finish = () => {
      if (utteranceRef.current === utterance) {
        utteranceRef.current = null
        setPlaying(false)
      }
    }
    utterance.onend = finish
    utterance.onerror = finish
    utteranceRef.current = utterance
    setPlaying(true)
    window.speechSynthesis.speak(utterance)
  }

  return (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label={playing ? "Stop preview" : "Preview voice"}
      title={playing ? "Stop preview" : "Preview voice"}
      onClick={playing ? stop : play}
    >
      {playing ? (
        <SquareIcon className="size-3" />
      ) : (
        <PlayIcon className="size-3.5" />
      )}
    </Button>
  )
}

function VoiceAssignmentsSection() {
  const { tts, updateTts } = useTtsSettings()
  const [query, setQuery] = React.useState("")
  const [page, setPage] = React.useState(0)
  const [refreshKey, setRefreshKey] = React.useState(0)
  const [rows, setRows] = React.useState<{
    items: TtsVoiceAssignment[]
    total: number
  }>({ items: [], total: 0 })
  const [newUserName, setNewUserName] = React.useState("")
  const [newVoiceProfileId, setNewVoiceProfileId] = React.useState("")

  const blockedUsers = React.useMemo(
    () => new Set(tts.blockedUsers.map(normalizeLookupValue)),
    [tts.blockedUsers]
  )

  React.useEffect(() => {
    let cancelled = false
    getVoiceAssignmentPage(page, ASSIGNMENT_PAGE_SIZE, {
      exclude: blockedUsers,
      query,
    }).then(
      (result) => {
        if (cancelled) {
          return
        }
        const lastPage = Math.max(
          0,
          Math.ceil(result.total / ASSIGNMENT_PAGE_SIZE) - 1
        )
        if (page > lastPage) {
          setPage(lastPage)
          return
        }
        setRows(result)
      },
      () => {
        if (!cancelled) {
          setRows({ items: [], total: 0 })
        }
      }
    )
    return () => {
      cancelled = true
    }
  }, [blockedUsers, page, query, refreshKey])

  const refresh = () => setRefreshKey((key) => key + 1)
  const totalPages = Math.max(1, Math.ceil(rows.total / ASSIGNMENT_PAGE_SIZE))
  const normalizedNewUser = normalizeLookupValue(newUserName)
  const canAdd = TWITCH_LOGIN_PATTERN.test(normalizedNewUser)

  const addAssignment = async () => {
    if (!canAdd) {
      return
    }
    const voiceProfileId = tts.voiceProfiles.some(
      (profile) => profile.id === newVoiceProfileId
    )
      ? newVoiceProfileId
      : pickRandomVoiceProfileId(tts.voiceProfiles)
    if (!voiceProfileId) {
      return
    }

    const now = new Date().toISOString()
    try {
      await putVoiceAssignment({
        userName: normalizedNewUser,
        displayName: newUserName.trim().replace(/^@/, ""),
        voiceProfileId,
        createdAt: now,
        lastSeenAt: now,
      })
      setNewUserName("")
      setNewVoiceProfileId("")
      refresh()
    } catch {
      toast.error("Couldn't save that voice assignment.")
    }
  }

  return (
    <SettingsSection
      title="Chatter voices"
      description="Voices remembered for each chatter. Reassign them anytime; they're stored in this browser and included in backups."
    >
      <SettingsGroup>
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          <Input
            value={newUserName}
            aria-label="Username"
            placeholder="Username"
            onChange={(event) => setNewUserName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void addAssignment()
              }
            }}
            className="h-8 min-w-0 flex-1 basis-40"
          />
          <TtsVoiceProfileSelect
            ariaLabel="Voice for new chatter"
            value={newVoiceProfileId}
            onChange={setNewVoiceProfileId}
            profiles={tts.voiceProfiles}
            allowRandom
            className="w-auto min-w-36 flex-1 basis-36 sm:flex-none"
          />
          <SettingsActionButton
            disabled={!canAdd}
            onClick={() => void addAssignment()}
          >
            <PlusIcon className="size-3.5" />
            Add
          </SettingsActionButton>
        </div>
        <div className="relative px-3 py-2.5">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-5.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            aria-label="Search chatters"
            placeholder="Search chatters…"
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(0)
            }}
            className="h-8 pl-8"
          />
        </div>
        {rows.items.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            {query
              ? "No chatters match your search."
              : "Chatters show up here once they've been spoken by text-to-speech."}
          </div>
        ) : (
          rows.items.map((assignment) => (
            <div
              key={assignment.userName}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2"
            >
              <div className="min-w-0 flex-1 basis-32">
                <div className="truncate text-sm leading-tight font-medium">
                  {assignment.displayName}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  @{assignment.userName} ·{" "}
                  {formatLastSeen(assignment.lastSeenAt)}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <TtsVoiceProfileSelect
                  ariaLabel={`Voice for ${assignment.displayName}`}
                  value={assignment.voiceProfileId}
                  onChange={(voiceProfileId) => {
                    void putVoiceAssignment({ ...assignment, voiceProfileId })
                      .then(refresh)
                      .catch(() =>
                        toast.error("Couldn't update that voice assignment.")
                      )
                  }}
                  profiles={tts.voiceProfiles}
                  className="w-36 sm:w-44"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Block ${assignment.displayName} from text-to-speech`}
                  title="Block from text-to-speech"
                  onClick={() =>
                    updateTts((current) => ({
                      ...current,
                      blockedUsers: [
                        ...current.blockedUsers.filter(
                          (user) =>
                            normalizeLookupValue(user) !== assignment.userName
                        ),
                        assignment.userName,
                      ],
                    }))
                  }
                >
                  <ShieldBanIcon className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Forget ${assignment.displayName}'s voice`}
                  title="Forget voice"
                  onClick={() => {
                    void deleteVoiceAssignment(assignment.userName)
                      .then(refresh)
                      .catch(() =>
                        toast.error("Couldn't remove that voice assignment.")
                      )
                  }}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </SettingsGroup>
      {rows.total > ASSIGNMENT_PAGE_SIZE ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {rows.total} chatters · page {page + 1} of {totalPages}
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
  )
}
