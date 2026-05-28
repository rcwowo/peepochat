import * as React from "react"
import {
  Gift,
  Megaphone,
  Star,
  Users,
} from "lucide-react"

import { ChatMessageBody } from "@/components/chat/chat-message-body"
import { ChatUsername } from "@/components/chat/chat-username"
import type { MessageTimestampFormat } from "@/lib/peepochat-config"
import { formatMessageTimestamp } from "@/lib/peepochat-context"
import type { TwitchSystemMessage } from "@/lib/twitch-chat"
import { cn } from "@/lib/utils"

const ANNOUNCEMENT_GRADIENTS: Record<string, [string, string]> = {
  primary: ["#9146ff", "#9146ff"],
  blue: ["#00d6d6", "#9146ff"],
  green: ["#00db84", "#57bee6"],
  orange: ["#ffb31a", "#e0e000"],
  purple: ["#9146ff", "#ff75e6"],
}

function getAnnouncementGradient(theme: string | null, accentColor: string | null) {
  const key = theme?.toLowerCase() ?? "primary"
  if (ANNOUNCEMENT_GRADIENTS[key]) {
    return ANNOUNCEMENT_GRADIENTS[key]
  }

  const fallback = accentColor ?? "#9146ff"
  return [fallback, fallback] as [string, string]
}

function isGiftNotice(msgId: string | null) {
  return Boolean(msgId && /gift|anon/i.test(msgId))
}

function ChatTimestamp({
  receivedAt,
  timestampFormat,
  className = "chat-timestamp mr-1.5 inline-block align-top text-xs tabular-nums select-none",
}: {
  receivedAt: string
  timestampFormat: MessageTimestampFormat
  className?: string
}) {
  const timestamp = formatMessageTimestamp(receivedAt, timestampFormat)
  if (!timestamp) {
    return null
  }

  return (
    <time className={className} dateTime={receivedAt}>
      {timestamp}
    </time>
  )
}

function InlineSystemLine({
  message,
  timestampFormat,
}: {
  message: TwitchSystemMessage
  timestampFormat: MessageTimestampFormat
}) {
  return (
    <div className="chat-message group px-3 py-1 leading-5">
      <ChatTimestamp
        receivedAt={message.receivedAt}
        timestampFormat={timestampFormat}
      />
      <span className="chat-message-size chat-system-text italic">
        {message.text}
      </span>
    </div>
  )
}

function NoticeBlock({
  message,
  timestampFormat,
  borderColor,
  icon,
  showDetails = true,
  children,
}: {
  message: TwitchSystemMessage
  timestampFormat: MessageTimestampFormat
  borderColor: string
  icon: React.ReactNode
  showDetails?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="chat-message group px-3 py-1 leading-5">
      <ChatTimestamp
        receivedAt={message.receivedAt}
        timestampFormat={timestampFormat}
      />

      <span className="chat-message-size inline-block min-w-0 align-top">
        <span
          className="chat-notice-block inline-block border-l-4 py-1 pr-2 pl-2 align-top"
          style={{ borderColor }}
        >
          <span className="inline-flex max-w-full items-start gap-1.5">
            <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
            <span className="min-w-0">{children}</span>
          </span>

          {showDetails && message.details ? (
            <span className="chat-notice-user-message mt-1 block pl-6 leading-5">
              {message.details}
            </span>
          ) : null}
        </span>
      </span>
    </div>
  )
}

function SubscriptionNotice({
  message,
  timestampFormat,
}: {
  message: TwitchSystemMessage
  timestampFormat: MessageTimestampFormat
}) {
  const borderColor = message.actor?.color ?? "var(--chat-notice-sub-border)"
  const gift = isGiftNotice(message.msgId)

  return (
    <NoticeBlock
      message={message}
      timestampFormat={timestampFormat}
      borderColor={borderColor}
      icon={
        gift ? (
          <Gift className="size-4" aria-hidden />
        ) : (
          <Star className="size-4 fill-current" aria-hidden />
        )
      }
      showDetails={false}
    >
      <span className="chat-notice-body">{message.headline}</span>
      {message.details ? (
        <span className="chat-notice-user-message mt-1 block leading-5">
          <ChatMessageBody
            text={message.details}
            emotes={message.detailsEmotes ?? []}
          />
        </span>
      ) : null}
    </NoticeBlock>
  )
}

