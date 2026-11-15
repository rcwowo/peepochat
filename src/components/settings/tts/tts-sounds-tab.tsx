import * as React from "react"
import {
  CopyIcon,
  PlayIcon,
  SquareIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  SettingsActionButton,
  SettingsActions,
  SettingsCallout,
  SettingsGroup,
  SettingsSection,
  SettingsTab,
} from "@/components/settings/settings-primitives"
import { TtsRoleSelect } from "@/components/settings/tts/tts-settings-shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { useTtsSettings } from "@/hooks/tts/use-tts-settings"
import { createTtsId, type TtsSoundEffect } from "@/lib/tts/tts-config"
import {
  normalizeSoundEffectName,
  uniqueSoundEffectName,
} from "@/lib/tts/sound-effect-name"
import {
  deleteSoundEffectAudio,
  getSoundEffectAudio,
  putSoundEffectAudio,
} from "@/lib/tts/tts-db"

const MAX_SOUND_EFFECT_BYTES = 2 * 1024 * 1024

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function TtsSoundsTab() {
  const { tts, updateTts } = useTtsSettings()
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const sounds = tts.soundEffects

  const handleFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? [])
    if (files.length === 0) {
      return
    }

    setUploading(true)
    const created: { id: string; baseName: string }[] = []
    try {
      for (const file of files) {
        if (!file.type.startsWith("audio/")) {
          toast.error(`${file.name} isn't an audio file.`)
          continue
        }
        if (file.size === 0) {
          toast.error(`${file.name} is empty.`)
          continue
        }
        if (file.size > MAX_SOUND_EFFECT_BYTES) {
          toast.error(
            `${file.name} is larger than ${formatBytes(MAX_SOUND_EFFECT_BYTES)}.`
          )
          continue
        }

        const id = createTtsId("sound")
        try {
          await putSoundEffectAudio({
            id,
            blob: file,
            fileName: file.name,
            mimeType: file.type,
            size: file.size,
          })
          created.push({ id, baseName: file.name.replace(/\.[^.]+$/, "") })
        } catch {
          toast.error(`Couldn't save ${file.name}.`)
        }
      }
    } finally {
      setUploading(false)
    }

    if (created.length === 0) {
      return
    }

    updateTts((current) => {
      const names = current.soundEffects.map((sound) => sound.name)
      const added: TtsSoundEffect[] = created.map((entry) => {
        const name = uniqueSoundEffectName(entry.baseName, names)
        names.push(name)
        return {
          id: entry.id,
          name,
          enabled: true,
          minRole: "everyone",
          volume: 1,
        }
      })
      return { ...current, soundEffects: [...current.soundEffects, ...added] }
    })
    toast.success(
      `Added ${created.length} sound${created.length === 1 ? "" : "s"}.`
    )
  }

  const updateSound = (id: string, patch: Partial<TtsSoundEffect>) =>
    updateTts((current) => ({
      ...current,
      soundEffects: current.soundEffects.map((sound) =>
        sound.id === id ? { ...sound, ...patch } : sound
      ),
    }))

  const renameSound = (id: string, rawName: string) =>
    updateTts((current) => {
      const others = current.soundEffects
        .filter((sound) => sound.id !== id)
        .map((sound) => sound.name)
      const name = uniqueSoundEffectName(rawName, others)
      return {
        ...current,
        soundEffects: current.soundEffects.map((sound) =>
          sound.id === id ? { ...sound, name } : sound
        ),
      }
    })

  const removeSound = (id: string) => {
    updateTts((current) => ({
      ...current,
      soundEffects: current.soundEffects.filter((sound) => sound.id !== id),
    }))
    void deleteSoundEffectAudio(id).catch(() => undefined)
  }

  const copySoundList = async () => {
    const list = sounds
      .filter((sound) => sound.enabled)
      .map((sound) => `(${sound.name})`)
      .join(" ")
    try {
      await navigator.clipboard.writeText(list)
      toast.success("Copied sound list")
    } catch {
      toast.error("Couldn't copy the sound list.")
    }
  }

  return (
    <SettingsTab>
      <SettingsCallout title="Using sounds">
        Chatters with the required role can play a sound by wrapping its name in
        parentheses, like “I feel something coming… (fart) oops.” Sounds play in
        order with the rest of the message.
      </SettingsCallout>

      <SettingsSection
        title="Sound clips"
        description={`Audio files up to ${formatBytes(MAX_SOUND_EFFECT_BYTES)} each. Clips are stored in this browser and included in backups.`}
      >
        {sounds.length > 0 ? (
          <SettingsGroup>
            {sounds.map((sound) => (
              <SoundEffectRow
                key={sound.id}
                sound={sound}
                onRename={(name) => renameSound(sound.id, name)}
                onUpdate={(patch) => updateSound(sound.id, patch)}
                onRemove={() => removeSound(sound.id)}
              />
            ))}
          </SettingsGroup>
        ) : (
          <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            No sounds yet. Upload an audio file to get started.
          </div>
        )}
        <SettingsActions>
          <SettingsActionButton
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon className="size-3.5" />
            {uploading ? "Uploading…" : "Upload sounds"}
          </SettingsActionButton>
          <SettingsActionButton
            variant="outline"
            disabled={!sounds.some((sound) => sound.enabled)}
            onClick={() => void copySoundList()}
          >
            <CopyIcon className="size-3.5" />
            Copy sound list
          </SettingsActionButton>
        </SettingsActions>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={(event) => {
            void handleFiles(event.target.files)
            event.target.value = ""
          }}
        />
      </SettingsSection>
    </SettingsTab>
  )
}

