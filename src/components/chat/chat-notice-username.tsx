import * as React from "react"

import { UserCardPopover } from "@/components/chat/user-card-popover"
import { createUserCardTargetFromNoticeActor } from "@/lib/chat/user-card"
import type { TwitchNoticeActor } from "@/lib/twitch/twitch-chat"

export function NoticeUserCard({ actor }: { actor: TwitchNoticeActor }) {
  const target = React.useMemo(
    () => createUserCardTargetFromNoticeActor(actor),
    [actor]
  )
  return <UserCardPopover target={target} />
}

function findNameIndex(
  text: string,
  names: Array<string | null | undefined>
): { index: number; length: number } | null {
  let best: { index: number; length: number } | null = null
  const lowerText = text.toLowerCase()

  for (const name of names) {
    const trimmed = name?.trim()
    if (!trimmed) continue
    const index = lowerText.indexOf(trimmed.toLowerCase())
    if (index < 0) continue
    if (
      !best ||
      index < best.index ||
      (index === best.index && trimmed.length > best.length)
    ) {
      best = { index, length: trimmed.length }
    }
  }

  return best
}

export function TextWithClickableName({
  text,
  actor,
}: {
  text: string
  actor: TwitchNoticeActor | null
}) {
  if (!actor) {
    return <>{text}</>
  }

  const match = findNameIndex(text, [actor.displayName, actor.userName])
  if (!match) {
    return <>{text}</>
  }

  const before = text.slice(0, match.index)
  const after = text.slice(match.index + match.length)

  return (
    <>
      {before}
      <NoticeUserCard actor={actor} />
      {after}
    </>
  )
}
