import * as React from "react"
import { SearchIcon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { useIntersectionVisible } from "@/hooks/use-intersection-visible"
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion"
import type { PingMatchRange } from "@/lib/highlights/highlight-rules"
import { HighlightedText } from "@/lib/highlights/ping-match-mark"
import { LANDING_CHANNELS } from "@/lib/landing/landing-channels"
import { LANDING_EMOTES, type LandingEmote } from "@/lib/landing/landing-emotes"
import {
  findKeywordHighlightRanges,
  getChatSearchSuggestions,
  getChatSearchTokenAtCursor,
  isChatSearchQueryActive,
  mergeHighlightRanges,
  parseChatSearchQuery,
  replaceChatSearchToken,
  serializeChatSearchQuery,
  splitCommittedSearchQuery,
  type ChatSearchCommittedFilter,
  type ChatSearchSuggestion,
  type ChatSearchUsername,
} from "@/lib/search/chat-search"
import { cn } from "@/lib/utils"

type DemoMessagePart =
  { type: "text"; value: string } | { type: "emote"; emote: LandingEmote }

type DemoMessageTemplate = {
  userName: string
  displayName: string
  color: string
  timestamp: string
  parts: DemoMessagePart[]
}

type DemoMessage = DemoMessageTemplate & {
  id: string
  text: string
}

type DemoResult = {
  message: DemoMessage
  highlightRanges: PingMatchRange[]
  usernameHighlightRanges: PingMatchRange[]
}

const DHINKHA = {
  userName: LANDING_CHANNELS.dhinkha.displayName.toLowerCase(),
  displayName: LANDING_CHANNELS.dhinkha.displayName,
  color: "#f4a261",
}

const TARGET_MESSAGE_ID = "m3"

const MESSAGE_TEMPLATES: DemoMessageTemplate[] = [
  {
    userName: "catgoesmeow",
    displayName: "catgoesMEOW",
    color: "#8ab4ff",
    timestamp: "21:02",
    parts: [{ type: "text", value: "is this the last dungeon?" }],
  },
  {
    userName: "joemama",
    displayName: "joemama",
    color: "#7fd97f",
    timestamp: "21:02",
    parts: [
      { type: "text", value: "i think so " },
      { type: "emote", emote: LANDING_EMOTES.MikuStare },
    ],
  },
  {
    ...DHINKHA,
    timestamp: "21:03",
    parts: [
      { type: "text", value: "the boss fight is starting! " },
      { type: "emote", emote: LANDING_EMOTES.catJAM },
    ],
  },
  {
    userName: "bossmanjack",
    displayName: "BossmanJack",
    color: "#c77dff",
    timestamp: "21:04",
    parts: [
      { type: "text", value: "first time catching a stream live " },
      { type: "emote", emote: LANDING_EMOTES.widepeepoHappy },
    ],
  },
  {
    userName: "realviewer67",
    displayName: "Realviewer67",
    color: "#ff6b9d",
    timestamp: "21:05",
    parts: [{ type: "text", value: "wait that boss has three phases??" }],
  },
  {
    userName: "happytacos",
    displayName: "HappyTacos",
    color: "#56cfe1",
    timestamp: "21:06",
    parts: [{ type: "text", value: "im nothing like that depressedtacos guy" }],
  },
  {
    userName: "lurker1_01",
    displayName: "lurker1_01",
    color: "#a8dadc",
    timestamp: "21:07",
    parts: [{ type: "text", value: "still here, great stream" }],
  },
  {
    userName: "34_rules",
    displayName: "34_rules",
    color: "#ffd166",
    timestamp: "21:09",
    parts: [
      { type: "emote", emote: LANDING_EMOTES.KEKW },
      { type: "emote", emote: LANDING_EMOTES.KEKW },
      { type: "emote", emote: LANDING_EMOTES.KEKW },
    ],
  },
  {
    userName: "sadtacos",
    displayName: "SadTacos",
    color: "#e76f51",
    timestamp: "21:10",
    parts: [
      { type: "text", value: "chat is moving way too fast " },
      { type: "emote", emote: LANDING_EMOTES.Sadge },
    ],
  },
  {
    userName: "clipdnshipd",
    displayName: "clipdNshipd",
    color: "#9b8cff",
    timestamp: "21:12",
    parts: [
      { type: "text", value: "CLIP IT " },
      { type: "emote", emote: LANDING_EMOTES.KEKW },
    ],
  },
  {
    ...DHINKHA,
    timestamp: "21:14",
    parts: [
      { type: "text", value: "ok that boss was actually hard " },
      { type: "emote", emote: LANDING_EMOTES.Sadge },
    ],
  },
  {
    userName: "f0rtnite_bawls",
    displayName: "F0RTNITE_BAWLS",
    color: "#c77dff",
    timestamp: "21:15",
    parts: [
      { type: "emote", emote: LANDING_EMOTES.widepeepoHappy },
      { type: "text", value: " gg that was so clean" },
    ],
  },
  {
    userName: "catgoesmeow",
    displayName: "catgoesMEOW",
    color: "#8ab4ff",
    timestamp: "21:16",
    parts: [
      { type: "emote", emote: LANDING_EMOTES.om },
      { type: "text", value: " what's next?" },
    ],
  },
  {
    userName: "joemama",
    displayName: "joemama",
    color: "#7fd97f",
    timestamp: "21:16",
    parts: [{ type: "text", value: "any mods? someone is spamming" }],
  },
  {
    userName: "happytacos",
    displayName: "HappyTacos",
    color: "#56cfe1",
    timestamp: "21:17",
    parts: [
      { type: "text", value: "hydrate check " },
      { type: "emote", emote: LANDING_EMOTES.catJAM },
    ],
  },
  {
    userName: "lurker1_01",
    displayName: "lurker1_01",
    color: "#a8dadc",
    timestamp: "21:18",
    parts: [{ type: "text", value: "this run is going so well" }],
  },
  {
    userName: "realviewer67",
    displayName: "Realviewer67",
    color: "#ff6b9d",
    timestamp: "21:19",
    parts: [
      { type: "text", value: "chat be nice today " },
      { type: "emote", emote: LANDING_EMOTES.buh },
    ],
  },
  {
    userName: "34_rules",
    displayName: "34_rules",
    color: "#ffd166",
    timestamp: "21:20",
    parts: [{ type: "text", value: "W streamer" }],
  },
  {
    userName: "sadtacos",
    displayName: "SadTacos",
    color: "#e76f51",
    timestamp: "21:21",
    parts: [{ type: "text", value: "i missed the start, what happened?" }],
  },
  {
    userName: "clipdnshipd",
    displayName: "clipdNshipd",
    color: "#9b8cff",
    timestamp: "21:21",
    parts: [
      { type: "text", value: "scroll up it was crazy " },
      { type: "emote", emote: LANDING_EMOTES.ewphop },
    ],
  },
  {
    userName: "f0rtnite_bawls",
    displayName: "F0RTNITE_BAWLS",
    color: "#c77dff",
    timestamp: "21:22",
    parts: [{ type: "text", value: "chat is so cozy tonight" }],
  },
  {
    userName: "catgoesmeow",
    displayName: "catgoesMEOW",
    color: "#8ab4ff",
    timestamp: "21:23",
    parts: [
      { type: "emote", emote: LANDING_EMOTES.jakeS },
      { type: "text", value: " one more run?" },
    ],
  },
]

const MESSAGES: DemoMessage[] = MESSAGE_TEMPLATES.map((template, index) => ({
  ...template,
  id: `m${index + 1}`,
  text: template.parts
    .map((part) => (part.type === "text" ? part.value : part.emote.name))
    .join(""),
}))

const DEMO_USERNAMES: ChatSearchUsername[] = (() => {
  const seen = new Set<string>()
  const users: ChatSearchUsername[] = []
  for (let index = MESSAGES.length - 1; index >= 0; index -= 1) {
    const message = MESSAGES[index]
    if (!message || seen.has(message.userName)) {
      continue
    }
    seen.add(message.userName)
    users.push({
      userName: message.userName,
      displayName: message.displayName,
    })
  }
  return users
})()

const SEARCH_CHANNEL = LANDING_CHANNELS.rcwOwO

const DEMO_CHANNELS = [
  {
    login: SEARCH_CHANNEL.displayName.toLowerCase(),
    displayName: SEARCH_CHANNEL.displayName,
  },
]

const MAX_VISIBLE_SUGGESTIONS = 4
const MAX_VISIBLE_RESULTS = 8
const EMPTY_FILTERS: ChatSearchCommittedFilter[] = []
const EMPTY_STATE_FILTERS = ["in:*", "from:", "role:mod", "has:link"] as const

const KEYWORD = "boss"
const FILTER_TYPED = " from:dh"
const TYPED_FILTER_QUERY = `${KEYWORD}${FILTER_TYPED}`
const COMMITTED = splitCommittedSearchQuery(
  replaceChatSearchToken(
    TYPED_FILTER_QUERY,
    getChatSearchTokenAtCursor(TYPED_FILTER_QUERY, TYPED_FILTER_QUERY.length),
    `from:${DHINKHA.userName}`
  ).query
)

function getDemoSuggestions(remainder: string): ChatSearchSuggestion[] {
  return getChatSearchSuggestions({
    token: getChatSearchTokenAtCursor(remainder, remainder.length),
    query: remainder,
    parsed: parseChatSearchQuery(remainder),
    channels: DEMO_CHANNELS,
    usernames: DEMO_USERNAMES,
  }).slice(0, MAX_VISIBLE_SUGGESTIONS)
}

function searchDemoMessages(
  filters: ChatSearchCommittedFilter[],
  remainder: string
): DemoResult[] {
  const parsed = parseChatSearchQuery(
    serializeChatSearchQuery(filters, remainder)
  )
  if (!isChatSearchQueryActive(parsed)) {
    return []
  }

  const fromValues = parsed.filters
    .filter((filter) => filter.key === "from")
    .map((filter) => filter.value.replace(/^@/, "").toLowerCase())
  const results: DemoResult[] = []

  for (let index = MESSAGES.length - 1; index >= 0; index -= 1) {
    const message = MESSAGES[index]
    if (!message) {
      continue
    }

    if (
      fromValues.length > 0 &&
      !fromValues.some(
        (value) =>
          value === message.userName ||
          value === message.displayName.toLowerCase()
      )
    ) {
      continue
    }

    const highlightRanges: PingMatchRange[] = []
    const usernameHighlightRanges: PingMatchRange[] = []
    let matched = true

    for (const keyword of parsed.keywords) {
      const textRanges = findKeywordHighlightRanges(message.text, [keyword])
      const nameRanges = findKeywordHighlightRanges(message.displayName, [
        keyword,
      ])
      if (!textRanges?.length && !nameRanges?.length) {
        matched = false
        break
      }
      highlightRanges.push(...(textRanges ?? []))
      usernameHighlightRanges.push(...(nameRanges ?? []))
    }

    if (!matched) {
      continue
    }

    results.push({
      message,
      highlightRanges: mergeHighlightRanges(highlightRanges),
      usernameHighlightRanges: mergeHighlightRanges(usernameHighlightRanges),
    })
  }

  return results
}

type AnchorId = "search" | "suggestion" | "jump"

type Point = { x: number; y: number }

type CursorPoint = { anchor: AnchorId; dx?: number; dy?: number }

type CursorFrame = {
  from: CursorPoint
  to: CursorPoint
  t: number
  opacity: number
  pressing: boolean
}

type DemoFrame = {
  dialogVisibility: number
  filters: ChatSearchCommittedFilter[]
  remainder: string
  resultFilters: ChatSearchCommittedFilter[]
  resultRemainder: string
  showSuggestions: boolean
  typing: boolean
  searchPressed: boolean
  suggestionPressed: boolean
  targetHovered: boolean
  jumpPressed: boolean
  scroll: number
  highlight: number
  cursor: CursorFrame | null
}

type PhaseKind =
  | "idle"
  | "to-search"
  | "press-search"
  | "open"
  | "type-keyword"
  | "keyword-hold"
  | "type-filter"
  | "to-suggestion"
  | "press-suggestion"
  | "filtered-hold"
  | "to-jump"
  | "press-jump"
  | "scroll"
  | "jumped-hold"
  | "return"

type Phase = { kind: PhaseKind; duration: number }

const PHASES: Phase[] = [
  { kind: "idle", duration: 1100 },
  { kind: "to-search", duration: 700 },
  { kind: "press-search", duration: 420 },
  { kind: "open", duration: 320 },
  { kind: "type-keyword", duration: KEYWORD.length * 130 },
  { kind: "keyword-hold", duration: 1300 },
  { kind: "type-filter", duration: FILTER_TYPED.length * 105 },
  { kind: "to-suggestion", duration: 650 },
  { kind: "press-suggestion", duration: 420 },
  { kind: "filtered-hold", duration: 1100 },
  { kind: "to-jump", duration: 700 },
  { kind: "press-jump", duration: 420 },
  { kind: "scroll", duration: 700 },
  { kind: "jumped-hold", duration: 2600 },
  { kind: "return", duration: 800 },
]

const PROGRESS_RENDER_INTERVAL_MS = 32
const CLICK_MOMENT = 0.52
const SEARCH_CURSOR_START: CursorPoint = { anchor: "search", dx: -72, dy: 124 }
const SUGGESTION_CURSOR_START: CursorPoint = {
  anchor: "suggestion",
  dx: 56,
  dy: 96,
}

const BASE_FRAME: DemoFrame = {
  dialogVisibility: 0,
  filters: EMPTY_FILTERS,
  remainder: "",
  resultFilters: EMPTY_FILTERS,
  resultRemainder: "",
  showSuggestions: false,
  typing: false,
  searchPressed: false,
  suggestionPressed: false,
  targetHovered: false,
  jumpPressed: false,
  scroll: 0,
  highlight: 0,
  cursor: null,
}

const KEYWORD_FRAME: DemoFrame = {
  ...BASE_FRAME,
  dialogVisibility: 1,
  remainder: KEYWORD,
  resultRemainder: KEYWORD,
}

const TYPED_FILTER_FRAME: DemoFrame = {
  ...KEYWORD_FRAME,
  remainder: TYPED_FILTER_QUERY,
  showSuggestions: true,
}

const COMMITTED_FRAME: DemoFrame = {
  ...KEYWORD_FRAME,
  filters: COMMITTED.filters,
  remainder: COMMITTED.remainder,
  resultFilters: COMMITTED.filters,
  resultRemainder: COMMITTED.remainder,
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3)
}

