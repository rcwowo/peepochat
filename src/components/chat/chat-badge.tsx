import type * as React from "react"
import {
  BadgeCheck,
  Crown,
  Gem,
  Palette,
  Star,
  Swords,
  Video,
  Wrench,
} from "lucide-react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { ResolvedChatBadge } from "@/lib/chat/chat-badges"
import type { TwitchBadge } from "@/lib/twitch/twitch-chat"

const ROLE_BADGE_FALLBACK: Record<
  string,
  { label: string; bg: string; icon: React.ComponentType<{ className?: string }> }
> = {
  staff: { label: "Staff", bg: "#000000", icon: Wrench },
  partner: { label: "Partner", bg: "#a96dff", icon: BadgeCheck },
  premium: { label: "Prime", bg: "#0096d6", icon: Crown },
  broadcaster: { label: "Broadcaster", bg: "#E91916", icon: Video },
  moderator: { label: "Moderator", bg: "#00AD03", icon: Swords },
  vip: { label: "VIP", bg: "#A10886", icon: Gem },
  founder: { label: "Founder", bg: "#b638ef", icon: Crown },
  "artist-badge": { label: "Artist", bg: "#1e69ff", icon: Palette },
  subscriber: { label: "Subscriber", bg: "#8204B5", icon: Star },
}

export function ChatBadge({ badge }: { badge: ResolvedChatBadge }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <img
          className="chat-badge inline-block align-middle"
          src={badge.imageUrl}
          srcSet={
            badge.imageUrl2x
              ? `${badge.imageUrl} 1x, ${badge.imageUrl2x} 2x`
              : undefined
          }
          alt={badge.description}
          width={18}
          height={18}
          loading="lazy"
          decoding="async"
        />
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4} className="px-2 py-1 text-xs">
        {badge.title}
      </TooltipContent>
    </Tooltip>
  )
}

function ChatBadgeFallback({ badge }: { badge: TwitchBadge }) {
  const role = ROLE_BADGE_FALLBACK[badge.set]
  if (!role) {
    return null
  }

  const Icon = role.icon

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex size-[18px] items-center justify-center rounded-xs align-middle"
          style={{ backgroundColor: role.bg }}
        >
          <Icon className="size-3 text-white" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4} className="px-2 py-1 text-xs">
        {role.label}
      </TooltipContent>
    </Tooltip>
  )
}

export function ChatBadgeList({
  badges,
  unresolved = [],
  showFallback = false,
}: {
  badges: ResolvedChatBadge[]
  unresolved?: TwitchBadge[]
  showFallback?: boolean
}) {
  const fallbackBadges =
    showFallback && badges.length === 0
      ? unresolved.filter((badge) => ROLE_BADGE_FALLBACK[badge.set])
      : []

  if (badges.length === 0 && fallbackBadges.length === 0) {
    return null
  }

  return (
    <span className="mr-0.5 inline-flex items-center gap-0.5 align-middle">
      {badges.map((badge) => (
        <ChatBadge key={badge.id} badge={badge} />
      ))}
      {fallbackBadges.map((badge, index) => (
        <ChatBadgeFallback key={`${badge.set}-${index}`} badge={badge} />
      ))}
    </span>
  )
}
