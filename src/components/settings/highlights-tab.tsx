import * as React from "react"
import {
  AtSignIcon,
  BellIcon,
  BellRingIcon,
  CircleIcon,
  RadioIcon,
  Trash2Icon,
  Volume2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { AlertSoundSettingRow } from "@/components/settings/alert-sound-setting-row"
import {
  SettingsDivider,
  SettingsGroup,
  SettingsSection,
  SettingsSwitchRow,
  SettingsTab,
} from "@/components/settings/settings-primitives"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  createPingRuleId,
} from "@/lib/highlights/highlight-rules"
import {
  getDesktopNotificationPermission,
  requestDesktopNotificationPermission,
} from "@/lib/highlights/desktop-notifications"
import type { HighlightPingRule } from "@/lib/peepochat/peepochat-config"
import { usePeepochatSettings } from "@/lib/peepochat/peepochat-context"

const pingListColumns =
  "grid grid-cols-[2.25rem_minmax(0,1fr)_2.75rem_2rem] items-center gap-x-3"

function PingRuleRow({
  rule,
  onPatternChange,
  onEnabledChange,
  onNotifyChange,
  onRemove,
}: {
  rule: HighlightPingRule
  onPatternChange: (pattern: string) => void
  onEnabledChange: (enabled: boolean) => void
  onNotifyChange: (notify: boolean) => void
  onRemove: () => void
}) {
  const [draftPattern, setDraftPattern] = React.useState(rule.pattern)
  const [prevRulePattern, setPrevRulePattern] = React.useState(rule.pattern)

  if (rule.pattern !== prevRulePattern) {
    setPrevRulePattern(rule.pattern)
    setDraftPattern(rule.pattern)
  }

  const commitPattern = () => {
    const pattern = draftPattern.trim()
    if (!pattern) {
      setDraftPattern(rule.pattern)
      toast.error("Ping pattern cannot be empty")
      return
    }

    if (pattern !== rule.pattern) {
      onPatternChange(pattern)
    }
  }

  return (
    <div className={cn(pingListColumns, "px-3 py-2.5")}>
      <Checkbox
        checked={rule.enabled}
        onCheckedChange={(value) => onEnabledChange(value === true)}
        aria-label={`Highlight messages matching ${rule.pattern}`}
      />

      <Input
        value={draftPattern}
        onChange={(event) => setDraftPattern(event.target.value)}
        onBlur={commitPattern}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            commitPattern()
            event.currentTarget.blur()
          }
          if (event.key === "Escape") {
            event.preventDefault()
            setDraftPattern(rule.pattern)
            event.currentTarget.blur()
          }
        }}
        className="h-8 min-w-0 font-mono text-xs"
        aria-label={`Edit ping pattern ${rule.pattern}`}
      />

      <Checkbox
        checked={rule.notify}
        onCheckedChange={(value) => onNotifyChange(value === true)}
        className="justify-self-end"
        aria-label={`Notify when ${rule.pattern} matches`}
      />

      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground hover:text-foreground"
        onClick={onRemove}
        aria-label={`Remove ping ${rule.pattern}`}
      >
        <Trash2Icon className="size-3.5" />
      </Button>
    </div>
  )
}