function easeInCubic(t: number) {
  return t * t * t
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t
}

function typedSlice(text: string, progress: number) {
  return text.slice(0, Math.min(text.length, Math.ceil(progress * text.length)))
}

function isPressing(progress: number) {
  return progress >= 0.4 && progress <= 0.64
}

function afterClick(progress: number) {
  return Math.min(
    Math.max((progress - CLICK_MOMENT) / (1 - CLICK_MOMENT), 0),
    1
  )
}

function stationaryCursor(
  point: CursorPoint,
  options: { opacity?: number; pressing?: boolean } = {}
): CursorFrame {
  return {
    from: point,
    to: point,
    t: 1,
    opacity: options.opacity ?? 1,
    pressing: options.pressing ?? false,
  }
}

function computeFrame(kind: PhaseKind, progress: number): DemoFrame {
  switch (kind) {
    case "idle":
      return BASE_FRAME
    case "to-search":
      return {
        ...BASE_FRAME,
        cursor: {
          from: SEARCH_CURSOR_START,
          to: { anchor: "search" },
          t: easeInOutCubic(progress),
          opacity: Math.min(progress / 0.25, 1),
          pressing: false,
        },
      }
    case "press-search":
      return {
        ...BASE_FRAME,
        dialogVisibility: easeOutCubic(afterClick(progress)),
        searchPressed: isPressing(progress),
        cursor: stationaryCursor(
          { anchor: "search" },
          { pressing: isPressing(progress) }
        ),
      }
    case "open":
      return {
        ...BASE_FRAME,
        dialogVisibility: 1,
        cursor: stationaryCursor(
          { anchor: "search" },
          { opacity: 1 - easeOutCubic(progress) }
        ),
      }
    case "type-keyword": {
      const typed = typedSlice(KEYWORD, progress)
      return {
        ...KEYWORD_FRAME,
        remainder: typed,
        resultRemainder: typed,
        typing: true,
      }
    }
    case "keyword-hold":
      return KEYWORD_FRAME
    case "type-filter":
      return {
        ...TYPED_FILTER_FRAME,
        remainder: `${KEYWORD}${typedSlice(FILTER_TYPED, progress)}`,
        typing: true,
      }
    case "to-suggestion":
      return {
        ...TYPED_FILTER_FRAME,
        cursor: {
          from: SUGGESTION_CURSOR_START,
          to: { anchor: "suggestion" },
          t: easeInOutCubic(progress),
          opacity: Math.min(progress / 0.25, 1),
          pressing: false,
        },
      }
    case "press-suggestion": {
      const cursor = stationaryCursor(
        { anchor: "suggestion" },
        { pressing: isPressing(progress) }
      )
      if (progress < CLICK_MOMENT) {
        return {
          ...TYPED_FILTER_FRAME,
          suggestionPressed: isPressing(progress),
          cursor,
        }
      }
      return { ...COMMITTED_FRAME, cursor }
    }
    case "filtered-hold":
      return {
        ...COMMITTED_FRAME,
        cursor: stationaryCursor({ anchor: "suggestion" }),
      }
    case "to-jump":
      return {
        ...COMMITTED_FRAME,
        targetHovered: progress > 0.55,
        cursor: {
          from: { anchor: "suggestion" },
          to: { anchor: "jump" },
          t: easeInOutCubic(progress),
          opacity: 1,
          pressing: false,
        },
      }
    case "press-jump":
      return {
        ...COMMITTED_FRAME,
        dialogVisibility: 1 - easeInCubic(afterClick(progress)),
        targetHovered: true,
        jumpPressed: isPressing(progress),
        cursor: stationaryCursor(
          { anchor: "jump" },
          { pressing: isPressing(progress) }
        ),
      }
    case "scroll":
      return {
        ...COMMITTED_FRAME,
        dialogVisibility: 0,
        scroll: easeInOutCubic(progress),
        cursor: stationaryCursor(
          { anchor: "jump" },
          { opacity: 1 - easeOutCubic(Math.min(progress / 0.6, 1)) }
        ),
      }
    case "jumped-hold":
      return {
        ...BASE_FRAME,
        scroll: 1,
        highlight:
          progress < 0.45 ? 1 : 1 - easeInCubic((progress - 0.45) / 0.55),
      }
    case "return":
      return {
        ...BASE_FRAME,
        scroll: 1 - easeInOutCubic(progress),
      }
  }
}