function RaidNotice({
  message,
  timestampFormat,
}: {
  message: TwitchSystemMessage
  timestampFormat: MessageTimestampFormat
}) {
  const borderColor = message.actor?.color ?? "var(--chat-notice-raid-border)"
  const viewerLabel =
    message.viewerCount != null
      ? `${message.viewerCount} ${message.viewerCount === 1 ? "viewer" : "viewers"}`
      : null

  return (
    <NoticeBlock
      message={message}
      timestampFormat={timestampFormat}
      borderColor={borderColor}
      icon={<Users className="size-4" aria-hidden />}
    >
      <span className="chat-notice-body">
        {viewerLabel && message.headline === "Raid" ? (
          <>
            {message.actor ? (
              <ChatUsername
                displayName={message.actor.displayName}
                color={message.actor.color}
              />
            ) : (
              "A channel"
            )}{" "}
            is raiding with <span className="font-semibold">{viewerLabel}</span>!
          </>
        ) : (
          message.headline
        )}
      </span>
    </NoticeBlock>
  )
}

function AnnouncementNotice({
  message,
  timestampFormat,
}: {
  message: TwitchSystemMessage
  timestampFormat: MessageTimestampFormat
}) {
  const [start, end] = getAnnouncementGradient(
    message.announcementTheme,
    message.accentColor
  )

  return (
    <div className="chat-message group px-3 py-1 leading-5">
      <ChatTimestamp
        receivedAt={message.receivedAt}
        timestampFormat={timestampFormat}
      />

      <span className="inline-block min-w-0 align-top">
        <span
          className="chat-announcement inline-block border-x-4 align-top [border-image-slice:1]"
          style={{
            borderImageSource: `linear-gradient(180deg, ${start}, ${end})`,
          }}
        >
          <span className="chat-announcement-header flex items-center px-2.5 py-1 text-xs font-medium">
            <Megaphone className="mr-2 -scale-x-100 size-3.5" aria-hidden />
            Announcement
          </span>

          <span className="chat-message-size chat-announcement-body block px-2.5 py-1.5">
            {message.actor ? (
              <>
                <ChatUsername
                  displayName={message.actor.displayName}
                  color={message.actor.color}
                />
                <span className="text-muted-foreground">: </span>
              </>
            ) : null}
            {message.details ? (
              <ChatMessageBody text={message.details} emotes={[]} />
            ) : (
              <span className="chat-message-text">{message.headline}</span>
            )}
          </span>
        </span>
      </span>
    </div>
  )
}

function ChatSystemMessageInner({
  message,
  timestampFormat,
  isHistorical = false,
}: {
  message: TwitchSystemMessage
  timestampFormat: MessageTimestampFormat
  isHistorical?: boolean
}) {
  const historicalClass = isHistorical ? "chat-message--historical" : undefined

  let content: React.ReactNode

  switch (message.event) {
    case "subscription":
      content = (
        <SubscriptionNotice message={message} timestampFormat={timestampFormat} />
      )
      break
    case "raid":
      content = <RaidNotice message={message} timestampFormat={timestampFormat} />
      break
    case "announcement":
      content = (
        <AnnouncementNotice message={message} timestampFormat={timestampFormat} />
      )
      break
    case "connection":
    case "notice":
    case "status":
    default:
      content = (
        <InlineSystemLine message={message} timestampFormat={timestampFormat} />
      )
  }

  if (!historicalClass) {
    return content
  }

  return <div className={cn(historicalClass)}>{content}</div>
}

export const ChatSystemMessage = React.memo(ChatSystemMessageInner)
