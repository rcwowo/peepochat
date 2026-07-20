import * as React from "react"

import { useUserCardContext } from "@/hooks/twitch/use-user-card-context"
import type { UserCardTarget } from "@/lib/chat/user-card"
import { getReadableUsernameColor } from "@/lib/chat/chat-username"

type UserCardPopoverProps = {
  target: UserCardTarget
}

export function UserCardPopover({ target }: UserCardPopoverProps) {
  const context = useUserCardContext()
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const readableColor = getReadableUsernameColor(target.color)

  const handleTriggerClick = React.useCallback(() => {
    if (!context) {
      return
    }

    context.toggleUserCard(target, triggerRef.current)
  }, [context, target])

  if (!context) {
    return (
      <span
        className="chat-username font-semibold"
        style={readableColor ? { color: readableColor } : undefined}
      >
        {target.displayName}
      </span>
    )
  }

  const open = context.isUserCardOpenFor(target)

  return (
    <button
      ref={triggerRef}
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      className="chat-username cursor-pointer rounded-sm font-semibold outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
      style={readableColor ? { color: readableColor } : undefined}
      onClick={handleTriggerClick}
    >
      {target.displayName}
    </button>
  )
}