const REDUCED_MOTION_FRAME: DemoFrame = COMMITTED_FRAME

function useSearchShowcaseAnimation(active: boolean, reducedMotion: boolean) {
  const [phaseIndex, setPhaseIndex] = React.useState(0)
  const [progress, setProgress] = React.useState(0)
  const activeRef = React.useRef(active)

  React.useEffect(() => {
    activeRef.current = active
  }, [active])

  const phase = PHASES[phaseIndex % PHASES.length] ?? PHASES[0]!

  React.useEffect(() => {
    if (!active || reducedMotion) {
      return
    }

    let frame = 0
    let start = performance.now()
    let lastRender = 0
    let pausedAt = 0
    const duration = phase.duration

    const tick = (now: number) => {
      if (!activeRef.current) {
        return
      }

      if (document.hidden) {
        if (pausedAt === 0) {
          pausedAt = now
        }
        frame = requestAnimationFrame(tick)
        return
      }

      if (pausedAt > 0) {
        start += now - pausedAt
        pausedAt = 0
      }

      const elapsed = now - start
      const linear = Math.min(elapsed / duration, 1)

      if (now - lastRender >= PROGRESS_RENDER_INTERVAL_MS || linear >= 1) {
        lastRender = now
        setProgress(linear)
      }

      if (linear < 1) {
        frame = requestAnimationFrame(tick)
        return
      }

      setPhaseIndex((current) => (current + 1) % PHASES.length)
      setProgress(0)
    }

    frame = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frame)
  }, [active, phase.duration, phaseIndex, reducedMotion])

  const frame = reducedMotion
    ? REDUCED_MOTION_FRAME
    : computeFrame(phase.kind, progress)

  return { frame, phaseIndex }
}

