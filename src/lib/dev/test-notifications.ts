import {
  addLiveNotification,
  addPingNotification,
  dismissAllLiveNotifications,
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
}
