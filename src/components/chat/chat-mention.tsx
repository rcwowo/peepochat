import * as React from "react"

import { useChatterByLogin } from "@/hooks/chat-ui/use-chatter-by-login"
import { useResolvedUsernameColor } from "@/hooks/chat-ui/use-resolved-username-color"
import { useUserCardContext } from "@/hooks/twitch/use-user-card-context"
import type { ChannelChatter } from "@/lib/chat/chatter-store"
import {
  createEmptyUserCardFlags,
  type UserCardTarget,
} from "@/lib/chat/user-card"

const MENTION_LOGIN_PATTERN = /^@([A-Za-z0-9_]+)$/

function createMentionTarget(
  mention: string,
  login: string,
  chatter: ChannelChatter | null,
  channelLogin: string
): UserCardTarget {
  if (chatter) {
    return {
      userId: chatter.userId,
      userName: chatter.login,
      displayName: chatter.displayName,
      color: chatter.color,
      flags: chatter.flags,
      channelLogin,
    }
  }

  return {
    userId: null,
    userName: login,
    displayName: mention.slice(1),
    color: null,
    flags: createEmptyUserCardFlags(),
    channelLogin,
  }
}

export function ChatMention({
  mention,
  channelLogin,
  children,
}: {
  mention: string
  channelLogin?: string
  children?: React.ReactNode
}) {
  const userCardContext = useUserCardContext()
  const triggerRef = React.useRef<HTMLButtonElement>(null)

  const login = MENTION_LOGIN_PATTERN.exec(mention)?.[1]?.toLowerCase()
  const chatter = useChatterByLogin(channelLogin, login)

  const target =
    channelLogin && login
      ? createMentionTarget(mention, login, chatter, channelLogin)
      : null
  const readableColor = useResolvedUsernameColor({
    channelLogin,
    userName: login,
    color: target?.color,
  })

  const handleTriggerClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (!target || !userCardContext) {
        return
      }
      userCardContext.toggleUserCard(target, triggerRef.current)
    },
    [target, userCardContext]
  )

  if (!target || !userCardContext) {
    return (
      <span
        className="chat-mention font-semibold"
        style={readableColor ? { color: readableColor } : undefined}
      >
        {children ?? mention}
      </span>
    )
  }

  return (
    <button
      ref={triggerRef}
      type="button"
      aria-haspopup="dialog"
      aria-expanded={userCardContext.isUserCardOpenFor(target)}
      className="chat-mention cursor-pointer rounded-sm font-semibold outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
      style={readableColor ? { color: readableColor } : undefined}
      onClick={handleTriggerClick}
    >
      {children ?? mention}
    </button>
  )
}