type DemoMetrics = {
  anchors: Partial<Record<AnchorId, Point>>
  maxScroll: number
  targetScroll: number
}

const INITIAL_METRICS: DemoMetrics = {
  anchors: {},
  maxScroll: 0,
  targetScroll: 0,
}

function pointsDiffer(left: Point | undefined, right: Point) {
  return (
    !left ||
    Math.abs(left.x - right.x) > 0.5 ||
    Math.abs(left.y - right.y) > 0.5
  )
}

function useSearchShowcaseMetrics(measureKey: number) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const searchButtonRef = React.useRef<HTMLSpanElement>(null)
  const suggestionRef = React.useRef<HTMLDivElement>(null)
  const jumpButtonRef = React.useRef<HTMLSpanElement>(null)
  const viewportRef = React.useRef<HTMLDivElement>(null)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const targetMessageRef = React.useRef<HTMLDivElement>(null)
  const [metrics, setMetrics] = React.useState<DemoMetrics>(INITIAL_METRICS)

  const measure = React.useCallback(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const containerRect = container.getBoundingClientRect()
    const measured: Partial<Record<AnchorId, Point>> = {}
    const anchorElements: [AnchorId, HTMLElement | null][] = [
      ["search", searchButtonRef.current],
      ["suggestion", suggestionRef.current],
      ["jump", jumpButtonRef.current],
    ]

    for (const [id, element] of anchorElements) {
      if (!element) {
        continue
      }
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) {
        continue
      }
      measured[id] = {
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.top + rect.height / 2 - containerRect.top,
      }
    }

    const viewport = viewportRef.current
    const content = contentRef.current
    const target = targetMessageRef.current
    let maxScroll = 0
    let targetScroll = 0
    if (viewport && content && target) {
      const viewportHeight = viewport.clientHeight
      const contentHeight = content.offsetHeight
      maxScroll = Math.max(0, contentHeight - viewportHeight)
      const centered =
        contentHeight -
        (target.offsetTop + target.offsetHeight / 2) -
        viewportHeight / 2
      targetScroll = Math.min(Math.max(centered, 0), maxScroll)
    }

    setMetrics((current) => {
      let changed =
        Math.abs(current.maxScroll - maxScroll) > 0.5 ||
        Math.abs(current.targetScroll - targetScroll) > 0.5
      const anchors = { ...current.anchors }
      for (const [id, point] of Object.entries(measured) as [
        AnchorId,
        Point,
      ][]) {
        if (pointsDiffer(anchors[id], point)) {
          anchors[id] = point
          changed = true
        }
      }
      return changed ? { anchors, maxScroll, targetScroll } : current
    })
  }, [])

  React.useLayoutEffect(() => {
    measure()
  }, [measure, measureKey])

  React.useEffect(() => {
    const observer = new ResizeObserver(measure)
    for (const element of [
      containerRef.current,
      viewportRef.current,
      contentRef.current,
    ]) {
      if (element) {
        observer.observe(element)
      }
    }
    window.addEventListener("resize", measure)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [measure])

  return {
    metrics,
    containerRef,
    searchButtonRef,
    suggestionRef,
    jumpButtonRef,
    viewportRef,
    contentRef,
    targetMessageRef,
  }
}

