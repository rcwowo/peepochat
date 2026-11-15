import * as React from "react"
import {
  ArrowRightIcon,
  AtSignIcon,
  BotMessageSquareIcon,
  Link2Icon,
  PlusIcon,
  RotateCwIcon,
  ShieldUserIcon,
  SmileIcon,
  StarIcon,
  Trash2Icon,
  UserIcon,
  UsersIcon,
  VideoIcon,
  ZapIcon,
} from "lucide-react"

import {
  SettingsActionButton,
  SettingsGroup,
  SettingsSection,
  SettingsSegmented,
  SettingsSliderRow,
  SettingsSwitchRow,
  SettingsTab,
} from "@/components/settings/settings-primitives"
import { TtsLineListField } from "@/components/settings/tts/tts-settings-shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useTtsSettings } from "@/hooks/tts/use-tts-settings"
import {
  TTS_DEFAULT_TEMPLATE,
  TTS_MAX_MESSAGE_LENGTH_MAX,
  TTS_MAX_MESSAGE_LENGTH_MIN,
  TTS_MIN_MESSAGE_LENGTH_MAX,
  TTS_QUEUE_SIZE_MAX,
  TTS_QUEUE_SIZE_MIN,
  createWordReplacement,
  type TtsQueueMode,
  type TtsWordReplacement,
} from "@/lib/tts/tts-config"

const QUEUE_MODE_OPTIONS = [
  { value: "small-chat" as const, label: "Small chat", icon: UserIcon },
  { value: "big-chat" as const, label: "Big chat", icon: UsersIcon },
]

const QUEUE_MODE_DESCRIPTIONS: Record<TtsQueueMode, string> = {
  "small-chat":
    "Messages are queued as they arrive, up to the queue size limit. Best for smaller, slower chats.",
  "big-chat":
    "One message is spoken at a time, then the queue skips ahead to the newest message. Best for larger, faster chats.",
}

const TEMPLATE_TOKENS = ["{user}", "{channel}", "{message}"]

