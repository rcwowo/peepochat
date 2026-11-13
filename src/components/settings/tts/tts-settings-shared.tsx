import * as React from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  TTS_COMMAND_ROLE_OPTIONS,
  parseLines,
  type TtsCommandRole,
  type TtsVoiceProfile,
} from "@/lib/tts/tts-config"
import type { BrowserVoice } from "@/lib/tts/speech-voices"
import { cn } from "@/lib/utils"

const DEFAULT_VOICE_VALUE = "__default__"
const RANDOM_PROFILE_VALUE = "__random__"
const selectContentClassName =
  "z-80 max-h-72 min-w-(--radix-select-trigger-width)"

export function TtsRoleSelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: TtsCommandRole
  onChange: (value: TtsCommandRole) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as TtsCommandRole)}
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        aria-label="Minimum role"
        className={cn("w-36 bg-muted/30", className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" className={selectContentClassName}>
        {TTS_COMMAND_ROLE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function TtsVoiceProfileSelect({
  value,
  onChange,
  profiles,
  allowRandom = false,
  randomLabel = "Random",
  className,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  profiles: TtsVoiceProfile[]
  allowRandom?: boolean
  randomLabel?: string
  className?: string
  ariaLabel: string
}) {
  const selectValue =
    allowRandom && !profiles.some((profile) => profile.id === value)
      ? RANDOM_PROFILE_VALUE
      : value

  return (
    <Select
      value={selectValue}
      onValueChange={(next) =>
        onChange(next === RANDOM_PROFILE_VALUE ? "" : next)
      }
    >
      <SelectTrigger
        size="sm"
        aria-label={ariaLabel}
        className={cn("w-full bg-muted/30", className)}
      >
        <SelectValue placeholder="Pick a voice" />
      </SelectTrigger>
      <SelectContent position="popper" className={selectContentClassName}>
        {allowRandom ? (
          <SelectItem value={RANDOM_PROFILE_VALUE}>{randomLabel}</SelectItem>
        ) : null}
        {profiles.map((profile) => (
          <SelectItem key={profile.id} value={profile.id}>
            {profile.label || "Unnamed voice"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function TtsBrowserVoiceSelect({
  value,
  onChange,
  voices,
  loading,
}: {
  value: string
  onChange: (value: string) => void
  voices: BrowserVoice[]
  loading: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const selected = voices.find((voice) => voice.name === value)
  const missing = value !== "" && !selected && !loading
  const label =
    value === ""
      ? "Browser default"
      : selected
        ? selected.name
        : loading
          ? "Loading voices…"
          : `${value} (unavailable)`

  return (
    <Select
      value={value === "" ? DEFAULT_VOICE_VALUE : value}
      onValueChange={(next) =>
        onChange(next === DEFAULT_VOICE_VALUE ? "" : next)
      }
      open={open}
      onOpenChange={setOpen}
    >
      <SelectTrigger
        size="sm"
        aria-label="Browser voice"
        className={cn(
          "w-full min-w-0 bg-muted/30",
          missing && "text-muted-foreground"
        )}
      >
        <SelectValue>
          <span className="truncate">{label}</span>
        </SelectValue>
      </SelectTrigger>
      {open ? (
        <SelectContent position="popper" className={selectContentClassName}>
          <SelectItem value={DEFAULT_VOICE_VALUE}>Browser default</SelectItem>
          {missing ? <SelectItem value={value}>{label}</SelectItem> : null}
          {voices.map((voice) => (
            <SelectItem key={voice.name} value={voice.name}>
              <span className="truncate">{voice.name}</span>
              <span className="ml-auto pl-2 text-[10px] text-muted-foreground">
                {voice.lang}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      ) : null}
    </Select>
  )
}

export function TtsLineListField({
  label,
  description,
  values,
  onCommit,
  placeholder,
}: {
  label: string
  description?: string
  values: string[]
  onCommit: (values: string[]) => void
  placeholder?: string
}) {
  const joined = values.join("\n")
  const [draft, setDraft] = React.useState(joined)
  const [syncedValue, setSyncedValue] = React.useState(joined)
  const id = React.useId()

  if (joined !== syncedValue) {
    setSyncedValue(joined)
    setDraft(joined)
  }

  return (
    <div className="space-y-1.5 px-3 py-2.5">
      <div>
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <Textarea
        id={id}
        rows={4}
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const next = parseLines(draft)
          if (next.join("\n") !== joined) {
            onCommit(next)
          } else {
            setDraft(joined)
          }
        }}
        className="min-h-24 resize-y font-mono text-xs"
      />
    </div>
  )
}