function resolveCursorPoint(
  point: CursorPoint,
  anchors: DemoMetrics["anchors"]
): Point | null {
  const anchor = anchors[point.anchor]
  if (!anchor) {
    return null
  }
  return { x: anchor.x + (point.dx ?? 0), y: anchor.y + (point.dy ?? 0) }
}

function renderMessageParts(message: DemoMessage, ranges: PingMatchRange[]) {
  let offset = 0
  const nodes: React.ReactNode[] = []

  for (const part of message.parts) {
    const key = `${message.id}-${offset}`
    if (part.type === "emote") {
      nodes.push(
        <img
          key={key}
          src={part.emote.url}
          alt={part.emote.name}
          className="mx-0.5 inline-block h-[1.35em] w-auto align-[-0.2em]"
          draggable={false}
        />
      )
      offset += part.emote.name.length
      continue
    }

    const start = offset
    const end = offset + part.value.length
    const localRanges = ranges
      .filter((range) => range.end > start && range.start < end)
      .map((range) => ({ start: range.start - start, end: range.end - start }))
    nodes.push(
      <span key={key}>
        <HighlightedText text={part.value} ranges={localRanges} />
      </span>
    )
    offset = end
  }

  return nodes
}

function DemoMessageRow({
  message,
  alternate,
  highlightRanges = [],
  usernameHighlightRanges = [],
  hovered,
  className,
  children,
  ref,
}: {
  message: DemoMessage
  alternate: boolean
  highlightRanges?: PingMatchRange[]
  usernameHighlightRanges?: PingMatchRange[]
  hovered?: boolean
  className?: string
  children?: React.ReactNode
  ref?: React.Ref<HTMLDivElement>
}) {
  return (
    <div
      ref={ref}
      className={cn(
        "chat-message chat-message-size relative px-2.5 py-0.5",
        alternate && "chat-message--alternate",
        className
      )}
      style={
        hovered
          ? {
              background:
                "color-mix(in oklch, var(--chat-background) 92%, var(--chat-message-foreground))",
            }
          : undefined
      }
    >
      <span className="chat-timestamp mr-1.5 text-[0.85em] tabular-nums">
        {message.timestamp}
      </span>
      <span className="font-semibold" style={{ color: message.color }}>
        <HighlightedText
          text={message.displayName}
          ranges={usernameHighlightRanges}
        />
      </span>
      <span className="chat-colon mx-0.5">:</span>
      <span className="chat-message-text">
        {renderMessageParts(message, highlightRanges)}
      </span>
      {children}
    </div>
  )
}