export function TtsSpeechTab() {
  const { tts, updateTts } = useTtsSettings()

  return (
    <SettingsTab>
      <SettingsSection
        title="Playback"
        description="Text-to-speech is started from a channel's options menu, and only one channel can use it at a time."
      >
        <SettingsGroup>
          <SettingsSwitchRow
            icon={RotateCwIcon}
            title="Resume on startup"
            description="Restart text-to-speech for the last channel when Peepochat opens. Your browser may ask for a click before audio can play."
            checked={tts.resumeOnStartup}
            onCheckedChange={(resumeOnStartup) =>
              updateTts({ resumeOnStartup })
            }
          />
          <div className="space-y-2 px-3 py-2.5">
            <div>
              <div className="text-sm leading-tight font-medium">
                Queue mode
              </div>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                {QUEUE_MODE_DESCRIPTIONS[tts.queueMode]}
              </p>
            </div>
            <SettingsSegmented
              value={tts.queueMode}
              onChange={(queueMode) => updateTts({ queueMode })}
              options={QUEUE_MODE_OPTIONS}
            />
          </div>
          {tts.queueMode === "small-chat" ? (
            <SettingsSliderRow
              title="Queue size limit"
              description="New messages are dropped while the queue is full."
              value={tts.maxQueueSize}
              min={TTS_QUEUE_SIZE_MIN}
              max={TTS_QUEUE_SIZE_MAX}
              onChange={(maxQueueSize) => updateTts({ maxQueueSize })}
            />
          ) : null}
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="Speech template"
        description="How the spoken text is put together before it's handed to your browser's speech engine."
      >
        <SettingsGroup>
          <div className="space-y-2 px-3 py-2.5">
            <Textarea
              rows={2}
              aria-label="Speech template"
              value={tts.textTemplate}
              placeholder={TTS_DEFAULT_TEMPLATE}
              onChange={(event) =>
                updateTts({ textTemplate: event.target.value })
              }
              className="min-h-16 resize-y"
            />
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="mr-0.5">Tokens</span>
              {TEMPLATE_TOKENS.map((token) => (
                <button
                  key={token}
                  type="button"
                  onClick={() =>
                    updateTts((current) => ({
                      ...current,
                      textTemplate: `${current.textTemplate}${
                        current.textTemplate &&
                        !current.textTemplate.endsWith(" ")
                          ? " "
                          : ""
                      }${token}`,
                    }))
                  }
                  className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] transition-colors hover:bg-muted hover:text-foreground"
                >
                  {token}
                </button>
              ))}
            </div>
          </div>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="Message length"
        description="Measured after links, emotes, and word replacements are applied."
      >
        <SettingsGroup>
          <SettingsSliderRow
            title="Minimum length"
            value={tts.minMessageLength}
            min={0}
            max={TTS_MIN_MESSAGE_LENGTH_MAX}
            onChange={(minMessageLength) =>
              updateTts((current) => ({
                ...current,
                minMessageLength: Math.min(
                  minMessageLength,
                  current.maxMessageLength
                ),
              }))
            }
          />
          <SettingsSliderRow
            title="Maximum length"
            description="Longer messages are skipped entirely."
            value={tts.maxMessageLength}
            min={TTS_MAX_MESSAGE_LENGTH_MIN}
            max={TTS_MAX_MESSAGE_LENGTH_MAX}
            onChange={(maxMessageLength) =>
              updateTts((current) => ({
                ...current,
                maxMessageLength,
                minMessageLength: Math.min(
                  current.minMessageLength,
                  maxMessageLength
                ),
              }))
            }
          />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="Message filters"
        description="Decide which messages make it into the queue."
      >
        <SettingsGroup>
          <SettingsSwitchRow
            icon={Link2Icon}
            title="Strip links"
            description="Remove URLs before a message is spoken."
            checked={tts.stripLinks}
            onCheckedChange={(stripLinks) => updateTts({ stripLinks })}
          />
          <SettingsSwitchRow
            icon={AtSignIcon}
            title="Strip mentions"
            description="Remove @username mentions before a message is spoken."
            checked={tts.stripMentions}
            onCheckedChange={(stripMentions) => updateTts({ stripMentions })}
          />
          <SettingsSwitchRow
            icon={SmileIcon}
            title="Strip emotes"
            description="Remove Twitch, BTTV, FFZ, and 7TV emotes before a message is spoken."
            checked={tts.stripEmotes}
            onCheckedChange={(stripEmotes) => updateTts({ stripEmotes })}
          />
          <SettingsSwitchRow
            icon={ZapIcon}
            title="Ignore commands"
            description="Skip messages that start with ! or ?."
            checked={tts.ignoreCommands}
            onCheckedChange={(ignoreCommands) => updateTts({ ignoreCommands })}
          />
          <SettingsSwitchRow
            icon={BotMessageSquareIcon}
            title="Skip bots"
            description="Skip chatters whose username ends with “bot”."
            checked={tts.skipBots}
            onCheckedChange={(skipBots) => updateTts({ skipBots })}
          />
          <SettingsSwitchRow
            icon={VideoIcon}
            title="Skip the broadcaster"
            checked={tts.skipBroadcaster}
            onCheckedChange={(skipBroadcaster) =>
              updateTts({ skipBroadcaster })
            }
          />
          <SettingsSwitchRow
            icon={ShieldUserIcon}
            title="Skip moderators"
            checked={tts.skipModerators}
            onCheckedChange={(skipModerators) => updateTts({ skipModerators })}
          />
          <SettingsSwitchRow
            icon={StarIcon}
            title="Subscribers only"
            description="Only speak messages from subscribers and the broadcaster."
            checked={tts.subscribersOnly}
            onCheckedChange={(subscribersOnly) =>
              updateTts({ subscribersOnly })
            }
          />
        </SettingsGroup>
      </SettingsSection>

      <WordReplacementsSection
        replacements={tts.wordReplacements}
        onChange={(updater) =>
          updateTts((current) => ({
            ...current,
            wordReplacements: updater(current.wordReplacements),
          }))
        }
      />

      <SettingsSection
        title="Blocklists"
        description="Messages from these users, or containing these terms, are never spoken."
      >
        <SettingsGroup>
          <TtsLineListField
            label="Blocked users"
            description="One username per line."
            values={tts.blockedUsers}
            placeholder={"spammer123\nannoyingbot"}
            onCommit={(blockedUsers) => updateTts({ blockedUsers })}
          />
          <TtsLineListField
            label="Blocked terms"
            description="One word or phrase per line. Matching is case-insensitive."
            values={tts.blockedTerms}
            onCommit={(blockedTerms) => updateTts({ blockedTerms })}
          />
        </SettingsGroup>
      </SettingsSection>
    </SettingsTab>
  )
}