export function HighlightsTab() {
  const { config, updateConfig } = usePeepochatSettings()
  const [newPingPattern, setNewPingPattern] = React.useState("")
  const accountLogin = config.twitch.account?.login ?? null

  const requestNotifications = async () => {
    const result = await requestDesktopNotificationPermission()
    if (result === "granted") {
      return
    }
    if (result === "denied") {
      toast.error("Notifications blocked in browser settings")
      return
    }
    if (result === "unsupported") {
      toast.error("Notifications are not supported in this browser")
    }
  }

  const notificationPermission = getDesktopNotificationPermission()
  const notificationsReady = notificationPermission === "granted"

  const addPingRule = () => {
    const pattern = newPingPattern.trim()
    if (!pattern) return

    updateConfig((current) => ({
      ...current,
      highlights: {
        ...current.highlights,
        pings: [
          ...current.highlights.pings,
          {
            id: createPingRuleId(),
            pattern,
            enabled: true,
            notify: true,
          },
        ],
      },
    }))
    setNewPingPattern("")
  }

  return (
    <SettingsTab
      title="Highlights"
      description="Notification alerts, indicators, and pings."
    >
      <SettingsDivider className="mt-4 mb-4" />

      <SettingsSection
        title="Notifications"
        description="Browser alerts and sounds when the tab is in the background."
      >
        <SettingsGroup>
          {!notificationsReady ? (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">Allow notifications</p>
                <p className="text-xs text-muted-foreground">
                  {notificationPermission === "denied"
                    ? "Blocked — enable in your browser site settings."
                    : "Required for push alerts."}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={notificationPermission === "denied"}
                onClick={() => void requestNotifications()}
              >
                Enable
              </Button>
            </div>
          ) : null}
          <SettingsSwitchRow
            icon={BellIcon}
            title="Ping notifications"
            description="When your pings are matched."
            checked={config.highlights.pingPushNotificationsEnabled}
            onCheckedChange={(checked) =>
              updateConfig((current) => ({
                ...current,
                highlights: {
                  ...current.highlights,
                  pingPushNotificationsEnabled: checked,
                },
              }))
            }
          />
          <SettingsSwitchRow
            icon={BellRingIcon}
            title="Live notifications"
            description="When an added channel goes live."
            checked={
              config.highlights.liveIndicatorsEnabled &&
              config.highlights.livePushNotificationsEnabled
            }
            disabled={!config.highlights.liveIndicatorsEnabled}
            onCheckedChange={(checked) => {
              if (!config.highlights.liveIndicatorsEnabled) return
              updateConfig((current) => ({
                ...current,
                highlights: {
                  ...current.highlights,
                  livePushNotificationsEnabled: checked,
                },
              }))
            }}
          />
          <SettingsSwitchRow
            icon={Volume2Icon}
            title="Use default sounds"
            description="Built-in sounds for notifications."
            checked={config.highlights.useDefaultSounds}
            onCheckedChange={(checked) =>
              updateConfig((current) => ({
                ...current,
                highlights: {
                  ...current.highlights,
                  useDefaultSounds: checked,
                },
              }))
            }
          />
          {!config.highlights.useDefaultSounds ? (
            <>
              <AlertSoundSettingRow
                title="Ping sound"
                description="Plays when a ping rule matches."
                customId={config.highlights.pingSoundCustomId}
                otherCustomId={config.highlights.notificationSoundCustomId}
                onCustomIdChange={(customId) =>
                  updateConfig((current) => ({
                    ...current,
                    highlights: {
                      ...current.highlights,
                      pingSoundCustomId: customId,
                    },
                  }))
                }
              />
              <AlertSoundSettingRow
                title="Notification sound"
                description="Plays with desktop notifications."
                customId={config.highlights.notificationSoundCustomId}
                otherCustomId={config.highlights.pingSoundCustomId}
                onCustomIdChange={(customId) =>
                  updateConfig((current) => ({
                    ...current,
                    highlights: {
                      ...current.highlights,
                      notificationSoundCustomId: customId,
                    },
                  }))
                }
              />
            </>
          ) : null}
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="Indicators"
        description="Visual badges for unread messages and live streams."
      >
        <SettingsGroup>
          <SettingsSwitchRow
            icon={CircleIcon}
            title="Unread indicators"
            description="Dots on channels and splits with new messages."
            checked={config.highlights.unreadIndicatorsEnabled}
            onCheckedChange={(checked) =>
              updateConfig((current) => ({
                ...current,
                highlights: {
                  ...current.highlights,
                  unreadIndicatorsEnabled: checked,
                },
              }))
            }
          />
          <SettingsSwitchRow
            icon={RadioIcon}
            title="Live indicators"
            description="Badge on channel icons when a stream is live."
            checked={config.highlights.liveIndicatorsEnabled}
            onCheckedChange={(checked) =>
              updateConfig((current) => ({
                ...current,
                highlights: {
                  ...current.highlights,
                  liveIndicatorsEnabled: checked,
                },
              }))
            }
          />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="Pings"
        description="Highlights messages that match your set keywords."
      >
        <SettingsGroup>
          <SettingsSwitchRow
            icon={AtSignIcon}
            title="Ping on username mention"
            description={
              accountLogin
                ? `Highlight when a message mentions @${accountLogin} or ${accountLogin}.`
                : "Sign in to enable username mention pings."
            }
            checked={config.highlights.pingOnUsernameMention}
            disabled={!accountLogin}
            onCheckedChange={(checked) =>
              updateConfig((current) => ({
                ...current,
                highlights: {
                  ...current.highlights,
                  pingOnUsernameMention: checked,
                },
              }))
            }
          />
        </SettingsGroup>

        <SettingsGroup className="mt-2">
          <div className="space-y-3 px-3 py-3">
            <div className="space-y-1">
              <Label htmlFor="new-ping-pattern">Add custom ping</Label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                JavaScript regular expression.
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                id="new-ping-pattern"
                value={newPingPattern}
                onChange={(e) => setNewPingPattern(e.target.value)}
                placeholder="Keyword or RegEx"
                className="font-mono text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") addPingRule()
                }}
              />
              <Button
                type="button"
                className="shrink-0"
                onClick={addPingRule}
                disabled={!newPingPattern.trim()}
              >
                Add
              </Button>
            </div>
          </div>

          {config.highlights.pings.length === 0 ? (
            <p className="border-t border-border px-3 py-3 text-xs leading-relaxed text-muted-foreground">
              No custom ping rules yet.
            </p>
          ) : (
            <>
              <div
                className={cn(
                  pingListColumns,
                  "border-t border-border px-3 py-2 text-xs font-medium text-muted-foreground"
                )}
              >
                <span>On</span>
                <span>Pattern</span>
                <span className="text-right">Notify</span>
                <span className="sr-only">Remove</span>
              </div>
              {config.highlights.pings.map((rule) => (
                <PingRuleRow
                  key={rule.id}
                  rule={rule}
                  onPatternChange={(pattern) =>
                    updateConfig((current) => ({
                      ...current,
                      highlights: {
                        ...current.highlights,
                        pings: current.highlights.pings.map((entry) =>
                          entry.id === rule.id ? { ...entry, pattern } : entry
                        ),
                      },
                    }))
                  }
                  onEnabledChange={(enabled) =>
                    updateConfig((current) => ({
                      ...current,
                      highlights: {
                        ...current.highlights,
                        pings: current.highlights.pings.map((entry) =>
                          entry.id === rule.id ? { ...entry, enabled } : entry
                        ),
                      },
                    }))
                  }
                  onNotifyChange={(notify) =>
                    updateConfig((current) => ({
                      ...current,
                      highlights: {
                        ...current.highlights,
                        pings: current.highlights.pings.map((entry) =>
                          entry.id === rule.id ? { ...entry, notify } : entry
                        ),
                      },
                    }))
                  }
                  onRemove={() =>
                    updateConfig((current) => ({
                      ...current,
                      highlights: {
                        ...current.highlights,
                        pings: current.highlights.pings.filter(
                          (entry) => entry.id !== rule.id
                        ),
                      },
                    }))
                  }
                />
              ))}
            </>
          )}
        </SettingsGroup>
      </SettingsSection>
    </SettingsTab>
  )
}