function DemoCursor({
  left,
  top,
  pressing,
  opacity,
}: {
  left: number
  top: number
  pressing?: boolean
  opacity?: number
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-30 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow-lg motion-safe:animate-pulse",
        pressing && "scale-90"
      )}
      style={{ left, top, opacity }}
      aria-hidden
    />
  )
}

function SearchShowcaseChat({
  frame,
  metrics,
  searchButtonRef,
  viewportRef,
  contentRef,
  targetMessageRef,
}: {
  frame: DemoFrame
  metrics: DemoMetrics
  searchButtonRef: React.RefObject<HTMLSpanElement | null>
  viewportRef: React.RefObject<HTMLDivElement | null>
  contentRef: React.RefObject<HTMLDivElement | null>
  targetMessageRef: React.RefObject<HTMLDivElement | null>
}) {
  const scrollOffset = lerp(0, metrics.targetScroll, frame.scroll)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border bg-sidebar px-3">
        <div className="flex min-w-0 items-center gap-2">
          <img
            src={SEARCH_CHANNEL.profileImageUrl}
            alt=""
            className="size-6 shrink-0 rounded-full object-cover"
          />
          <span className="truncate text-sm font-medium">
            {SEARCH_CHANNEL.displayName}
          </span>
        </div>
        <span
          ref={searchButtonRef}
          className={cn(
            "flex h-7 shrink-0 items-center gap-1.5 rounded-[min(var(--radius-md),12px)] border border-border bg-background px-1.5 text-sm transition-transform dark:border-input dark:bg-input/30",
            frame.searchPressed && "scale-90 bg-muted"
          )}
        >
          <SearchIcon className="size-3.5" />
          <span className="hidden font-medium sm:inline">Search</span>
        </span>
      </header>

      <div
        ref={viewportRef}
        className="chat-presentation chat-presentation--alternating-rows relative min-h-0 flex-1 overflow-hidden"
      >
        <div
          ref={contentRef}
          className="absolute inset-x-0 bottom-0 py-1"
          style={{ transform: `translate3d(0, ${scrollOffset}px, 0)` }}
        >
          {MESSAGES.map((message, index) => {
            const isTarget = message.id === TARGET_MESSAGE_ID
            return (
              <DemoMessageRow
                key={message.id}
                ref={isTarget ? targetMessageRef : undefined}
                message={message}
                alternate={index % 2 === 1}
              >
                {isTarget && frame.highlight > 0.01 ? (
                  <span
                    className="pointer-events-none absolute inset-0 bg-[color-mix(in_oklch,var(--primary)_22%,transparent)] shadow-[inset_3px_0_0_var(--primary)]"
                    style={{ opacity: frame.highlight }}
                  />
                ) : null}
              </DemoMessageRow>
            )
          })}
        </div>
      </div>

      <div className="h-9 shrink-0 border-t border-border/60 bg-(--chat-background) px-2.5 py-1.5">
        <div className="h-full rounded-md border border-border/50 bg-background/40" />
      </div>
    </div>
  )
}