function WordReplacementsSection({
  replacements,
  onChange,
}: {
  replacements: TtsWordReplacement[]
  onChange: (
    updater: (replacements: TtsWordReplacement[]) => TtsWordReplacement[]
  ) => void
}) {
  const update = (id: string, patch: Partial<TtsWordReplacement>) =>
    onChange((current) =>
      current.map((replacement) =>
        replacement.id === id ? { ...replacement, ...patch } : replacement
      )
    )

  return (
    <SettingsSection
      title="Word replacements"
      description="Swap words or phrases before they're spoken. Leave the replacement empty to remove a phrase entirely."
    >
      {replacements.length > 0 ? (
        <SettingsGroup>
          {replacements.map((replacement) => (
            <WordReplacementRow
              key={replacement.id}
              replacement={replacement}
              onUpdate={(patch) => update(replacement.id, patch)}
              onRemove={() =>
                onChange((current) =>
                  current.filter((entry) => entry.id !== replacement.id)
                )
              }
            />
          ))}
        </SettingsGroup>
      ) : (
        <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          No replacements yet.
        </div>
      )}
      <SettingsActionButton
        variant="outline"
        onClick={() => {
          const replacement = createWordReplacement()
          onChange((current) => [...current, replacement])
        }}
      >
        <PlusIcon className="size-3.5" />
        Add replacement
      </SettingsActionButton>
    </SettingsSection>
  )
}

function WordReplacementRow({
  replacement,
  onUpdate,
  onRemove,
}: {
  replacement: TtsWordReplacement
  onUpdate: (patch: Partial<TtsWordReplacement>) => void
  onRemove: () => void
}) {
  const [from, setFrom] = React.useState(replacement.from)
  const [to, setTo] = React.useState(replacement.to)
  const [synced, setSynced] = React.useState(replacement)

  if (synced !== replacement) {
    setSynced(replacement)
    setFrom(replacement.from)
    setTo(replacement.to)
  }

  const commitOnEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur()
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:flex-nowrap">
      <div className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-auto">
        <Input
          value={from}
          aria-label="Word or phrase to replace"
          placeholder="Find"
          onChange={(event) => setFrom(event.target.value)}
          onBlur={() => {
            const trimmed = from.trim()
            setFrom(trimmed)
            if (trimmed !== replacement.from) {
              onUpdate({ from: trimmed })
            }
          }}
          onKeyDown={commitOnEnter}
          className="h-8 min-w-0 flex-1"
        />
        <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <Input
          value={to}
          aria-label="Replacement"
          placeholder="Replace with…"
          onChange={(event) => setTo(event.target.value)}
          onBlur={() => {
            if (to !== replacement.to) {
              onUpdate({ to })
            }
          }}
          onKeyDown={commitOnEnter}
          className="h-8 min-w-0 flex-1"
        />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Switch
          checked={replacement.enabled}
          aria-label="Apply this replacement"
          onCheckedChange={(enabled) => onUpdate({ enabled })}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          aria-label="Delete replacement"
          onClick={onRemove}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
