import * as React from "react"
import {
  ChevronDownIcon,
  PlayIcon,
  PlusIcon,
  ShuffleIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import {
  SettingsActionButton,
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
  type TtsVoiceProfile,
} from "@/lib/tts/tts-config"
import {
  createProfileUtterance,
  isSpeechSynthesisSupported,
  type BrowserVoice,
} from "@/lib/tts/speech-voices"
import { cn } from "@/lib/utils"

const PROFILE_GRID_CLASS_NAME =
  "grid grid-cols-[minmax(0,1fr)_2.5rem_5.5rem] items-center gap-x-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_3rem_3rem_3rem_2.5rem_5.5rem]"

function formatVoiceParam(value: number) {
  return value > 0 ? `+${value}` : String(value)
}

function describeBrowserVoice(
  voice: string,
  voices: BrowserVoice[],
  loading: boolean
) {
  if (voice === "") {
    return "Browser default"
  }
  if (voices.some((entry) => entry.name === voice) || loading) {
    return voice
  }
  return `${voice} (unavailable)`
}

export function TtsVoicesTab() {
  const { tts, updateTts } = useTtsSettings()
  const { voices, loading } = useBrowserVoices()
  const [expandedId, setExpandedId] = React.useState<string | null>(null)

  const patchProfile = (id: string, patch: Partial<TtsVoiceProfile>) =>
    updateTts((current) => ({
      ...current,
      voiceProfiles: current.voiceProfiles.map((profile) =>
        profile.id === id ? { ...profile, ...patch } : profile
      ),
    }))

  const addProfile = () => {
    const profile = createVoiceProfile(tts.voiceProfiles)
    updateTts((current) => ({
      ...current,
      voiceProfiles: [...current.voiceProfiles, profile],
    }))
    setExpandedId(profile.id)
  }

  return (
    <SettingsTab>
      <SettingsSection
        title="Voice assignment"
        description="Control which voice a chatter gets when they don't have one saved."
      >
        <SettingsGroup>
          <SettingsSwitchRow
            icon={ShuffleIcon}
            title="Auto-assign voices"
            description="Give each new chatter a random voice from the shuffle pool and remember it. This saves every chatter that gets spoken, so it's best left off in busy chats."
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
                ariaLabel="Default voice for chatters without a saved voice"
                value={tts.defaultVoiceProfileId}
                onChange={(defaultVoiceProfileId) =>
                  updateTts({ defaultVoiceProfileId })
                }
                profiles={tts.voiceProfiles}
                emptyLabel="Random from the shuffle pool"
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
          <div
            role="table"
            aria-label="Voice profiles"
            className="divide-y divide-border"
          >
            <div
              role="row"
              className={cn(
                PROFILE_GRID_CLASS_NAME,
                "bg-muted/30 px-3 py-1.5 text-[11px] font-medium text-muted-foreground"
              )}
            >
              <span role="columnheader">Name</span>
              <span role="columnheader" className="hidden lg:block">
                Voice
              </span>
              <span role="columnheader" className="hidden text-right lg:block">
                Rate
              </span>
              <span role="columnheader" className="hidden text-right lg:block">
                Pitch
              </span>
              <span role="columnheader" className="hidden text-right lg:block">
                Volume
              </span>
              <span
                role="columnheader"
                className="flex justify-center"
                title="Included when a random voice is picked"
              >
                <ShuffleIcon aria-hidden className="size-3.5" />
                <span className="sr-only">In shuffle pool</span>
              </span>
              <span role="columnheader">
                <span className="sr-only">Actions</span>
              </span>
            </div>
            {tts.voiceProfiles.map((profile) => (
              <VoiceProfileRow
                key={profile.id}
                profile={profile}
                voices={voices}
                voicesLoading={loading}
                expanded={expandedId === profile.id}
                onToggleExpanded={() =>
                  setExpandedId((current) =>
                    current === profile.id ? null : profile.id
                  )
                }
                canDelete={tts.voiceProfiles.length > 1}
                onPatch={(patch) => patchProfile(profile.id, patch)}
                onDelete={() => {
                  if (expandedId === profile.id) {
                    setExpandedId(null)
                  }
                  updateTts((current) => ({
                    ...current,
                    voiceProfiles: current.voiceProfiles.filter(
                      (entry) => entry.id !== profile.id
                    ),
                  }))
                }}
              />
            ))}
          </div>
        </SettingsGroup>
        <SettingsActionButton variant="outline" onClick={addProfile}>
          <PlusIcon className="size-3.5" />
          Add profile
        </SettingsActionButton>
      </SettingsSection>
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
          {formatVoiceParam(value)}
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
  expanded,
  onToggleExpanded,
  canDelete,
  onPatch,
  onDelete,
}: {
  profile: TtsVoiceProfile
  voices: BrowserVoice[]
  voicesLoading: boolean
  expanded: boolean
  onToggleExpanded: () => void
  canDelete: boolean
  onPatch: (patch: Partial<TtsVoiceProfile>) => void
  onDelete: () => void
}) {
  const editorId = React.useId()
  const name = profile.label.trim() || "Unnamed voice"
  const voiceLabel = describeBrowserVoice(profile.voice, voices, voicesLoading)

  return (
    <div role="rowgroup" className={cn(expanded && "bg-muted/20")}>
      <div
        role="row"
        className={cn(PROFILE_GRID_CLASS_NAME, "px-3 py-1.5 text-sm")}
      >
        <div role="cell" className="min-w-0">
          <button
            type="button"
            onClick={onToggleExpanded}
            aria-expanded={expanded}
            aria-controls={editorId}
            className="block max-w-full cursor-pointer truncate rounded-sm text-left font-medium outline-none hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {name}
          </button>
          <div className="truncate text-[11px] text-muted-foreground lg:hidden">
            {voiceLabel}
          </div>
        </div>
        <div
          role="cell"
          className="hidden truncate text-xs text-muted-foreground lg:block"
          title={voiceLabel}
        >
          {voiceLabel}
        </div>
        <div
          role="cell"
          className="hidden text-right text-xs text-muted-foreground tabular-nums lg:block"
        >
          {formatVoiceParam(profile.rate)}
        </div>
        <div
          role="cell"
          className="hidden text-right text-xs text-muted-foreground tabular-nums lg:block"
        >
          {formatVoiceParam(profile.pitch)}
        </div>
        <div
          role="cell"
          className="hidden text-right text-xs text-muted-foreground tabular-nums lg:block"
        >
          {formatVoiceParam(profile.volume)}
        </div>
        <div role="cell" className="flex justify-center">
          <Switch
            size="sm"
            checked={profile.enabled}
            aria-label={`Include ${name} when picking random voices`}
            onCheckedChange={(enabled) => onPatch({ enabled })}
          />
        </div>
        <div role="cell" className="flex items-center justify-end gap-0.5">
          <VoicePreviewButton profile={profile} />
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            aria-label={expanded ? `Close ${name}` : `Edit ${name}`}
            title={expanded ? "Close" : "Edit"}
            aria-expanded={expanded}
            aria-controls={editorId}
            onClick={onToggleExpanded}
          >
            <ChevronDownIcon
              className={cn(
                "size-3.5 transition-transform",
                expanded && "rotate-180"
              )}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            aria-label={`Delete ${name}`}
            title={
              canDelete ? "Delete profile" : "At least one profile is needed"
            }
            disabled={!canDelete}
            onClick={onDelete}
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
      </div>
      {expanded ? (
        <div
          id={editorId}
          role="row"
          className="border-t border-border/60 px-3 pt-2.5 pb-3.5"
        >
          <div role="cell" className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                value={profile.label}
                maxLength={80}
                aria-label="Profile name"
                placeholder="Profile name"
                onChange={(event) => onPatch({ label: event.target.value })}
                className="h-8 min-w-0"
              />
              <TtsBrowserVoiceSelect
                value={profile.voice}
                onChange={(voice) => onPatch({ voice })}
                voices={voices}
                loading={voicesLoading}
              />
            </div>
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
        </div>
      ) : null}
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
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground hover:text-foreground"
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