function SearchShowcaseField({
  frame,
  hasQuery,
}: {
  frame: DemoFrame
  hasQuery: boolean
}) {
  const showPlaceholder = frame.filters.length === 0 && frame.remainder === ""
  const caret = (
    <span
      className={cn(
        "inline-block h-4 w-px shrink-0 bg-foreground align-middle",
        !frame.typing && "motion-safe:animate-pulse"
      )}
    />
  )

  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-lg border border-ring bg-transparent px-2 py-1 ring-3 ring-ring/50 dark:bg-input/30">
      {frame.filters.map((filter, index) => (
        <Badge
          key={`${filter.key}:${filter.value}:${index}`}
          className="h-5 max-w-full rounded-md px-1.5 font-medium motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-90"
        >
          {filter.key}:{filter.value}
        </Badge>
      ))}
      <span className="flex min-w-[8ch] flex-1 items-center overflow-hidden px-0.5 py-0.5 text-sm whitespace-pre">
        {showPlaceholder ? (
          <>
            {caret}
            <span className="truncate text-muted-foreground">
              Start typing or use filters...
            </span>
          </>
        ) : (
          <>
            <span className="truncate">{frame.remainder}</span>
            {caret}
          </>
        )}
      </span>
      {hasQuery ? (
        <span className="ml-auto flex size-6 shrink-0 items-center justify-center text-muted-foreground">
          <XIcon className="size-3.5" />
        </span>
      ) : null}
    </div>
  )
}

