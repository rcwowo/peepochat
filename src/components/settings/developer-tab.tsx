import * as React from "react"
import {
  BellRingIcon,
  GlobeIcon,
  HistoryIcon,
  MessageSquareIcon,
  MessageSquarePlusIcon,
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
  SettingsInputRow,
  SettingsSection,
  SettingsSelectRow,
  SettingsSwitchRow,
  SettingsTab,
  SettingsTextareaRow,
} from "@/components/settings/settings-primitives"
import {
  DEV_LOG_CATEGORIES,
  DEV_LOG_META,
  useDevLogSettings,
} from "@/lib/dev/dev-log-settings"
import { IS_DEV } from "@/lib/dev/is-dev"
import {
  buildFakeTimelineItems,
  defaultFakeMessageText,
  FAKE_ANNOUNCEMENT_THEME_OPTIONS,
  FAKE_CHAT_ROLE_OPTIONS,
  FAKE_MESSAGE_KIND_OPTIONS,
  fakeMessageTextLabel,
  supportsFakeAnnouncementTheme,
  supportsFakeChatRole,
  supportsFakeEmotes,
  supportsFakeViewerCount,
  type FakeAnnouncementTheme,
  type FakeChatRole,
  type FakeMessageKind,
} from "@/lib/dev/test-chat-messages"
import {
  clearAllTestNotifications,
  sendTestLiveNotification,
  sendTestMissedPingNotification,
  sendTestPingNotification,
} from "@/lib/dev/test-notifications"
import {
  usePeepochatChat,
  usePeepochatSettings,
} from "@/lib/peepochat/peepochat-context"

