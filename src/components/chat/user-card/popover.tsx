import * as React from "react"

import { useResolvedUsernameColor } from "@/hooks/chat-ui/use-resolved-username-color"
import { useUserCardContext } from "@/hooks/chat-ui/use-user-card-context"
import type { UserCardTarget } from "@/lib/chat/user-card/user-card"
import type { PingMatchRange } from "@/lib/highlights/highlight-rules"
import { HighlightedText } from "@/lib/highlights/ping-match-mark"

type UserCardPopoverProps = {
  target: UserCardTarget
  nameHighlightRanges?: PingMatchRange[] | null
}

export function UserCardPopover({
  target,
  nameHighlightRanges,
}: UserCardPopoverProps) {
  const context = useUserCardContext()
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const readableColor = useResolvedUsernameColor({
    channelLogin: target.channelLogin,
    userName: target.userName,
    color: target.color,
  })

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
        <HighlightedText
          text={target.displayName}
          ranges={nameHighlightRanges}
        />
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
      <HighlightedText text={target.displayName} ranges={nameHighlightRanges} />
    </button>
  )
}
