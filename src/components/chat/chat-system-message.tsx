import * as React from "react"
import { Gift, Megaphone, Shield, Star, Users } from "lucide-react"

import { ChatMessageBody } from "@/components/chat/chat-message-body"
import { ChatTimestamp } from "@/components/chat/chat-timestamp"
import { ChatUsername } from "@/components/chat/chat-username"
import type { MessageTimestampFormat } from "@/lib/peepochat/peepochat-config"
import type { TwitchSystemMessage } from "@/lib/twitch/twitch-chat"
import { cn } from "@/lib/utils"

const ANNOUNCEMENT_GRADIENTS: Record<string, [string, string]> = {
  primary: ["#9146ff", "#9146ff"],
  blue: ["#00d6d6", "#9146ff"],
  green: ["#00db84", "#57bee6"],
  orange: ["#ffb31a", "#e0e000"],
  purple: ["#9146ff", "#ff75e6"],
}

function getAnnouncementGradient(
  theme: string | null,
  accentColor: string | null
) {
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

function InlineSystemLine({
  message,
  timestampFormat,
  className,
}: {
  message: TwitchSystemMessage
  timestampFormat: MessageTimestampFormat
  className?: string
}) {
  return (
    <div className={cn("chat-message group px-3 leading-5", className)}>
      <ChatTimestamp
        receivedAt={message.receivedAt}
        timestampFormat={timestampFormat}
      />
      <span className="chat-message-size chat-system-text">
        {message.text}
      </span>
    </div>
  )
}

function ModActionLine({
  message,
  timestampFormat,
  className,
}: {
  message: TwitchSystemMessage
  timestampFormat: MessageTimestampFormat
  className?: string
}) {
  return (
    <div className={cn("chat-message group px-3 leading-5", className)}>
      <ChatTimestamp
        receivedAt={message.receivedAt}
        timestampFormat={timestampFormat}
      />
      <span className="chat-message-size chat-system-text inline-flex max-w-full items-start gap-1.5 align-top">
        <Shield className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>{message.text}</span>
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
  className,
  children,
}: {
  message: TwitchSystemMessage
  timestampFormat: MessageTimestampFormat
  borderColor: string
  icon: React.ReactNode
  showDetails?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("chat-message group px-3 leading-5", className)}>
      <div
        className="chat-notice-block -mx-3 border-l-4 px-3 py-1"
        style={{ borderColor }}
      >
        <ChatTimestamp
          receivedAt={message.receivedAt}
          timestampFormat={timestampFormat}
        />
        <span className="chat-message-size inline-flex max-w-full items-start gap-1.5 align-top">
          <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
          <span className="min-w-0">{children}</span>
        </span>

        {showDetails && message.details ? (
          <span className="chat-notice-user-message mt-1 block pl-6 leading-5">
            {message.details}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function SubscriptionNotice({
  message,
  timestampFormat,
  className,
}: {
  message: TwitchSystemMessage
  timestampFormat: MessageTimestampFormat
  className?: string
}) {
  const borderColor = message.actor?.color ?? "var(--chat-notice-sub-border)"
  const gift = isGiftNotice(message.msgId)

  return (
    <NoticeBlock
      message={message}
      timestampFormat={timestampFormat}
      borderColor={borderColor}
      className={className}
      icon={
        gift ? (
          <Gift className="size-4" aria-hidden />
        ) : (
          <Star className="size-4 fill-current" aria-hidden />
        )
      }
      showDetails={false}
    >
      <span className="chat-notice-body font-bold">{message.headline}</span>
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
  className,
}: {
  message: TwitchSystemMessage
  timestampFormat: MessageTimestampFormat
  className?: string
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
      className={className}
      icon={<Users className="size-4" aria-hidden />}
    >
      <span className="chat-notice-body font-bold">
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
            is raiding with {viewerLabel}!
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
  className,
}: {
  message: TwitchSystemMessage
  timestampFormat: MessageTimestampFormat
  className?: string
}) {
  const [start, end] = getAnnouncementGradient(
    message.announcementTheme,
    message.accentColor
  )

  return (
    <div className={cn("chat-message group px-3 leading-5", className)}>
      <div
        className="chat-announcement -mx-3 border-x-4 [border-image-slice:1]"
        style={{
          borderImageSource: `linear-gradient(180deg, ${start}, ${end})`,
        }}
      >
        <span className="chat-announcement-header flex items-center px-3 py-1 text-xs font-medium">
          <Megaphone className="mr-2 size-3.5 -scale-x-100" aria-hidden />
          Announcement
        </span>

        <span className="chat-message-size chat-announcement-body block px-3 py-1.5">
          <ChatTimestamp
            receivedAt={message.receivedAt}
            timestampFormat={timestampFormat}
          />
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
            <ChatMessageBody
              text={message.details}
              emotes={message.detailsEmotes ?? []}
            />
          ) : (
            <span className="chat-message-text">{message.headline}</span>
          )}
        </span>
      </div>
    </div>
  )
}

function ChatSystemMessageInner({
  message,
  timestampFormat,
  isHistorical = false,
  isAlternateRow = false,
}: {
  message: TwitchSystemMessage
  timestampFormat: MessageTimestampFormat
  isHistorical?: boolean
  isAlternateRow?: boolean
}) {
  const rowClassName = cn(
    isHistorical && "chat-message--historical",
    isAlternateRow && "chat-message--alternate"
  )

  let content: React.ReactNode

  switch (message.event) {
    case "subscription":
      content = (
        <SubscriptionNotice
          message={message}
          timestampFormat={timestampFormat}
          className={rowClassName}
        />
      )
      break
    case "raid":
      content = (
        <RaidNotice
          message={message}
          timestampFormat={timestampFormat}
          className={rowClassName}
        />
      )
      break
    case "announcement":
      content = (
        <AnnouncementNotice
          message={message}
          timestampFormat={timestampFormat}
          className={rowClassName}
        />
      )
      break
    case "mod_action":
      content = (
        <ModActionLine
          message={message}
          timestampFormat={timestampFormat}
          className={rowClassName}
        />
      )
      break
    case "connection":
    case "notice":
    case "status":
    default:
      content = (
        <InlineSystemLine
          message={message}
          timestampFormat={timestampFormat}
          className={rowClassName}
        />
      )
  }

  return content
}

export const ChatSystemMessage = React.memo(ChatSystemMessageInner)
