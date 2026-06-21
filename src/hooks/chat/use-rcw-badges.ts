import * as React from "react"

import {
  buildMemberBadgeCatalog,
  buildMemberBadgeIndex,
  resolveMemberBadge,
  type ResolvedMemberBadge,
} from "@/lib/chat/rcw-badges"
import {
  fetchRcwMemberAssignments,
  fetchRcwMemberBadgeDefinitions,
} from "@/lib/rcw/rcw-members-api"

export function useRcwBadges() {
  const [memberBadgeIndex, setMemberBadgeIndex] = React.useState<
    Map<string, ResolvedMemberBadge>
  >(() => new Map())
  const loadingRef = React.useRef(false)

  React.useEffect(() => {
    if (loadingRef.current) {
      return
    }

    loadingRef.current = true

    void Promise.all([
      fetchRcwMemberBadgeDefinitions(),
      fetchRcwMemberAssignments(),
    ])
      .then(([definitions, assignments]) => {
        const catalog = buildMemberBadgeCatalog(definitions)
        setMemberBadgeIndex(buildMemberBadgeIndex(assignments, catalog))
      })
      .catch(() => {
        setMemberBadgeIndex(new Map())
      })
      .finally(() => {
        loadingRef.current = false
      })
  }, [])

  const getMemberBadge = React.useCallback(
    (userId: string | null): ResolvedMemberBadge | null =>
      resolveMemberBadge(userId, memberBadgeIndex),
    [memberBadgeIndex]
  )

  return { getMemberBadge }
}
