import * as React from "react"
import {
  BellIcon,
  BellRingIcon,
  CircleIcon,
  RadioIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

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
} from "@/lib/highlight-rules"
import {
  getDesktopNotificationPermission,
  requestDesktopNotificationPermission,
} from "@/lib/desktop-notifications"
import type { HighlightPingRule } from "@/lib/peepochat-config"
import { usePeepochatSettings } from "@/lib/peepochat-context"

const pingListColumns =
  "grid grid-cols-[2.25rem_minmax(0,1fr)_2.75rem_2rem] items-center gap-x-3"

function PingRuleRow({
  rule,
  onEnabledChange,
  onNotifyChange,
  onRemove,
}: {
  rule: HighlightPingRule
  onEnabledChange: (enabled: boolean) => void
  onNotifyChange: (notify: boolean) => void
  onRemove: () => void
}) {
  return (
    <div className={cn(pingListColumns, "px-3 py-2.5")}>
      <Checkbox
        checked={rule.enabled}
        onCheckedChange={(value) => onEnabledChange(value === true)}
        aria-label={`Highlight messages matching ${rule.pattern}`}
      />

      <code
        className="min-w-0 truncate rounded-md bg-muted/50 px-2 py-1 font-mono text-xs"
        title={rule.pattern}
      >
        {rule.pattern}
      </code>

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
      description="Unread and live indicators, ping rules, and desktop notifications."
    >
      <SettingsDivider className="mt-4 mb-4" />

      <SettingsSection
        title="Unread indicators"
        description="Show a dot on channels and splits when they receive messages while you are viewing something else."
      >
        <SettingsGroup>
          <SettingsSwitchRow
            icon={CircleIcon}
            title="Unread indicators"
            description="Show unread dots in the channel sidebar."
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
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="Live indicators"
        description="Show when a followed channel is live. Polls Twitch every 45 seconds."
      >
        <SettingsGroup>
          <SettingsSwitchRow
            icon={RadioIcon}
            title="Live indicators"
            description="Red badge on channel icons when a stream is live."
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
          <SettingsSwitchRow
            icon={BellRingIcon}
            title="Live push notifications"
            description="Notify when a followed channel goes live (tab must be in background)."
            checked={
              config.highlights.liveIndicatorsEnabled &&
              config.highlights.livePushNotificationsEnabled
            }
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
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="Desktop notifications"
        description="Browser notifications when the tab is in the background."
      >
        <SettingsGroup>
          {!notificationsReady ? (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">Allow notifications</p>
                <p className="text-xs text-muted-foreground">
                  {notificationPermission === "denied"
                    ? "Blocked — enable in your browser site settings."
                    : "Required for ping and live alerts."}
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
            title="Ping push notifications"
            description="Notify when a message matches a ping rule."
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
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="Pings"
        description="Regular expressions matched against message text. Matching messages are highlighted in chat."
      >
        <SettingsGroup>
          <div className="space-y-3 px-3 py-3">
            <div className="space-y-1">
              <Label htmlFor="new-ping-pattern">Add ping</Label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                JavaScript regular expression, matched against message text.
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                id="new-ping-pattern"
                value={newPingPattern}
                onChange={(e) => setNewPingPattern(e.target.value)}
                placeholder="(?i)myname|keyword"
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
              No ping rules yet.
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
