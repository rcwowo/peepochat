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
import type { ResolvedMemberBadge } from "@/lib/chat/rcw-badges"
import type { TwitchBadge } from "@/lib/twitch/twitch-chat"

const ROLE_BADGE_FALLBACK: Record<
  string,
  {
    label: string
    bg: string
    icon: React.ComponentType<{ className?: string }>
  }
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

function ChatBadgeImage({
  imageUrl,
  imageUrl2x,
  title,
  description,
}: {
  imageUrl: string
  imageUrl2x?: string
  title: string
  description: string
}) {
  return (
    <Tooltip disableHoverableContent>
      <TooltipTrigger asChild>
        <img
          className="chat-badge inline-block align-middle"
          src={imageUrl}
          srcSet={imageUrl2x ? `${imageUrl} 1x, ${imageUrl2x} 2x` : undefined}
          alt={description}
          loading="lazy"
          decoding="async"
        />
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={4}
        className="pointer-events-none px-2 py-1 text-xs"
      >
        {title}
      </TooltipContent>
    </Tooltip>
  )
}

export function ChatBadge({ badge }: { badge: ResolvedChatBadge }) {
  return (
    <ChatBadgeImage
      imageUrl={badge.imageUrl}
      imageUrl2x={badge.imageUrl2x}
      title={badge.title}
      description={badge.description}
    />
  )
}

export function MemberBadge({ badge }: { badge: ResolvedMemberBadge }) {
  return (
    <ChatBadgeImage
      imageUrl={badge.imageUrl}
      title={badge.title}
      description={badge.description}
    />
  )
}

function ChatBadgeFallback({ badge }: { badge: TwitchBadge }) {
  const role = ROLE_BADGE_FALLBACK[badge.set]
  if (!role) {
    return null
  }

  const Icon = role.icon

  return (
    <Tooltip disableHoverableContent>
      <TooltipTrigger asChild>
        <span
          className="chat-badge-fallback inline-flex items-center justify-center rounded-xs align-middle"
          style={{ backgroundColor: role.bg }}
        >
          <Icon className="chat-badge-fallback-icon text-white" />
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={4}
        className="pointer-events-none px-2 py-1 text-xs"
      >
        {role.label}
      </TooltipContent>
    </Tooltip>
  )
}

const EMPTY_TWITCH_BADGES: TwitchBadge[] = []

export function ChatBadgeList({
  badges,
  memberBadge = null,
  unresolved = EMPTY_TWITCH_BADGES,
  showFallback = false,
}: {
  badges: ResolvedChatBadge[]
  memberBadge?: ResolvedMemberBadge | null
  unresolved?: TwitchBadge[]
  showFallback?: boolean
}) {
  const fallbackBadges =
    showFallback && badges.length === 0
      ? unresolved.filter((badge) => ROLE_BADGE_FALLBACK[badge.set])
      : []

  if (badges.length === 0 && fallbackBadges.length === 0 && !memberBadge) {
    return null
  }

  return (
    <span className="mr-1 inline-flex items-center gap-0.5 align-middle">
      {badges.map((badge) => (
        <ChatBadge key={badge.id} badge={badge} />
      ))}
      {memberBadge ? <MemberBadge badge={memberBadge} /> : null}
      {fallbackBadges.map((badge, index) => (
        <ChatBadgeFallback key={`${badge.set}-${index}`} badge={badge} />
      ))}
    </span>
  )
}