export function DeveloperTab() {
  const { channels, account, config } = usePeepochatSettings()
  const {
    getRoomId,
    injectChatMessage,
    injectSystemMessage,
    injectAutomodHeldMessage,
  } = usePeepochatChat()
  const { settings: logSettings, setEnabled: setLogEnabled } =
    useDevLogSettings()
  const [channelLoginDraft, setChannelLoginDraft] = React.useState(
    () => channels[0]?.login ?? ""
  )
  const [messageKind, setMessageKind] = React.useState<FakeMessageKind>("chat")
  const [displayName, setDisplayName] = React.useState("FakeUser")
  const [messageText, setMessageText] = React.useState(() =>
    defaultFakeMessageText("chat")
  )
  const [includeEmotes, setIncludeEmotes] = React.useState(true)
  const [chatRole, setChatRole] = React.useState<FakeChatRole>("none")
  const [announcementTheme, setAnnouncementTheme] =
    React.useState<FakeAnnouncementTheme>("primary")
  const [viewerCount, setViewerCount] = React.useState("42")

  const channelLogin = React.useMemo(() => {
    if (channels.length === 0) {
      return ""
    }

    if (
      channelLoginDraft &&
      channels.some((channel) => channel.login === channelLoginDraft)
    ) {
      return channelLoginDraft
    }

    return channels[0]?.login ?? ""
  }, [channelLoginDraft, channels])

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

  const handleMessageKindChange = (kind: FakeMessageKind) => {
    setMessageKind(kind)
    setMessageText(defaultFakeMessageText(kind))
  }

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

  const handleSendMissedPing = () => {
    if (!channelLogin) {
      toast.error("Add a channel first.")
      return
    }

    const added = sendTestMissedPingNotification({
      channelLogin,
      accountLogin: account?.login ?? null,
    })

    if (added) {
      toast.success("Test missed ping added.")
      return
    }

    toast.error("Could not add test missed ping.")
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

  const handleInjectMessage = () => {
    if (!channelLogin) {
      toast.error("Add a channel first.")
      return
    }

    const parsedViewerCount = Number.parseInt(viewerCount, 10)
    const payloads = buildFakeTimelineItems(messageKind, {
      channelLogin,
      roomId: getRoomId(channelLogin),
      displayName,
      text: messageText,
      includeEmotes: supportsFakeEmotes(messageKind) ? includeEmotes : false,
      role: supportsFakeChatRole(messageKind) ? chatRole : "none",
      announcementTheme: supportsFakeAnnouncementTheme(messageKind)
        ? announcementTheme
        : undefined,
      viewerCount:
        supportsFakeViewerCount(messageKind) &&
        Number.isFinite(parsedViewerCount)
          ? parsedViewerCount
          : undefined,
    })

    let injectedCount = 0
    for (const payload of payloads) {
      const injected =
        payload.kind === "chat"
          ? injectChatMessage(payload.message)
          : payload.kind === "system"
            ? injectSystemMessage(payload.message)
            : injectAutomodHeldMessage(payload.channelLogin, payload.message)
      if (injected) {
        injectedCount += 1
      }
    }

    if (injectedCount > 0) {
      toast.success(
        injectedCount === 1
          ? "Fake message injected into chat."
          : `${injectedCount} fake messages injected into chat.`
      )
      return
    }

    toast.error(
      "Channel is not synced yet. Open the channel chat and wait for it to connect."
    )
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
              onChange={setChannelLoginDraft}
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
            onClick={handleSendMissedPing}
          >
            <HistoryIcon className="size-3.5" />
            Send test missed ping
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
        title="Fake messages"
        description="Inject sample timeline items into a channel chat to preview message UI."
      >
        {!hasChannels ? (
          <SettingsCallout title="No channels">
            Add at least one channel in the sidebar before injecting fake
            messages.
          </SettingsCallout>
        ) : (
          <SettingsGroup>
            <SettingsSelectRow
              title="Channel"
              description="Message is appended to this channel's live timeline."
              value={channelLogin}
              onChange={setChannelLoginDraft}
              options={channelOptions}
              placeholder="Select channel"
            />
            <SettingsSelectRow
              title="Message type"
              value={messageKind}
              onChange={handleMessageKindChange}
              options={FAKE_MESSAGE_KIND_OPTIONS}
              placeholder="Select type"
            />
            <SettingsInputRow
              label="Display name"
              value={displayName}
              onChange={setDisplayName}
              placeholder="FakeUser"
            />
            <SettingsTextareaRow
              label={fakeMessageTextLabel(messageKind)}
              value={messageText}
              onChange={setMessageText}
              placeholder={defaultFakeMessageText(messageKind)}
              rows={2}
            />
            {supportsFakeChatRole(messageKind) ? (
              <SettingsSelectRow
                title="Role badges"
                value={chatRole}
                onChange={setChatRole}
                options={FAKE_CHAT_ROLE_OPTIONS}
                placeholder="Select role"
              />
            ) : null}
            {supportsFakeAnnouncementTheme(messageKind) ? (
              <SettingsSelectRow
                title="Announcement theme"
                value={announcementTheme}
                onChange={setAnnouncementTheme}
                options={FAKE_ANNOUNCEMENT_THEME_OPTIONS}
                placeholder="Select theme"
              />
            ) : null}
            {supportsFakeViewerCount(messageKind) ? (
              <SettingsInputRow
                label="Viewer count"
                type="number"
                value={viewerCount}
                onChange={setViewerCount}
                placeholder="42"
              />
            ) : null}
            {supportsFakeEmotes(messageKind) ? (
              <SettingsSwitchRow
                title="Include sample emotes"
                description="Appends Kappa and LUL with Twitch CDN image URLs."
                checked={includeEmotes}
                onCheckedChange={setIncludeEmotes}
              />
            ) : null}
          </SettingsGroup>
        )}

        <SettingsActions>
          <SettingsActionButton
            type="button"
            variant="outline"
            disabled={!hasChannels}
            onClick={handleInjectMessage}
          >
            <MessageSquarePlusIcon className="size-3.5" />
            Inject message
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
    </SettingsTab>
  )
}
