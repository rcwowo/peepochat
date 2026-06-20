import * as React from "react"
import {
  BellIcon,
  BellRingIcon,
  GlobeIcon,
  MessageSquareIcon,
  RadioIcon,
  TerminalIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import {
  SettingsActionButton,
  SettingsActions,
  SettingsCallout,
  SettingsGroup,
  SettingsSection,
  SettingsSelectRow,
  SettingsSwitchRow,
  SettingsTab,
} from "@/components/settings/settings-primitives"
import {
  DEV_LOG_CATEGORIES,
  DEV_LOG_META,
  useDevLogSettings,
} from "@/lib/dev/dev-log-settings"
import { IS_DEV } from "@/lib/dev/is-dev"
import {
  clearAllTestNotifications,
  sendTestLiveNotification,
  sendTestPingNotification,
} from "@/lib/dev/test-notifications"
import { usePeepochatSettings } from "@/lib/peepochat/peepochat-context"

export function DeveloperTab() {
  const { channels, account, config } = usePeepochatSettings()
  const { settings: logSettings, setEnabled: setLogEnabled } = useDevLogSettings()
  const [channelLogin, setChannelLogin] = React.useState(
    () => channels[0]?.login ?? ""
  )

  React.useEffect(() => {
    if (channels.length === 0) {
      setChannelLogin("")
      return
    }

    setChannelLogin((current) => {
      if (current && channels.some((channel) => channel.login === current)) {
        return current
      }
      return channels[0]?.login ?? ""
    })
  }, [channels])

  const channelOptions = React.useMemo(
    () =>
      channels.map((channel) => ({
        value: channel.login,
        label: channel.displayName || channel.login,
      })),
    [channels]
  )

  if (!IS_DEV) {
    return null
  }

  const hasChannels = channels.length > 0
  const liveNotificationsEnabled =
    config.highlights.liveIndicatorsEnabled &&
    config.highlights.livePushNotificationsEnabled

  const handleSendPing = () => {
    if (!channelLogin) {
      toast.error("Add a channel first.")
      return
    }

    const added = sendTestPingNotification({
      channelLogin,
      accountLogin: account?.login ?? null,
    })

    if (added) {
      toast.success("Test ping notification added.")
      return
    }

    toast.error("Could not add test ping notification.")
  }

  const handleSendLive = () => {
    if (!channelLogin) {
      toast.error("Add a channel first.")
      return
    }

    const added = sendTestLiveNotification({ channelLogin })

    if (added) {
      toast.success("Test live notification added.")
      return
    }

    toast.error("Could not add test live notification.")
  }

  const handleClearAll = () => {
    clearAllTestNotifications()
    toast.success("Notification center cleared.")
  }

  const logIcons = {
    chat: MessageSquareIcon,
    fetch: GlobeIcon,
    irc: TerminalIcon,
  } as const

  return (
    <SettingsTab
      title="Developer"
      description="Local development tools. This tab is not included in production builds."
    >
      <SettingsSection
        title="Notification center"
        description="Inject sample notifications without waiting for real chat or stream events."
      >
        {hasChannels && channelLogin ? (
          <SettingsGroup>
            <SettingsSelectRow
              title="Channel"
              description="Which channel the test notification should reference."
              value={channelLogin}
              onChange={setChannelLogin}
              options={channelOptions}
              placeholder="Select channel"
            />
          </SettingsGroup>
        ) : null}

        {!hasChannels ? (
          <SettingsCallout title="No channels">
            Add at least one channel in the sidebar before sending test
            notifications.
          </SettingsCallout>
        ) : null}

        {!liveNotificationsEnabled ? (
          <SettingsCallout title="Live tab hidden">
            Enable live indicators and live notifications under Highlights to
            preview the Live tab in the notification center.
          </SettingsCallout>
        ) : null}

        <SettingsActions>
          <SettingsActionButton
            type="button"
            variant="outline"
            disabled={!hasChannels}
            onClick={handleSendPing}
          >
            <BellRingIcon className="size-3.5" />
            Send test ping
          </SettingsActionButton>
          <SettingsActionButton
            type="button"
            variant="outline"
            disabled={!hasChannels}
            onClick={handleSendLive}
          >
            <RadioIcon className="size-3.5" />
            Send test live
          </SettingsActionButton>
          <SettingsActionButton
            type="button"
            variant="outline"
            onClick={handleClearAll}
          >
            <Trash2Icon className="size-3.5" />
            Clear all
          </SettingsActionButton>
        </SettingsActions>
      </SettingsSection>

      <SettingsSection
        title="Console logging"
        description="Toggle verbose dev logs. Settings persist in localStorage and apply immediately."
      >
        <SettingsGroup>
          {DEV_LOG_CATEGORIES.map((category) => (
            <SettingsSwitchRow
              key={category}
              icon={logIcons[category]}
              title={DEV_LOG_META[category].title}
              description={DEV_LOG_META[category].description}
              checked={logSettings[category]}
              onCheckedChange={(checked) => setLogEnabled(category, checked)}
            />
          ))}
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="More tools"
        description="Additional developer utilities will live here."
      >
        <SettingsCallout>
          <BellIcon className="mb-1 inline size-3.5 align-text-bottom" />
          Have something else you want to test locally? This tab is the home for
          dev-only helpers as the app grows.
        </SettingsCallout>
      </SettingsSection>
    </SettingsTab>
  )
}
