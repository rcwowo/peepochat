import {
  insertSplitLayoutPane,
  moveSplitLayoutPane,
  normalizeSplitLayout,
  resizeSplitLayoutChildren,
  type ChatSplitLayoutNode,
  type SplitLayoutEdge,
} from "@/lib/chat/layout/split-layout"
import type {
  PlayerMode,
  PlayerMultiAudio,
} from "@/lib/peepochat/peepochat-config"

export type WatchInstance = {
  login: string
  muted: boolean
}

export type WatchState = {
  instances: WatchInstance[]
  layout: ChatSplitLayoutNode | undefined
  chatLogin: string | null
  focusedLogin: string | null
  viewActive: boolean
}

export type WatchAction =
  | {
      type: "open"
      login: string
      mode: PlayerMode
      multiAudio: PlayerMultiAudio
    }
  | { type: "close"; login: string }
  | { type: "closeAll" }
  | { type: "show"; login?: string }
  | { type: "hide" }
  | { type: "setChat"; login: string }
  | {
      type: "move"
      sourceLogin: string
      targetLogin: string
      edge: SplitLayoutEdge
    }
  | { type: "resize"; path: number[]; sizes: number[] }
  | { type: "reportMuted"; login: string; muted: boolean }

export const EMPTY_WATCH_STATE: WatchState = {
  instances: [],
  layout: undefined,
  chatLogin: null,
  focusedLogin: null,
  viewActive: false,
}

const PLACEMENT_WIDTH = 16
const PLACEMENT_HEIGHT = 9

type PlacementLeaf = { login: string; width: number; height: number }

function collectLeaves(
  node: ChatSplitLayoutNode,
  width: number,
  height: number,
  leaves: PlacementLeaf[]
) {
  if (node.type === "pane") {
    leaves.push({ login: node.channel, width, height })
    return
  }

  const total = node.children.reduce((sum, entry) => sum + entry.size, 0) || 1
  for (const entry of node.children) {
    const share = entry.size / total
    if (node.direction === "row") {
      collectLeaves(entry.node, width * share, height, leaves)
    } else {
      collectLeaves(entry.node, width, height * share, leaves)
    }
  }
}

function placeNewPane(
  layout: ChatSplitLayoutNode | undefined,
  logins: string[],
  login: string
): ChatSplitLayoutNode | undefined {
  const existing = logins.filter((entry) => entry !== login)
  const base = normalizeSplitLayout(layout, existing)
  if (!base) {
    return normalizeSplitLayout(undefined, logins)
  }

  const leaves: PlacementLeaf[] = []
  collectLeaves(base, PLACEMENT_WIDTH, PLACEMENT_HEIGHT, leaves)
  const target = leaves.reduce<PlacementLeaf | null>((best, leaf) => {
    if (!best) return leaf
    return leaf.width * leaf.height >= best.width * best.height ? leaf : best
  }, null)
  if (!target) {
    return normalizeSplitLayout(base, logins)
  }

  const edge: SplitLayoutEdge =
    target.width / target.height >= PLACEMENT_WIDTH / PLACEMENT_HEIGHT
      ? "right"
      : "bottom"

  return insertSplitLayoutPane({
    layout: base,
    channels: logins,
    channel: login,
    targetChannel: target.login,
    edge,
  })
}

function pickNeighbor(logins: string[], removedIndex: number) {
  if (logins.length === 0) return null
  return logins[Math.max(0, Math.min(removedIndex - 1, logins.length - 1))]
}

function startMuted(
  state: WatchState,
  mode: PlayerMode,
  multiAudio: PlayerMultiAudio
) {
  if (mode === "sidebar") return false
  if (multiAudio === "all") return false
  if (multiAudio === "muted") return true
  return state.instances.length > 0
}

export function watchReducer(
  state: WatchState,
  action: WatchAction
): WatchState {
  switch (action.type) {
    case "open": {
      const login = action.login
      if (state.instances.some((instance) => instance.login === login)) {
        return {
          ...state,
          focusedLogin: action.mode === "sidebar" ? login : state.focusedLogin,
          viewActive: true,
        }
      }

      const muted = startMuted(state, action.mode, action.multiAudio)
      const instances = [
        ...state.instances.map((instance) =>
          action.mode === "sidebar" ? { ...instance, muted: true } : instance
        ),
        { login, muted },
      ]
      const logins = instances.map((instance) => instance.login)

      return {
        instances,
        layout: placeNewPane(state.layout, logins, login),
        chatLogin: state.chatLogin ?? login,
        focusedLogin:
          action.mode === "sidebar" || !state.focusedLogin
            ? login
            : state.focusedLogin,
        viewActive: true,
      }
    }
    case "close": {
      const index = state.instances.findIndex(
        (instance) => instance.login === action.login
      )
      if (index < 0) return state

      const instances = state.instances.filter(
        (instance) => instance.login !== action.login
      )
      if (instances.length === 0) return EMPTY_WATCH_STATE

      const logins = instances.map((instance) => instance.login)
      return {
        instances,
        layout: normalizeSplitLayout(state.layout, logins),
        chatLogin:
          state.chatLogin === action.login
            ? pickNeighbor(logins, index)
            : state.chatLogin,
        focusedLogin:
          state.focusedLogin === action.login
            ? pickNeighbor(logins, index)
            : state.focusedLogin,
        viewActive: state.viewActive,
      }
    }
    case "closeAll":
      return EMPTY_WATCH_STATE
    case "show": {
      if (state.instances.length === 0) return state
      const login = action.login
      const focusedLogin =
        login && state.instances.some((instance) => instance.login === login)
          ? login
          : state.focusedLogin
      if (state.viewActive && focusedLogin === state.focusedLogin) {
        return state
      }
      return { ...state, focusedLogin, viewActive: true }
    }
    case "hide":
      return state.viewActive ? { ...state, viewActive: false } : state
    case "setChat":
      if (
        state.chatLogin === action.login ||
        !state.instances.some((instance) => instance.login === action.login)
      ) {
        return state
      }
      return { ...state, chatLogin: action.login }
    case "move": {
      const logins = state.instances.map((instance) => instance.login)
      return {
        ...state,
        layout: moveSplitLayoutPane({
          layout: state.layout,
          channels: logins,
          sourceChannel: action.sourceLogin,
          targetChannel: action.targetLogin,
          edge: action.edge,
        }),
      }
    }
    case "resize": {
      const logins = state.instances.map((instance) => instance.login)
      return {
        ...state,
        layout: resizeSplitLayoutChildren({
          layout: state.layout,
          channels: logins,
          path: action.path,
          sizes: action.sizes,
        }),
      }
    }
    case "reportMuted": {
      const instance = state.instances.find(
        (entry) => entry.login === action.login
      )
      if (!instance || instance.muted === action.muted) return state
      return {
        ...state,
        instances: state.instances.map((entry) =>
          entry.login === action.login
            ? { ...entry, muted: action.muted }
            : entry
        ),
      }
    }
  }
}