function SearchShowcaseSuggestions({
  suggestions,
  pressed,
  suggestionRef,
}: {
  suggestions: ChatSearchSuggestion[]
  pressed: boolean
  suggestionRef: React.RefObject<HTMLDivElement | null>
}) {
  if (suggestions.length === 0) {
    return null
  }

  return (
    <div className="absolute inset-x-3 top-full z-20 -mt-1.5 overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10">
      <div className="p-1">
        {suggestions.map((suggestion, index) => (
          <div
            key={suggestion.id}
            ref={index === 0 ? suggestionRef : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-transform",
              index === 0 && "bg-accent text-accent-foreground",
              index === 0 && pressed && "scale-[0.98]"
            )}
          >
            <span className="shrink-0 font-mono text-xs font-medium">
              {suggestion.label}
            </span>
            <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">
              {suggestion.description}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SearchShowcaseEmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
        <SearchIcon className="size-4 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">Search messages</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Searches messages currently loaded in chat.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-1.5">
        {EMPTY_STATE_FILTERS.map((insert) => (
          <span
            key={insert}
            className="inline-flex h-6 items-center rounded-[min(var(--radius-md),10px)] border border-border bg-background px-2 font-mono text-xs font-medium dark:border-input dark:bg-input/30"
          >
            {insert}
          </span>
        ))}
      </div>
    </div>
  )
}

function SearchShowcaseDialog({
  frame,
  suggestionRef,
  jumpButtonRef,
}: {
  frame: DemoFrame
  suggestionRef: React.RefObject<HTMLDivElement | null>
  jumpButtonRef: React.RefObject<HTMLSpanElement | null>
}) {
  const hasQuery = isChatSearchQueryActive(
    parseChatSearchQuery(
      serializeChatSearchQuery(frame.filters, frame.remainder)
    )
  )
  const results = React.useMemo(
    () => searchDemoMessages(frame.resultFilters, frame.resultRemainder),
    [frame.resultFilters, frame.resultRemainder]
  )
  const suggestions = React.useMemo(
    () => (frame.showSuggestions ? getDemoSuggestions(frame.remainder) : []),
    [frame.remainder, frame.showSuggestions]
  )
  const resultsActive = isChatSearchQueryActive(
    parseChatSearchQuery(
      serializeChatSearchQuery(frame.resultFilters, frame.resultRemainder)
    )
  )

  return (
    <div
      className="absolute inset-x-2.5 top-2.5 bottom-2.5 z-20 flex flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-[0_18px_40px_-12px_oklch(0_0_0/60%)] ring-1 ring-foreground/10 sm:inset-x-6 sm:top-4 sm:bottom-4"
      style={{
        opacity: frame.dialogVisibility,
        transform: `scale(${0.95 + frame.dialogVisibility * 0.05})`,
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border py-2 pr-2 pl-4">
        <p className="truncate text-sm font-medium">Search</p>
        <div className="flex min-w-0 items-center gap-2">
          {resultsActive ? (
            <p className="truncate text-xs text-muted-foreground tabular-nums">
              {results.length} {results.length === 1 ? "result" : "results"}
            </p>
          ) : null}
          <img
            src={SEARCH_CHANNEL.profileImageUrl}
            alt=""
            className="mx-1 size-6 shrink-0 rounded-full object-cover"
          />
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[min(var(--radius-md),12px)] border border-border bg-background dark:border-input dark:bg-input/30">
            <XIcon className="size-4" />
          </span>
        </div>
      </div>

      <div className="relative z-10 shrink-0 border-b border-border px-3 py-3 sm:px-4">
        <SearchShowcaseField frame={frame} hasQuery={hasQuery} />
        <SearchShowcaseSuggestions
          suggestions={suggestions}
          pressed={frame.suggestionPressed}
          suggestionRef={suggestionRef}
        />
      </div>

      <div className="chat-presentation chat-presentation--alternating-rows flex min-h-0 flex-1 flex-col overflow-hidden">
        {resultsActive ? (
          results.length > 0 ? (
            <div className="pt-3">
              {results.slice(0, MAX_VISIBLE_RESULTS).map((result, index) => {
                const isTarget = result.message.id === TARGET_MESSAGE_ID
                const hovered = isTarget && frame.targetHovered
                return (
                  <DemoMessageRow
                    key={result.message.id}
                    message={result.message}
                    alternate={index % 2 === 1}
                    highlightRanges={result.highlightRanges}
                    usernameHighlightRanges={result.usernameHighlightRanges}
                    hovered={hovered}
                    className="py-1 motion-safe:animate-in motion-safe:duration-200 motion-safe:fade-in-0 motion-safe:slide-in-from-top-1"
                  >
                    {isTarget ? (
                      <span
                        className={cn(
                          "absolute top-0 right-2 z-10 -translate-y-1/2 rounded-md bg-background/80 p-0.5 shadow-sm ring-1 ring-border/40 backdrop-blur-sm transition-opacity duration-150",
                          hovered ? "opacity-100" : "opacity-0"
                        )}
                      >
                        <span
                          ref={jumpButtonRef}
                          className={cn(
                            "flex h-6 items-center rounded-md px-2 text-xs font-medium text-muted-foreground transition-transform",
                            frame.jumpPressed &&
                              "scale-95 bg-muted text-foreground"
                          )}
                        >
                          Jump
                        </span>
                      </span>
                    ) : null}
                  </DemoMessageRow>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
              <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
                <SearchIcon className="size-4 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                No messages found.
              </p>
            </div>
          )
        ) : (
          <SearchShowcaseEmptyState />
        )}
      </div>
    </div>
  )
}

function SearchShowcaseDemo() {
  const reducedMotion = usePrefersReducedMotion()
  const { ref: visibilityRef, visible } =
    useIntersectionVisible<HTMLDivElement>({
      rootMargin: "120px",
    })
  const { frame, phaseIndex } = useSearchShowcaseAnimation(
    visible,
    reducedMotion
  )
  const {
    metrics,
    containerRef,
    searchButtonRef,
    suggestionRef,
    jumpButtonRef,
    viewportRef,
    contentRef,
    targetMessageRef,
  } = useSearchShowcaseMetrics(phaseIndex)

  const mergedRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node
      visibilityRef(node)
    },
    [containerRef, visibilityRef]
  )

  const cursor = frame.cursor
  const cursorFrom = cursor
    ? resolveCursorPoint(cursor.from, metrics.anchors)
    : null
  const cursorTo = cursor
    ? resolveCursorPoint(cursor.to, metrics.anchors)
    : null
  const cursorPosition =
    cursor && cursorFrom && cursorTo && cursor.opacity > 0.01
      ? {
          left: lerp(cursorFrom.x, cursorTo.x, cursor.t),
          top: lerp(cursorFrom.y, cursorTo.y, cursor.t),
        }
      : null

  return (
    <div
      ref={mergedRef}
      className="relative mx-auto w-full max-w-136"
      aria-hidden
    >
      <div className="relative h-92 overflow-hidden rounded-lg border border-border/85 bg-background shadow-[0_2px_4px_oklch(0_0_0/22%),0_18px_40px_-14px_oklch(0_0_0/48%)] sm:h-96">
        <SearchShowcaseChat
          frame={frame}
          metrics={metrics}
          searchButtonRef={searchButtonRef}
          viewportRef={viewportRef}
          contentRef={contentRef}
          targetMessageRef={targetMessageRef}
        />

        {frame.dialogVisibility > 0.01 ? (
          <>
            <div
              className="absolute inset-0 z-10 bg-black/10 supports-backdrop-filter:backdrop-blur-xs"
              style={{ opacity: frame.dialogVisibility }}
            />
            <SearchShowcaseDialog
              frame={frame}
              suggestionRef={suggestionRef}
              jumpButtonRef={jumpButtonRef}
            />
          </>
        ) : null}
      </div>

      {cursor && cursorPosition ? (
        <DemoCursor
          left={cursorPosition.left}
          top={cursorPosition.top}
          opacity={cursor.opacity}
          pressing={cursor.pressing}
        />
      ) : null}
    </div>
  )
}

const FILTER_TOKENS = ["from:", "in:", "role:", "has:"] as const

export function SearchShowcaseSection() {
  return (
    <section id="search" className="relative">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_40%_50%_at_75%_50%,color-mix(in_oklch,var(--primary)_13%,transparent),transparent_70%)]"
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-6xl px-6 py-16 lg:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <div className="max-w-xl">
            <h2 className="font-landing-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Find that one message
              <br />
              <span className="text-primary">in seconds.</span>
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Search everything loaded in your chats. Filter by user, channel,
              role or content, then jump straight to the moment it was sent.
            </p>

            <ul className="mt-6 flex flex-wrap gap-2" aria-label="Filters">
              {FILTER_TOKENS.map((token) => (
                <li
                  key={token}
                  className="rounded-md border border-primary/25 bg-primary/10 px-2 py-1 font-mono text-xs text-primary"
                >
                  {token}
                </li>
              ))}
            </ul>
          </div>

          <SearchShowcaseDemo />
        </div>
      </div>
    </section>
  )
}