function SoundEffectRow({
  sound,
  onRename,
  onUpdate,
  onRemove,
}: {
  sound: TtsSoundEffect
  onRename: (name: string) => void
  onUpdate: (patch: Partial<TtsSoundEffect>) => void
  onRemove: () => void
}) {
  const [draft, setDraft] = React.useState(sound.name)
  const [syncedName, setSyncedName] = React.useState(sound.name)

  if (syncedName !== sound.name) {
    setSyncedName(sound.name)
    setDraft(sound.name)
  }

  const commitName = () => {
    const normalized = normalizeSoundEffectName(draft)
    if (!normalized || normalized === sound.name) {
      setDraft(sound.name)
      return
    }
    onRename(normalized)
    setDraft(sound.name)
  }

  const volumePercent = Math.round(sound.volume * 100)

  return (
    <div className="space-y-3 px-3 py-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 font-mono text-sm text-muted-foreground">
            (
          </span>
          <Input
            value={draft}
            aria-label={`Name of sound (${sound.name})`}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur()
              }
            }}
            className="h-8 px-5 font-mono text-sm"
          />
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-sm text-muted-foreground">
            )
          </span>
        </div>
        <Switch
          checked={sound.enabled}
          aria-label={`Allow (${sound.name})`}
          onCheckedChange={(enabled) => onUpdate({ enabled })}
        />
        <SoundPreviewButton sound={sound} />
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          aria-label={`Delete (${sound.name})`}
          onClick={onRemove}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-xs text-muted-foreground">
            Who can use it
          </span>
          <TtsRoleSelect
            value={sound.minRole}
            disabled={!sound.enabled}
            onChange={(minRole) => onUpdate({ minRole })}
            ariaLabel={`Who can use (${sound.name})`}
            className="min-w-0"
          />
        </div>
        <div className="flex min-w-40 flex-1 items-center gap-3">
          <span className="text-xs text-muted-foreground">Volume</span>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[volumePercent]}
            aria-label={`Volume of (${sound.name})`}
            disabled={!sound.enabled}
            onValueChange={(values) =>
              onUpdate({ volume: (values[0] ?? 100) / 100 })
            }
            className="flex-1"
          />
          <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">
            {volumePercent}%
          </span>
        </div>
      </div>
    </div>
  )
}

function SoundPreviewButton({ sound }: { sound: TtsSoundEffect }) {
  const [playing, setPlaying] = React.useState(false)
  const audioRef = React.useRef<{
    element: HTMLAudioElement
    url: string
  } | null>(null)
  const requestRef = React.useRef(0)

  const stop = React.useCallback(() => {
    requestRef.current += 1
    const current = audioRef.current
    audioRef.current = null
    if (current) {
      current.element.onended = null
      current.element.onerror = null
      current.element.pause()
      URL.revokeObjectURL(current.url)
    }
    setPlaying(false)
  }, [])

  React.useEffect(() => stop, [stop])

  const play = async () => {
    stop()
    const request = requestRef.current
    const record = await getSoundEffectAudio(sound.id).catch(() => undefined)
    if (request !== requestRef.current) {
      return
    }
    if (!record) {
      toast.error("The audio for this sound is missing.")
      return
    }

    const url = URL.createObjectURL(record.blob)
    const element = new Audio(url)
    element.volume = sound.volume
    audioRef.current = { element, url }
    element.onended = stop
    element.onerror = () => {
      toast.error("Couldn't play this sound.")
      stop()
    }
    setPlaying(true)
    element.play().catch(() => {
      toast.error("Couldn't play this sound.")
      stop()
    })
  }

  return (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label={
        playing ? `Stop previewing (${sound.name})` : `Preview (${sound.name})`
      }
      title={playing ? "Stop preview" : "Preview sound"}
      onClick={playing ? stop : () => void play()}
    >
      {playing ? (
        <SquareIcon className="size-3" />
      ) : (
        <PlayIcon className="size-3.5" />
      )}
    </Button>
  )
}
