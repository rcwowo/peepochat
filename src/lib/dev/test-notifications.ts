import {
  addLiveNotification,
  addMissedPingNotifications,
  addPingNotification,
  dismissAllLiveNotifications,
  dismissAllMissedPingNotifications,
  dismissAllPingNotifications,
} from "@/lib/highlights/notification-center"
import { getUsernameMentionRuleId } from "@/lib/highlights/highlight-rules"

export function sendTestPingNotification({
  channelLogin,
  accountLogin,
}: {
  channelLogin: string
  accountLogin: string | null
}) {
  const mention = accountLogin?.trim() || "you"
  const displayName = "TestUser"

  return addPingNotification({
    channelLogin,
    messageId: `dev-test-${Date.now()}`,
    userName: "testuser",
    displayName,
    text: `Hey @${mention}, this is a test ping notification.`,
    receivedAt: new Date().toISOString(),
    ruleId: getUsernameMentionRuleId(),
    matchPattern: mention,
  })
}

export function sendTestMissedPingNotification({
  channelLogin,
  accountLogin,
}: {
  channelLogin: string
  accountLogin: string | null
}) {
  const mention = accountLogin?.trim() || "you"

  return (
    addMissedPingNotifications([
      {
        channelLogin,
        messageId: `dev-test-missed-${Date.now()}`,
        userName: "misseduser",
        displayName: "MissedUser",
        text: `Hey @${mention}, you may have missed this before connecting.`,
        receivedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
        ruleId: getUsernameMentionRuleId(),
        matchPattern: mention,
      },
    ]) > 0
  )
}

export function sendTestLiveNotification({
  channelLogin,
}: {
  channelLogin: string
}) {
  return addLiveNotification({
    channelLogin,
    title: "This is a test stream title. Incredible things happening today!",
    gameName: "Just Chatting",
    wentLiveAt: new Date().toISOString(),
  })
}

export function clearAllTestNotifications() {
  dismissAllPingNotifications()
  dismissAllLiveNotifications()
  dismissAllMissedPingNotifications()
}
