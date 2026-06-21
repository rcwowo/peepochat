import type {
  RcwMemberAssignment,
  RcwMemberBadgeDefinition,
} from "@/lib/rcw/rcw-members-api"

export type ResolvedMemberBadge = {
  id: string
  title: string
  description: string
  imageUrl: string
}

export function buildMemberBadgeCatalog(
  definitions: RcwMemberBadgeDefinition[]
): Map<number, ResolvedMemberBadge> {
  const catalog = new Map<number, ResolvedMemberBadge>()

  for (const definition of definitions) {
    catalog.set(definition.id, {
      id: String(definition.id),
      title: definition.name,
      description: definition.description,
      imageUrl: definition.image,
    })
  }

  return catalog
}

export function buildMemberBadgeIndex(
  assignments: RcwMemberAssignment[],
  catalog: Map<number, ResolvedMemberBadge>
): Map<string, ResolvedMemberBadge> {
  const index = new Map<string, ResolvedMemberBadge>()

  for (const assignment of assignments) {
    if (assignment.badge == null) {
      continue
    }

    const badgeId = Number.parseInt(assignment.badge, 10)
    if (Number.isNaN(badgeId)) {
      continue
    }

    const badge = catalog.get(badgeId)
    if (badge) {
      index.set(assignment.userId, badge)
    }
  }

  return index
}

export function resolveMemberBadge(
  userId: string | null,
  index: Map<string, ResolvedMemberBadge>
): ResolvedMemberBadge | null {
  if (!userId) {
    return null
  }

  return index.get(userId) ?? null
}
