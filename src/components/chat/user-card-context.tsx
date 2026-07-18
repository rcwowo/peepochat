import * as React from "react"
import { createPortal } from "react-dom"

import { UserCardPanel } from "@/components/chat/user-card-panel"
import {
  UserCardContext,
  type UserCardContextValue,
} from "@/components/chat/user-card-context.shared"
import { useUserCard } from "@/hooks/twitch/use-user-card"
import type { UserCardTarget } from "@/lib/chat/user-card"
import type { TwitchSelfChatState } from "@/lib/twitch/twitch-chat-types"
import { userCardTargetKey } from "@/lib/chat/user-card"
import type {
  MessageTimestampFormat,
  TwitchAccount,
} from "@/lib/peepochat/peepochat-config"
import type { TwitchChatMessage } from "@/lib/twitch/twitch-chat"

const USER_CARD_WIDTH_PX = 352
const USER_CARD_HEIGHT_PX = 544
const USER_CARD_VIEWPORT_MARGIN_PX = 8

function isUserCardOverlayTarget(target: Node): boolean {
  if (!(target instanceof Element)) {
    return false
  }

  return Boolean(
    target.closest(
      '[data-slot="dropdown-menu-content"], [data-slot="dropdown-menu-sub-content"]'
    )
  )
}

function isPointerInsidePanel(
  event: PointerEvent,
  panel: HTMLDivElement
): boolean {
  if (panel.contains(event.target as Node)) {
    return true
  }

  const rect = panel.getBoundingClientRect()
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  )
}

function computeAnchorPosition(rect: DOMRect | null): {
  left: number
  top: number
} {
  const margin = USER_CARD_VIEWPORT_MARGIN_PX

  if (rect) {
    const preferredLeft = rect.right + margin
    const left =
      preferredLeft + USER_CARD_WIDTH_PX <= window.innerWidth - margin
        ? preferredLeft
        : rect.left - USER_CARD_WIDTH_PX - margin

    return {
      left: Math.max(
        margin,
        Math.min(left, window.innerWidth - USER_CARD_WIDTH_PX - margin)
      ),
      top: Math.max(
        margin,
        Math.min(rect.top, window.innerHeight - USER_CARD_HEIGHT_PX - margin)
      ),
    }
  }

  return {
    left: Math.max(margin, (window.innerWidth - USER_CARD_WIDTH_PX) / 2),
    top: Math.max(margin, (window.innerHeight - USER_CARD_HEIGHT_PX) / 2),
  }
}

