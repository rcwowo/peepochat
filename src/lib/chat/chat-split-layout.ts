export type SplitLayoutDirection = "row" | "column"

export type SplitLayoutEdge = "top" | "right" | "bottom" | "left"

export type ChatSplitLayoutPaneNode = {
  type: "pane"
  channel: string
}

export type ChatSplitLayoutSplitNode = {
  type: "split"
  direction: SplitLayoutDirection
  children: ChatSplitLayoutChild[]
}

export type ChatSplitLayoutNode =
  ChatSplitLayoutPaneNode | ChatSplitLayoutSplitNode

export type ChatSplitLayoutChild = {
  node: ChatSplitLayoutNode
  size: number
}

const DEFAULT_SIZE = 100
const MIN_CHILD_SIZE = 2

function normalizeLogin(login: string) {
  return login.trim().replace(/^#/, "").toLowerCase()
}

function evenSize(count: number) {
  return count > 0 ? DEFAULT_SIZE / count : DEFAULT_SIZE
}

function pane(channel: string): ChatSplitLayoutNode {
  return { type: "pane", channel }
}

function child(
  node: ChatSplitLayoutNode,
  size = DEFAULT_SIZE
): ChatSplitLayoutChild {
  return { node, size }
}

function isFinitePositiveSize(size: number) {
  return Number.isFinite(size) && size > 0
}

function rebalanceChildren(
  children: ChatSplitLayoutChild[]
): ChatSplitLayoutChild[] {
  if (children.length === 0) {
    return []
  }

  const total = children.reduce(
    (sum, entry) => sum + (isFinitePositiveSize(entry.size) ? entry.size : 0),
    0
  )
  const fallback = evenSize(children.length)

  if (total <= 0) {
    return children.map((entry) => ({ ...entry, size: fallback }))
  }

  return children.map((entry) => ({
    ...entry,
    size:
      ((isFinitePositiveSize(entry.size) ? entry.size : fallback) / total) *
      DEFAULT_SIZE,
  }))
}

function appendMissingPanes(
  children: ChatSplitLayoutChild[],
  missing: string[]
): ChatSplitLayoutChild[] {
  if (missing.length === 0) {
    return rebalanceChildren(children)
  }

  const finalCount = children.length + missing.length
  const missingSize = evenSize(finalCount)
  const existingBudget = Math.max(
    DEFAULT_SIZE - missingSize * missing.length,
    0
  )
  const balancedExisting = rebalanceChildren(children).map((entry) => ({
    ...entry,
    size: (entry.size / DEFAULT_SIZE) * existingBudget,
  }))

  return [
    ...balancedExisting,
    ...missing.map((channel) => child(pane(channel), missingSize)),
  ]
}

export function createDefaultSplitLayout(
  channels: string[],
  direction: SplitLayoutDirection = "row"
): ChatSplitLayoutNode {
  const normalized = channels.flatMap((channel) => {
    const login = normalizeLogin(channel)
    return login ? [login] : []
  })

  if (normalized.length <= 1) {
    return pane(normalized[0] ?? "")
  }

  return {
    type: "split",
    direction,
    children: normalized.map((channel) =>
      child(pane(channel), evenSize(normalized.length))
    ),
  }
}

export function flattenSplitLayoutChannels(
  layout: ChatSplitLayoutNode | undefined
): string[] {
  if (!layout) {
    return []
  }

  if (layout.type === "pane") {
    return layout.channel ? [layout.channel] : []
  }

  return layout.children.flatMap((entry) =>
    flattenSplitLayoutChannels(entry.node)
  )
}

function normalizeNode(
  node: ChatSplitLayoutNode | undefined,
  allowed: Set<string>,
  seen: Set<string>
): ChatSplitLayoutNode | null {
  if (!node) {
    return null
  }

  if (node.type === "pane") {
    const channel = normalizeLogin(node.channel)
    if (!channel || !allowed.has(channel) || seen.has(channel)) {
      return null
    }
    seen.add(channel)
    return pane(channel)
  }

  const direction: SplitLayoutDirection =
    node.direction === "column" ? "column" : "row"
  const children = rebalanceChildren(
    node.children
      .map((entry) => {
        const normalized = normalizeNode(entry.node, allowed, seen)
        return normalized ? child(normalized, entry.size) : null
      })
      .filter((entry): entry is ChatSplitLayoutChild => entry !== null)
  )

  if (children.length === 0) {
    return null
  }

  if (children.length === 1) {
    return children[0].node
  }

  return { type: "split", direction, children }
}

export function normalizeSplitLayout(
  layout: ChatSplitLayoutNode | undefined,
  channels: string[]
): ChatSplitLayoutNode | undefined {
  const normalizedChannels = [
    ...new Set(
      channels.flatMap((channel) => {
        const login = normalizeLogin(channel)
        return login ? [login] : []
      })
    ),
  ]
  if (normalizedChannels.length === 0) {
    return undefined
  }

  const allowed = new Set(normalizedChannels)
  const seen = new Set<string>()
  const normalized = normalizeNode(layout, allowed, seen)
  const missing = normalizedChannels.filter((channel) => !seen.has(channel))

  if (!normalized) {
    return createDefaultSplitLayout(normalizedChannels)
  }

  if (missing.length === 0) {
    return normalizedChannels.length >= 2 && normalized.type === "pane"
      ? createDefaultSplitLayout(normalizedChannels)
      : normalized
  }

  if (normalized.type === "split") {
    return {
      ...normalized,
      children: appendMissingPanes(normalized.children, missing),
    }
  }

  return {
    type: "split",
    direction: "row",
    children: appendMissingPanes([child(normalized)], missing),
  }
}

function collapseNode(node: ChatSplitLayoutNode): ChatSplitLayoutNode | null {
  if (node.type === "pane") {
    return node.channel ? node : null
  }

  const children = rebalanceChildren(
    node.children
      .map((entry) => {
        const collapsed = collapseNode(entry.node)
        return collapsed ? child(collapsed, entry.size) : null
      })
      .filter((entry): entry is ChatSplitLayoutChild => entry !== null)
  )

  if (children.length === 0) {
    return null
  }

  if (children.length === 1) {
    return children[0].node
  }

  return { ...node, children }
}

function removePane(
  node: ChatSplitLayoutNode,
  channel: string
): { node: ChatSplitLayoutNode | null; removed: ChatSplitLayoutNode | null } {
  if (node.type === "pane") {
    return node.channel === channel
      ? { node: null, removed: node }
      : { node, removed: null }
  }

  let removed: ChatSplitLayoutNode | null = null
  const children = node.children
    .map((entry) => {
      const result = removed
        ? { node: entry.node, removed: null }
        : removePane(entry.node, channel)
      if (result.removed) {
        removed = result.removed
      }
      return result.node ? child(result.node, entry.size) : null
    })
    .filter((entry): entry is ChatSplitLayoutChild => entry !== null)

  return {
    node: collapseNode({ ...node, children }),
    removed,
  }
}

function edgeDirection(edge: SplitLayoutEdge): SplitLayoutDirection {
  return edge === "left" || edge === "right" ? "row" : "column"
}

function shouldInsertBefore(edge: SplitLayoutEdge) {
  return edge === "left" || edge === "top"
}

function insertNearPane(
  node: ChatSplitLayoutNode,
  targetChannel: string,
  inserted: ChatSplitLayoutNode,
  edge: SplitLayoutEdge
): { node: ChatSplitLayoutNode; inserted: boolean } {
  if (node.type === "pane") {
    if (node.channel !== targetChannel) {
      return { node, inserted: false }
    }

    const before = shouldInsertBefore(edge)
    const direction = edgeDirection(edge)
    return {
      node: {
        type: "split",
        direction,
        children: rebalanceChildren(
          before
            ? [child(inserted), child(node)]
            : [child(node), child(inserted)]
        ),
      },
      inserted: true,
    }
  }

  const direction = edgeDirection(edge)
  const targetIndex = node.children.findIndex(
    (entry) =>
      entry.node.type === "pane" && entry.node.channel === targetChannel
  )

  if (targetIndex >= 0 && node.direction === direction) {
    const nextChildren = [...node.children]
    const offset = shouldInsertBefore(edge) ? 0 : 1
    nextChildren.splice(targetIndex + offset, 0, child(inserted))
    const size = evenSize(nextChildren.length)
    return {
      node: {
        ...node,
        children: nextChildren.map((entry) => child(entry.node, size)),
      },
      inserted: true,
    }
  }

  const children = node.children.map((entry) => {
    const result = insertNearPane(entry.node, targetChannel, inserted, edge)
    if (result.inserted) {
      return { entry: child(result.node, entry.size), inserted: true }
    }
    return { entry, inserted: false }
  })
  const didInsert = children.some((entry) => entry.inserted)

  return {
    node: {
      ...node,
      children: rebalanceChildren(children.map((entry) => entry.entry)),
    },
    inserted: didInsert,
  }
}

export function moveSplitLayoutPane({
  layout,
  channels,
  sourceChannel,
  targetChannel,
  edge,
}: {
  layout: ChatSplitLayoutNode | undefined
  channels: string[]
  sourceChannel: string
  targetChannel: string
  edge: SplitLayoutEdge
}): ChatSplitLayoutNode | undefined {
  const source = normalizeLogin(sourceChannel)
  const target = normalizeLogin(targetChannel)
  if (!source || !target || source === target) {
    return normalizeSplitLayout(layout, channels)
  }

  const base = normalizeSplitLayout(layout, channels)
  if (!base) {
    return undefined
  }

  const withoutSource = removePane(base, source)
  if (!withoutSource.node || !withoutSource.removed) {
    return base
  }

  const inserted = insertNearPane(
    withoutSource.node,
    target,
    withoutSource.removed,
    edge
  )

  return normalizeSplitLayout(
    inserted.inserted ? inserted.node : base,
    channels
  )
}

function updateSizesAtPath(
  node: ChatSplitLayoutNode,
  path: number[],
  sizes: number[]
): ChatSplitLayoutNode {
  if (node.type !== "split") {
    return node
  }

  if (path.length === 0) {
    if (sizes.length !== node.children.length) {
      return node
    }

    return {
      ...node,
      children: rebalanceChildren(
        node.children.map((entry, index) => child(entry.node, sizes[index]))
      ),
    }
  }

  const [index, ...rest] = path
  if (index < 0 || index >= node.children.length) {
    return node
  }

  return {
    ...node,
    children: node.children.map((entry, childIndex) =>
      childIndex === index
        ? child(updateSizesAtPath(entry.node, rest, sizes), entry.size)
        : entry
    ),
  }
}

export function resizeSplitLayoutChildren({
  layout,
  channels,
  path,
  sizes,
}: {
  layout: ChatSplitLayoutNode | undefined
  channels: string[]
  path: number[]
  sizes: number[]
}): ChatSplitLayoutNode | undefined {
  const base = normalizeSplitLayout(layout, channels)
  if (!base) {
    return undefined
  }

  return normalizeSplitLayout(updateSizesAtPath(base, path, sizes), channels)
}

export function clampAdjacentSplitSizes(
  sizes: number[],
  index: number,
  minSize = MIN_CHILD_SIZE
): number[] {
  if (index < 0 || index + 1 >= sizes.length) {
    return sizes
  }

  const next = [...sizes]
  const pairTotal = next[index] + next[index + 1]
  if (pairTotal <= 0) {
    return sizes
  }

  const effectiveMin = Math.min(minSize, pairTotal / 2)
  next[index] = Math.min(
    pairTotal - effectiveMin,
    Math.max(effectiveMin, next[index])
  )
  next[index + 1] = pairTotal - next[index]
  return next
}

export function clampSplitChildSizes(sizes: number[]): number[] {
  if (sizes.length === 0) {
    return []
  }

  const normalized = rebalanceChildren(
    sizes.map((size) => child(pane(""), size))
  ).map((entry) => entry.size)

  const effectiveMin = Math.min(
    MIN_CHILD_SIZE,
    DEFAULT_SIZE / normalized.length
  )
  const next = normalized.map((size) => Math.max(size, effectiveMin))
  const excess = next.reduce((sum, size) => sum + size, 0) - DEFAULT_SIZE

  if (excess > 0) {
    const flexible = next.flatMap((size, index) =>
      size > effectiveMin ? [{ size, index }] : []
    )
    const flexibleTotal = flexible.reduce(
      (sum, entry) => sum + (entry.size - effectiveMin),
      0
    )

    if (flexibleTotal > 0) {
      for (const entry of flexible) {
        next[entry.index] -=
          (excess * (entry.size - effectiveMin)) / flexibleTotal
      }
    }
  }

  return rebalanceChildren(next.map((size) => child(pane(""), size))).map(
    (entry) => entry.size
  )
}