export function UserCardProvider({
  account,
  channelLogin,
  channelRoomId,
  selfChatState,
  loginWithTwitch,
  getRecentMessages,
  timestampFormat,
  isUserBlocked,
  blockUser,
  unblockUser,
  children,
}: {
  account: TwitchAccount | null
  channelLogin: string
  channelRoomId: string | null
  selfChatState: TwitchSelfChatState | null
  loginWithTwitch: () => void
  getRecentMessages: (target: UserCardTarget) => TwitchChatMessage[]
  timestampFormat: MessageTimestampFormat
  isUserBlocked: (userId?: string | null, login?: string | null) => boolean
  blockUser: (userId: string, login: string) => Promise<void>
  unblockUser: (userId: string, login?: string) => Promise<void>
  children: React.ReactNode
}) {
  const [activeTarget, setActiveTarget] = React.useState<UserCardTarget | null>(
    null
  )
  const [open, setOpen] = React.useState(false)
  const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 })
  const [anchorPosition, setAnchorPosition] = React.useState<{
    left: number
    top: number
  } | null>(null)
  const activeTriggerRef = React.useRef<HTMLElement | null>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)
  const actionsMenuOpenRef = React.useRef(false)

  const card = useUserCard({
    open,
    account,
    target: activeTarget ?? {
      userId: null,
      userName: "",
      displayName: "",
      color: null,
      flags: {
        isBroadcaster: false,
        isModerator: false,
        isSubscriber: false,
        isVip: false,
        isFirst: false,
        isAction: false,
      },
    },
    channelRoomId,
    channelLogin,
    selfChatState,
  })

  const resetUserCardState = React.useCallback(() => {
    setDragOffset({ x: 0, y: 0 })
    setAnchorPosition(null)
    setActiveTarget(null)
    activeTriggerRef.current = null
  }, [])

  const closeUserCard = React.useCallback(() => {
    setOpen(false)
    resetUserCardState()
  }, [resetUserCardState])

  const openUserCard = React.useCallback(
    (target: UserCardTarget, triggerEl: HTMLElement | null) => {
      const rect = triggerEl?.getBoundingClientRect() ?? null
      setActiveTarget(target)
      activeTriggerRef.current = triggerEl
      setAnchorPosition(computeAnchorPosition(rect))
      setDragOffset({ x: 0, y: 0 })
      setOpen(true)
    },
    []
  )

  const isUserCardOpenFor = React.useCallback(
    (target: UserCardTarget) => {
      return (
        open &&
        activeTarget !== null &&
        userCardTargetKey(activeTarget) === userCardTargetKey(target)
      )
    },
    [activeTarget, open]
  )

  const toggleUserCard = React.useCallback(
    (target: UserCardTarget, triggerEl: HTMLElement | null) => {
      if (isUserCardOpenFor(target)) {
        closeUserCard()
        return
      }
      openUserCard(target, triggerEl)
    },
    [closeUserCard, isUserCardOpenFor, openUserCard]
  )

  const handleDragStart = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      const startX = event.clientX
      const startY = event.clientY
      const startOffset = dragOffset

      const handlePointerMove = (moveEvent: PointerEvent) => {
        setDragOffset({
          x: startOffset.x + moveEvent.clientX - startX,
          y: startOffset.y + moveEvent.clientY - startY,
        })
      }

      const handlePointerUp = () => {
        window.removeEventListener("pointermove", handlePointerMove)
        window.removeEventListener("pointerup", handlePointerUp)
      }

      window.addEventListener("pointermove", handlePointerMove)
      window.addEventListener("pointerup", handlePointerUp, { once: true })
    },
    [dragOffset]
  )

  const onCloseUserCard = React.useEffectEvent(closeUserCard)

  React.useEffect(() => {
    if (!open) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const targetNode = event.target as Node
      if (activeTriggerRef.current?.contains(targetNode)) {
        return
      }
      if (isUserCardOverlayTarget(targetNode)) {
        return
      }
      if (panelRef.current && isPointerInsidePanel(event, panelRef.current)) {
        return
      }
      onCloseUserCard()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (actionsMenuOpenRef.current) {
          return
        }
        onCloseUserCard()
      }
    }

    window.addEventListener("pointerdown", handlePointerDown, true)
    window.addEventListener("keydown", handleKeyDown, true)
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true)
      window.removeEventListener("keydown", handleKeyDown, true)
    }
  }, [open])

  const contextValue = React.useMemo<UserCardContextValue>(
    () => ({
      openUserCard,
      closeUserCard,
      toggleUserCard,
      isUserCardOpenFor,
    }),
    [closeUserCard, isUserCardOpenFor, openUserCard, toggleUserCard]
  )

  return (
    <UserCardContext.Provider value={contextValue}>
      {children}
      {open && activeTarget && anchorPosition
        ? createPortal(
            <UserCardPanel
              target={activeTarget}
              card={card}
              account={account}
              channelLogin={channelLogin}
              channelRoomId={channelRoomId}
              selfChatState={selfChatState}
              recentMessages={
                activeTarget ? getRecentMessages(activeTarget) : []
              }
              timestampFormat={timestampFormat}
              loginWithTwitch={loginWithTwitch}
              isUserBlocked={isUserBlocked}
              blockUser={blockUser}
              unblockUser={unblockUser}
              anchorPosition={anchorPosition}
              dragOffset={dragOffset}
              panelRef={panelRef}
              actionsMenuOpenRef={actionsMenuOpenRef}
              onClose={closeUserCard}
              onDragStart={handleDragStart}
            />,
            document.body
          )
        : null}
    </UserCardContext.Provider>
  )
}
